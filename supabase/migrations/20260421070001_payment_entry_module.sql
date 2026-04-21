alter table public.receipts
	add column if not exists received_by text;

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
	allocation_amount integer;
	remaining_amount integer;
	daily_sequence integer;
	candidate_receipt_number text;
	candidate_receipt_id uuid;
	total_outstanding integer;
	normalized_prefix text;
begin
	if p_total_amount is null or p_total_amount <= 0 then
		raise exception 'Payment amount must be greater than 0.';
	end if;

	if p_payment_date is null then
		raise exception 'Payment date is required.';
	end if;

	if p_student_id is null then
		raise exception 'Student is required.';
	end if;

	if not exists (select 1 from public.students where id = p_student_id) then
		raise exception 'Selected student was not found.';
	end if;

	normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

	if normalized_prefix is null then
		normalized_prefix := 'SVP';
	end if;

	select coalesce(sum(outstanding_amount), 0)
	into total_outstanding
	from public.v_installment_balances
	where student_id = p_student_id
		and outstanding_amount > 0;

	if total_outstanding <= 0 then
		raise exception 'No pending dues are available for this student.';
	end if;

	if p_total_amount > total_outstanding then
		raise exception 'Payment amount cannot exceed total pending amount.';
	end if;

	select coalesce(
		max((regexp_match(receipt_number, '-([0-9]{4})$'))[1]::integer),
		0
	)
	into daily_sequence
	from public.receipts
	where receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

	for _attempt in 1..12 loop
		daily_sequence := daily_sequence + 1;
		candidate_receipt_number :=
			normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(daily_sequence::text, 4, '0');

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
				candidate_receipt_number,
				p_student_id,
				p_payment_date,
				p_payment_mode,
				p_total_amount,
				nullif(trim(coalesce(p_reference_number, '')), ''),
				nullif(trim(coalesce(p_remarks, '')), ''),
				nullif(trim(coalesce(p_received_by, '')), '')
			)
			returning id into candidate_receipt_id;

			exit;
		exception
			when unique_violation then
				continue;
		end;
	end loop;

	if candidate_receipt_id is null then
		raise exception 'Unable to generate a unique receipt number. Please retry.';
	end if;

	remaining_amount := p_total_amount;

	for balance_row in
		select installment_id, outstanding_amount
		from public.v_installment_balances
		where student_id = p_student_id
			and outstanding_amount > 0
		order by due_date asc, installment_no asc
	loop
		exit when remaining_amount <= 0;

		allocation_amount := least(remaining_amount, balance_row.outstanding_amount);

		if allocation_amount <= 0 then
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
			candidate_receipt_id,
			p_student_id,
			balance_row.installment_id,
			allocation_amount,
			nullif(trim(coalesce(p_remarks, '')), '')
		);

		remaining_amount := remaining_amount - allocation_amount;
	end loop;

	if remaining_amount <> 0 then
		raise exception 'Unable to allocate payment cleanly. Please retry.';
	end if;

	return query
	select
		candidate_receipt_id as receipt_id,
		candidate_receipt_number as receipt_number,
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

