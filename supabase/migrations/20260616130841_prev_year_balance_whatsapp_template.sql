-- Adds a WhatsApp reminder template that explicitly separates a carried-forward
-- previous-year balance from current-year installment dues, so collectors can
-- message families about old dues without conflating them with this year's
-- schedule. Uses the same {{token}} convention as the existing seeds and is
-- idempotent (guarded by name).

insert into whatsapp_templates (name, body, placeholders, category)
select
  'Previous-year balance reminder',
  'Namaste {{fatherName}} ji,' || E'\n\n' ||
  'Our records show a previous-year (2025-26) fee balance still pending for {{studentName}} ({{className}}). This is separate from the current-year installments and carries NO late fee.' || E'\n\n' ||
  'Total currently pending (including the previous-year balance): {{pending}}.' || E'\n' ||
  'Kindly clear it at your convenience, or visit the fee office to discuss a plan.' || E'\n\n' ||
  'UPI payment link: {{paymentLink}}' || E'\n' ||
  'Reference: {{paymentReference}}' || E'\n' ||
  'After payment, please share the UPI screenshot/UTR. Receipt will be posted from Payment Desk after office verification.' || E'\n\n' ||
  'Regards,' || E'\n' ||
  'Shri Veer Patta Senior Secondary School',
  '{studentName,className,pending,fatherName,paymentLink,paymentReference}',
  'reminder'
where not exists (
  select 1 from whatsapp_templates where name = 'Previous-year balance reminder'
);
