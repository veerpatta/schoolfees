-- Speed up lateral join on payment adjustments in workbook views.
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_installment_id
  ON public.payment_adjustments (installment_id, amount_delta);
