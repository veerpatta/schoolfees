-- Speed up today's collection query (hits receipts by payment_date).
CREATE INDEX IF NOT EXISTS idx_receipts_payment_date
  ON receipts (payment_date DESC);

-- Speed up per-student receipt history.
CREATE INDEX IF NOT EXISTS idx_receipts_student_id_created_at
  ON receipts (student_id, created_at DESC);

-- Speed up duplicate receipt check (student_id + date + mode + amount in last 60s).
CREATE INDEX IF NOT EXISTS idx_receipts_duplicate_check
  ON receipts (student_id, payment_date, payment_mode, total_amount, created_at);

-- Speed up countNonCancelledInstallments.
CREATE INDEX IF NOT EXISTS idx_installments_student_id_status
  ON installments (student_id, status)
  WHERE status != 'cancelled';

-- Speed up import batch alerts (recent batches with issues).
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at
  ON import_batches (created_at DESC);

-- Speed up ledger regeneration alerts.
CREATE INDEX IF NOT EXISTS idx_ledger_regen_batches_created_at
  ON ledger_regeneration_batches (created_at DESC);
