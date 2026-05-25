alter table public.fee_policy_configs
  add column if not exists academic_fee_distribution text not null default 'first_only';

alter table public.fee_policy_configs
  drop constraint if exists fee_policy_configs_academic_fee_distribution_check;

alter table public.fee_policy_configs
  add constraint fee_policy_configs_academic_fee_distribution_check
  check (academic_fee_distribution in ('first_only', 'equal'));

comment on column public.fee_policy_configs.academic_fee_distribution is
  'How academic fee is allocated across installments in the workbook calculation model. first_only: full amount in installment 1 (default). equal: split equally across all installments.';
