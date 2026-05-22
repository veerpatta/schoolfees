-- Index for receipt adjustments in workbook views
CREATE INDEX IF NOT EXISTS idx_receipt_adjustments_installment_id
  ON public.receipt_adjustments (installment_id, amount_delta);

-- Index for refund requests by student
CREATE INDEX IF NOT EXISTS idx_refund_requests_student_id
  ON public.refund_requests (student_id);

-- Index for test refund requests by student
CREATE INDEX IF NOT EXISTS idx_test_refund_requests_student_id
  ON test.refund_requests (student_id);

-- Index for receipt finance adjustments by student
CREATE INDEX IF NOT EXISTS idx_receipt_finance_adjustments_student_id
  ON public.receipt_finance_adjustments (student_id);

-- Index for config change blocked installments by installment
CREATE INDEX IF NOT EXISTS idx_config_change_blocked_installments_installment_id
  ON public.config_change_blocked_installments (installment_id);

-- Index for student conventional discount assignments family group
CREATE INDEX IF NOT EXISTS idx_student_conventional_discount_assignments_family_group
  ON public.student_conventional_discount_assignments (family_group_id);

-- Index for test student conventional discount assignments family group
CREATE INDEX IF NOT EXISTS idx_test_student_conventional_discount_assignments_family_group
  ON test.student_conventional_discount_assignments (family_group_id);
