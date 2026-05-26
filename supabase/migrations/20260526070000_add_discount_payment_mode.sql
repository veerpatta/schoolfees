-- Adds 'discount' as a payment_mode value so that pure-discount close-outs
-- (no cash collected) can be recorded as a receipt with mode='discount'.
-- The amount allocates across overdue installments via payments rows, so the
-- workbook view naturally reduces pending. Day Close cash totals filter out
-- this mode to avoid inflating collected cash.
--
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block on older
-- PostgreSQL versions. Supabase (PG 15+) supports IF NOT EXISTS.

alter type public.payment_mode add value if not exists 'discount';
