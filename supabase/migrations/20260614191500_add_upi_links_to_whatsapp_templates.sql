-- Add free UPI payment placeholders to existing starter reminder templates.
-- This only changes the two seed templates and leaves custom staff templates alone.

update public.whatsapp_templates
set
  body = body || E'\n\n' ||
    'UPI payment link: {{paymentLink}}' || E'\n' ||
    'Reference: {{paymentReference}}' || E'\n' ||
    'After payment, please share the UPI screenshot/UTR. Receipt will be posted from Payment Desk after office verification.',
  placeholders = array(
    select distinct token
    from unnest(placeholders || array['paymentLink', 'paymentReference']::text[]) as token
  ),
  updated_at = now()
where name in ('Friendly reminder', 'Final reminder')
  and body not like '%{{paymentLink}}%';
