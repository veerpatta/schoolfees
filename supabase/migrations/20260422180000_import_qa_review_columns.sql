-- Add review and anomaly tracking columns to import_rows
-- These support the QA workflow: per-row review status, staff notes,
-- review timestamps, and anomaly category classification.

alter table public.import_rows
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'hold', 'skipped')),
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists anomaly_categories jsonb not null default '[]'::jsonb;

alter table public.import_rows
  add constraint import_rows_anomaly_categories_array
    check (jsonb_typeof(anomaly_categories) = 'array');

create index if not exists idx_import_rows_review_status
on public.import_rows (batch_id, review_status)
where review_status <> 'pending';
