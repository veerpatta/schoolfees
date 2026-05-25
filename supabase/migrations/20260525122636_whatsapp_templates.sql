-- WhatsApp message templates managed by admins.
--
-- Admins maintain a library of pre-canned WhatsApp message templates with
-- placeholder variables (e.g. {{studentName}}, {{pending}}). The defaulter
-- list and receipt views use these templates to compose wa.me drafts.
--
-- The app NEVER sends WhatsApp messages — it only renders the text and
-- opens a wa.me link. The staff member sends manually.

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  placeholders text[] not null default '{}',
  category text not null default 'reminder'
    check (category in ('reminder', 'final_reminder', 'receipt', 'custom')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table whatsapp_templates is
  'Admin-maintained library of WhatsApp message templates with placeholder variables. '
  'Used by defaulter bulk-message workflow and receipt sharing. The app never sends — '
  'it only renders text and opens wa.me links.';

comment on column whatsapp_templates.placeholders is
  'Array of placeholder names (without braces) detected in the body. Maintained by the UI '
  'on save to allow quick discovery.';

comment on column whatsapp_templates.category is
  'Hint for grouping in the UI. Free-form within the check constraint.';

create index if not exists whatsapp_templates_active_idx
  on whatsapp_templates (is_active, category, name);

alter table whatsapp_templates enable row level security;

create policy "whatsapp_templates: staff read"
  on whatsapp_templates for select
  using (auth.role() = 'authenticated');

create policy "whatsapp_templates: admin write insert"
  on whatsapp_templates for insert
  with check (auth.role() = 'authenticated');

create policy "whatsapp_templates: admin write update"
  on whatsapp_templates for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "whatsapp_templates: admin write delete"
  on whatsapp_templates for delete
  using (auth.role() = 'authenticated');

-- Seed three starter templates so the library is never empty for staff.
insert into whatsapp_templates (name, body, placeholders, category)
values
  (
    'Friendly reminder',
    'Namaste {{fatherName}} ji,' || E'\n\n' ||
    'Gentle reminder: school fees of {{pending}} are pending for {{studentName}} ({{className}}).' || E'\n' ||
    'Kindly clear at your earliest convenience by {{dueDate}} — feel free to call the fee office for any clarification.' || E'\n\n' ||
    'Regards,' || E'\n' ||
    'Shri Veer Patta Senior Secondary School',
    '{studentName,className,pending,dueDate,fatherName}',
    'reminder'
  ),
  (
    'Final reminder',
    'Namaste {{fatherName}} ji,' || E'\n\n' ||
    'This is a final reminder regarding pending school fees of {{pending}} for {{studentName}} ({{className}}). The amount was due on {{dueDate}}.' || E'\n\n' ||
    'Please settle the dues at the earliest, or visit the fee office to discuss an installment plan.' || E'\n\n' ||
    'Regards,' || E'\n' ||
    'Shri Veer Patta Senior Secondary School',
    '{studentName,className,pending,dueDate,fatherName}',
    'final_reminder'
  ),
  (
    'Receipt confirmation',
    'Namaste {{fatherName}} ji,' || E'\n\n' ||
    'We have received your payment for {{studentName}} ({{className}}). Receipt number: {{receiptNumber}}, Amount: {{amount}}.' || E'\n\n' ||
    'Thank you for your prompt payment.' || E'\n\n' ||
    'Regards,' || E'\n' ||
    'Shri Veer Patta Senior Secondary School',
    '{studentName,className,fatherName,receiptNumber,amount}',
    'receipt'
  )
on conflict do nothing;
