-- =============================================================================
-- SVP SCHOOL — SCRIPT 1: TEST-2026-27 SESSION SETUP
-- Run this FIRST in Supabase SQL Editor (as service role / postgres)
-- Creates: session, 19 classes, fee_settings, conventional discount policies
-- Safe to re-run — uses ON CONFLICT and WHERE NOT EXISTS guards
-- =============================================================================

-- 1. Create the TEST academic session
INSERT INTO public.academic_sessions (session_label, status, is_current, notes)
VALUES (
  'TEST-2026-27',
  'active',
  false,   -- keep 2026-27 as the live session; TEST is parallel
  'Isolated test session for QA and debugging. Do not use for live collection.'
)
ON CONFLICT (session_label) DO UPDATE SET
  status   = 'active',
  notes    = excluded.notes,
  updated_at = now();

-- 2. Seed all 19 classes for TEST-2026-27
WITH class_seed(class_label, sort_order) AS (
  VALUES
    ('Nursery',      1),
    ('JKG',          2),
    ('SKG',          3),
    ('Class 1',      4),
    ('Class 2',      5),
    ('Class 3',      6),
    ('Class 4',      7),
    ('Class 5',      8),
    ('Class 6',      9),
    ('Class 7',     10),
    ('Class 8',     11),
    ('Class 9',     12),
    ('Class 10',    13),
    ('11 Arts',     14),
    ('11 Commerce', 15),
    ('11 Science',  16),
    ('12 Arts',     17),
    ('12 Commerce', 18),
    ('12 Science',  19)
)
INSERT INTO public.classes (session_label, class_name, section, stream_name, sort_order, status, notes)
SELECT
  'TEST-2026-27',
  cs.class_label,
  NULL,
  NULL,
  cs.sort_order,
  'active',
  'TEST-2026-27 seed class'
FROM class_seed cs
WHERE NOT EXISTS (
  SELECT 1 FROM public.classes c
  WHERE c.session_label = 'TEST-2026-27'
    AND private.normalize_workbook_class_label(c.class_name, c.stream_name) = cs.class_label
);

-- 3. Seed fee_settings for all TEST-2026-27 classes
-- Tuition amounts match live 2026-27; installment_count = 4; late_fee = 1000
WITH tuition_seed(class_label, tuition_fee) AS (
  VALUES
    ('Nursery',      16000),
    ('JKG',          17000),
    ('SKG',          17000),
    ('Class 1',      18000),
    ('Class 2',      18500),
    ('Class 3',      19000),
    ('Class 4',      19500),
    ('Class 5',      20000),
    ('Class 6',      21000),
    ('Class 7',      22000),
    ('Class 8',      23000),
    ('Class 9',      24000),
    ('Class 10',     25000),
    ('11 Arts',      30000),
    ('11 Commerce',  30000),
    ('11 Science',   35000),
    ('12 Arts',      32000),
    ('12 Commerce',  32000),
    ('12 Science',   38000)
),
class_lookup AS (
  SELECT c.id, private.normalize_workbook_class_label(c.class_name, c.stream_name) AS label
  FROM public.classes c
  WHERE c.session_label = 'TEST-2026-27'
)
INSERT INTO public.fee_settings (
  class_id, annual_base_amount, late_fee_flat_amount, installment_count,
  tuition_fee_amount, transport_fee_amount, books_fee_amount,
  admission_activity_misc_fee_amount, other_fee_heads,
  student_type_default, transport_applies_default, notes, is_active
)
SELECT
  cl.id,
  ts.tuition_fee,
  1000,      -- late fee ₹1,000 flat
  4,         -- 4 installments
  ts.tuition_fee,
  0,
  0,
  0,
  '{}',
  'existing',
  false,
  'TEST-2026-27 fee seed',
  true
FROM tuition_seed ts
JOIN class_lookup cl ON cl.label = ts.class_label
WHERE NOT EXISTS (
  SELECT 1 FROM public.fee_settings fs
  WHERE fs.class_id = cl.id AND fs.is_active = true
);

-- 4. Seed conventional discount policies for TEST-2026-27
INSERT INTO public.conventional_discount_policies
  (academic_session_label, code, display_name, calculation_type, fixed_tuition_amount, percentage, is_active, is_builtin, sort_order)
VALUES
  ('TEST-2026-27', 'rte',         'RTE',             'tuition_zero',           NULL,  NULL, true, true, 1),
  ('TEST-2026-27', 'staff_child', 'Staff Child',      'tuition_percentage',     NULL,  50,   true, true, 2),
  ('TEST-2026-27', 'third_child', '3rd Child Policy', 'tuition_fixed_amount',  6000,  NULL, true, true, 3)
ON CONFLICT (academic_session_label, code) DO UPDATE SET
  is_active   = true,
  is_builtin  = true,
  updated_at  = now();

-- 5. Seed family groups for 3rd-child testing
INSERT INTO public.student_family_groups (academic_session_label, family_label, guardian_name, guardian_phone, notes)
VALUES
  ('TEST-2026-27', 'TEST-FAMILY-SHARMA',   'Rajesh Sharma',   '9800000001', 'Test family: 3 children across Class 1, 3, 5'),
  ('TEST-2026-27', 'TEST-FAMILY-GUPTA',    'Suresh Gupta',    '9800000002', 'Test family: 3 children across Class 2, 6, 8'),
  ('TEST-2026-27', 'TEST-FAMILY-VERMA',    'Mahesh Verma',    '9800000003', 'Test family: Staff Child + 3rd Child combination'),
  ('TEST-2026-27', 'TEST-FAMILY-RATHORE',  'Vikram Rathore',  '9800000004', 'Test family: 3 children in senior classes')
ON CONFLICT (academic_session_label, family_label) DO UPDATE SET
  updated_at = now();

-- Verification
SELECT
  'TEST-2026-27 session setup complete' AS status,
  (SELECT COUNT(*) FROM public.classes WHERE session_label = 'TEST-2026-27') AS classes_created,
  (SELECT COUNT(*) FROM public.fee_settings fs
   JOIN public.classes c ON c.id = fs.class_id
   WHERE c.session_label = 'TEST-2026-27' AND fs.is_active = true) AS fee_settings_created,
  (SELECT COUNT(*) FROM public.conventional_discount_policies
   WHERE academic_session_label = 'TEST-2026-27') AS discount_policies,
  (SELECT COUNT(*) FROM public.student_family_groups
   WHERE academic_session_label = 'TEST-2026-27') AS family_groups;
