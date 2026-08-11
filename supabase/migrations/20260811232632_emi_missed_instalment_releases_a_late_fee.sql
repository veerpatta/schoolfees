-- Policy change: an EMI plan DEFERS late fees, it does not forgive them.
--
-- Activation still waives every late fee on the covered installments, so a
-- family that keeps to the calendar pays none. But each monthly EMI that goes
-- past its due date unpaid RELEASES one of those waivers, oldest covered
-- installment first, and the ordinary late-fee engine charges it.
--
-- Why release a waiver rather than invent a new charge: the school's rule is
-- Rs 1,000 flat per overdue installment and the engine already implements it
-- end to end — collectable at the Payment Desk, visible on statements,
-- receipts and Defaulters, refundable, auditable. A parallel "EMI penalty"
-- ledger would need all of that rebuilt.
--
-- SUPERSEDED IN THE SAME SESSION. This first cut carried a dead loop that read
-- a non-existent record field and would have raised the moment a plan actually
-- had a missed EMI. It is recorded here because it was applied; the working
-- definition arrives in 20260811232703 and is corrected again in
-- 20260811232956. No plan existed in any session while it was live.
create or replace function public.sync_repayment_plan_late_fees(
  p_session_label text default null,
  p_dry_run boolean default false
)
returns table (
  plan_id uuid,
  student_id uuid,
  missed_instalments integer,
  already_released integer,
  released_now integer,
  capped_by_installment_count boolean
)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  -- Body intentionally not reproduced: it was replaced within minutes and
  -- never ran against a plan. 20260811232703 supplies the real implementation.
  raise exception 'superseded by 20260811232703_emi_late_fee_release_clean_implementation';
end;
$function$;
