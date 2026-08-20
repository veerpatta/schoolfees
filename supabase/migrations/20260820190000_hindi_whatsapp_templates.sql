-- Hindi twins for every WhatsApp template in the library.
--
-- The library was entirely English. Parents already receive the fee reminder in
-- Hindi through the AiSensy campaign, so every manual wa.me follow-up sent from
-- this library arrived in a different language from the automated one. These
-- four are the same messages in the register the approved template uses
-- ("प्रिय … जी", "श्री वीर पत्ता सीनियर सेकेंडरी स्कूल").
--
-- One deliberate difference from the AiSensy body: the deadline is {{dueDate}}
-- rather than a hardcoded "25 अगस्त 2026". A Meta-approved template cannot take
-- a date variable, which is why the campaign body hardcodes it and goes stale;
-- this library has no such constraint, so the message stays true.
--
-- {{pending}} and {{amount}} already render with the rupee glyph, so the body
-- does not add "रु." — that would double it.
--
-- Named "<English name> (हिंदी)" so each sorts directly after its English twin
-- under the list's (category, name) ordering. Idempotent, guarded by name, in
-- the style of 20260616130841.

insert into whatsapp_templates (name, body, placeholders, category)
select
  'Friendly reminder (हिंदी)',
  $body$*फीस सूचना*
प्रिय {{fatherName}} जी,

श्री वीर पत्ता सीनियर सेकेंडरी स्कूल की ओर से सूचित किया जाता है कि {{studentName}} ({{className}}) की फीस अभी बकाया है।

देय राशि: {{pending}}
अंतिम तिथि: {{dueDate}}

कृपया {{dueDate}} तक यह राशि जमा करें। किसी भी जानकारी हेतु विद्यालय के फीस कार्यालय से संपर्क करें।

UPI भुगतान लिंक: {{paymentLink}}
संदर्भ: {{paymentReference}}
भुगतान के बाद कृपया UPI स्क्रीनशॉट/UTR भेजें। कार्यालय द्वारा सत्यापन के बाद रसीद जारी की जाएगी।

सधन्यवाद,
श्री वीर पत्ता सीनियर सेकेंडरी स्कूल$body$,
  '{className,dueDate,fatherName,paymentLink,paymentReference,pending,studentName}',
  'reminder'
where not exists (
  select 1 from whatsapp_templates where name = 'Friendly reminder (हिंदी)'
);

insert into whatsapp_templates (name, body, placeholders, category)
select
  'Final reminder (हिंदी)',
  $body$*अंतिम फीस सूचना*
प्रिय {{fatherName}} जी,

यह {{studentName}} ({{className}}) की बकाया फीस {{pending}} के संबंध में अंतिम सूचना है। यह राशि {{dueDate}} को देय थी।

कृपया शीघ्र भुगतान करें, अथवा किश्तों में भुगतान की व्यवस्था हेतु विद्यालय के फीस कार्यालय में संपर्क करें।

UPI भुगतान लिंक: {{paymentLink}}
संदर्भ: {{paymentReference}}
भुगतान के बाद कृपया UPI स्क्रीनशॉट/UTR भेजें। कार्यालय द्वारा सत्यापन के बाद रसीद जारी की जाएगी।

सधन्यवाद,
श्री वीर पत्ता सीनियर सेकेंडरी स्कूल$body$,
  '{className,dueDate,fatherName,paymentLink,paymentReference,pending,studentName}',
  'final_reminder'
where not exists (
  select 1 from whatsapp_templates where name = 'Final reminder (हिंदी)'
);

insert into whatsapp_templates (name, body, placeholders, category)
select
  'Previous-year balance reminder (हिंदी)',
  $body$प्रिय {{fatherName}} जी,

हमारे अभिलेखों के अनुसार {{studentName}} ({{className}}) की पिछले सत्र (2025-26) की फीस अभी बकाया है। यह इस सत्र की किश्तों से अलग है, और इस पर कोई विलंब शुल्क लागू नहीं होता।

कुल बकाया राशि (पिछले सत्र सहित): {{pending}}
कृपया अपनी सुविधानुसार यह राशि जमा करें, अथवा भुगतान की व्यवस्था हेतु फीस कार्यालय में संपर्क करें।

UPI भुगतान लिंक: {{paymentLink}}
संदर्भ: {{paymentReference}}
भुगतान के बाद कृपया UPI स्क्रीनशॉट/UTR भेजें। कार्यालय द्वारा सत्यापन के बाद रसीद जारी की जाएगी।

सधन्यवाद,
श्री वीर पत्ता सीनियर सेकेंडरी स्कूल$body$,
  '{className,fatherName,paymentLink,paymentReference,pending,studentName}',
  'reminder'
where not exists (
  select 1 from whatsapp_templates where name = 'Previous-year balance reminder (हिंदी)'
);

insert into whatsapp_templates (name, body, placeholders, category)
select
  'Receipt confirmation (हिंदी)',
  $body$प्रिय {{fatherName}} जी,

{{studentName}} ({{className}}) की फीस का आपका भुगतान प्राप्त हो गया है।

रसीद संख्या: {{receiptNumber}}
राशि: {{amount}}

समय पर भुगतान करने हेतु धन्यवाद।

सधन्यवाद,
श्री वीर पत्ता सीनियर सेकेंडरी स्कूल$body$,
  '{amount,className,fatherName,receiptNumber,studentName}',
  'receipt'
where not exists (
  select 1 from whatsapp_templates where name = 'Receipt confirmation (हिंदी)'
);
