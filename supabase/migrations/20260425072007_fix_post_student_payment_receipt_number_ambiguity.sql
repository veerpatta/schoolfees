create or replace function public.post_student_payment(
	p_student_id uuid,
	p_payment_date date,
	p_payment_mode public.payment_mode,
	p_total_amount integer,
	p_reference_number text default null,
	p_remarks text default null,
	p_received_by text default null,
	p_receipt_prefix text default 'SVP'
)
returns table (
	receipt_id uuid,
	receipt_number text,
	allocated_total integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
	balance_row record;
	v_allocation_amount integer;
	v_remaining_amount integer;
	v_daily_sequence integer;
	v_candidate_receipt_number text;
	v_candidate_receipt_id uuid;
	v_total_outstanding integer;
	v_normalized_prefix text;
	v_active_policy_model text;
	v_active_policy_session text;
	v_student_session_label text;
	v_use_workbook_mode boolean := false;
begin
	if not public.has_permission('payments:write') then
		raise exception 'You do not have permission to post payments.';
	end if;

	if p_total_amount is null or p_total_amount <= 0 then
		raise exception 'Payment amount must be greater than 0.';
	end if;

	if p_payment_date is null then
		raise exception 'Payment date is required.';
	end if;

	if p_student_id is null then
		raise exception 'Student is required.';
	end if;

	select c.session_label
	into v_student_session_label
	from public.students as s
	join public.classes as c
		on c.id = s.class_id
	where s.id = p_student_id;

	if v_student_session_label is null then
		raise exception 'Selected student was not found.';
	end if;

	select fpc.calculation_model, fpc.academic_session_label
	into v_active_policy_model, v_active_policy_session
	from public.fee_policy_configs as fpc
	where fpc.is_active = true
	order by fpc.updated_at desc
	limit 1;

	v_use_workbook_mode :=
		v_active_policy_model = 'workbook_v1'
		and v_student_session_label = v_active_policy_session;

	v_normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

	if v_normalized_prefix is null then
		v_normalized_prefix := 'SVP';
	end if;

	if v_use_workbook_mode then
		select coalesce(sum(snapshot_row.pending_amount), 0)
		into v_total_outstanding
		from private.workbook_installment_snapshot(
			p_student_id,
			p_payment_date,
			true
		) as snapshot_row
		where snapshot_row.pending_amount > 0;
	else
		select coalesce(sum(balance_view.outstanding_amount), 0)
		into v_total_outstanding
		from public.v_installment_balances as balance_view
		where balance_view.student_id = p_student_id
			and balance_view.outstanding_amount > 0;
	end if;

	if v_total_outstanding <= 0 then
		raise exception 'No pending dues are available for this student.';
	end if;

	if p_total_amount > v_total_outstanding then
		raise exception 'Payment amount cannot exceed total pending amount.';
	end if;

	select coalesce(
		max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer),
		0
	)
	into v_daily_sequence
	from public.receipts as receipt_row
	where receipt_row.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

	for _attempt in 1..12 loop
		v_daily_sequence := v_daily_sequence + 1;
		v_candidate_receipt_number :=
			v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(v_daily_sequence::text, 4, '0');

		begin
			insert into public.receipts (
				receipt_number,
				student_id,
				payment_date,
				payment_mode,
				total_amount,
				reference_number,
				notes,
				received_by
			)
			values (
				v_candidate_receipt_number,
				p_student_id,
				p_payment_date,
				p_payment_mode,
				p_total_amount,
				nullif(trim(coalesce(p_reference_number, '')), ''),
				nullif(trim(coalesce(p_remarks, '')), ''),
				nullif(trim(coalesce(p_received_by, '')), '')
			)
			returning id into v_candidate_receipt_id;

			exit;
		exception
			when unique_violation then
				continue;
		end;
	end loop;

	if v_candidate_receipt_id is null then
		raise exception 'Unable to generate a unique receipt number. Please retry.';
	end if;

	v_remaining_amount := p_total_amount;

	if v_use_workbook_mode then
		for balance_row in
			select
				snapshot_row.installment_id,
				snapshot_row.pending_amount
			from private.workbook_installment_snapshot(
				p_student_id,
				p_payment_date,
				true
			) as snapshot_row
			where snapshot_row.pending_amount > 0
			order by snapshot_row.due_date asc, snapshot_row.installment_no asc
		loop
			exit when v_remaining_amount <= 0;

			v_allocation_amount := least(v_remaining_amount, balance_row.pending_amount);

			if v_allocation_amount <= 0 then
				continue;
			end if;

			insert into public.payments (
				receipt_id,
				student_id,
				installment_id,
				amount,
				notes
			)
			values (
				v_candidate_receipt_id,
				p_student_id,
				balance_row.installment_id,
				v_allocation_amount,
				nullif(trim(coalesce(p_remarks, '')), '')
			);

			v_remaining_amount := v_remaining_amount - v_allocation_amount;
		end loop;
	else
		for balance_row in
			select
				balance_view.installment_id,
				balance_view.outstanding_amount
			from public.v_installment_balances as balance_view
			where balance_view.student_id = p_student_id
				and balance_view.outstanding_amount > 0
			order by balance_view.due_date asc, balance_view.installment_no asc
		loop
			exit when v_remaining_amount <= 0;

			v_allocation_amount := least(v_remaining_amount, balance_row.outstanding_amount);

			if v_allocation_amount <= 0 then
				continue;
			end if;

			insert into public.payments (
				receipt_id,
				student_id,
				installment_id,
				amount,
				notes
			)
			values (
				v_candidate_receipt_id,
				p_student_id,
				balance_row.installment_id,
				v_allocation_amount,
				nullif(trim(coalesce(p_remarks, '')), '')
			);

			v_remaining_amount := v_remaining_amount - v_allocation_amount;
		end loop;
	end if;

	if v_remaining_amount <> 0 then
		raise exception 'Unable to allocate payment cleanly. Please retry.';
	end if;

	return query
	select
		v_candidate_receipt_id as receipt_id,
		v_candidate_receipt_number as receipt_number,
		p_total_amount as allocated_total;
end;
$$;

grant execute on function public.post_student_payment(
	uuid,
	date,
	public.payment_mode,
	integer,
	text,
	text,
	text,
	text
) to authenticated;
