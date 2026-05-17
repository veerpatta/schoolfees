-- =============================================================================
-- SVP SCHOOL — SCRIPT 2 (CORRECTED): TEST STUDENTS SEED
-- Schema-accurate version. Matches supabase/schema.sql exactly.
-- Tested against project lsdrvovwybzspcvbdcir.
--
-- Corrections from original:
--   1. conventional_discount_assignments
--      → student_conventional_discount_assignments
--   2. assigned_by_note
--      → reason (NOT NULL) + before_tuition_amount (NOT NULL)
--        + resulting_tuition_amount (NOT NULL) + calculation_snapshot (NOT NULL)
--   3. birth_order_note in student_family_members
--      → notes (text, optional)
--   4. override_reason in student_fee_overrides
--      → reason (NOT NULL), plus fee_setting_id (NOT NULL).
--        student_fee_overrides is tied to the active fee setting; session is
--        derived from the student's class, not stored on the override row.
--
-- Expected results after run:
--   TEST students : 79
--   Discount assignments : 24
--   Family members : 11
--   Fee overrides : 2
--
-- Safe to re-run — uses WHERE NOT EXISTS / ON CONFLICT guards throughout.
-- =============================================================================

DO $$
DECLARE
  -- ── Class IDs ──────────────────────────────────────────────────────────────
  c_nursery uuid; c_jkg    uuid; c_skg    uuid;
  c_cls1    uuid; c_cls2   uuid; c_cls3   uuid;
  c_cls4    uuid; c_cls5   uuid; c_cls6   uuid;
  c_cls7    uuid; c_cls8   uuid; c_cls9   uuid;
  c_cls10   uuid;
  c_11arts  uuid; c_11com  uuid; c_11sci  uuid;
  c_12arts  uuid; c_12com  uuid; c_12sci  uuid;

  -- ── Route IDs ──────────────────────────────────────────────────────────────
  r_amet_bus  uuid; r_amet_city uuid; r_makarda uuid;
  r_jilola    uuid; r_banda     uuid;

  -- ── Family group IDs ───────────────────────────────────────────────────────
  fg_sharma  uuid; fg_gupta uuid; fg_verma uuid; fg_rathore uuid;

  -- ── Discount policy IDs ────────────────────────────────────────────────────
  pol_rte    uuid; pol_staff uuid; pol_3rd uuid;

  -- ── Fee setting tuition amounts (looked up per class) ──────────────────────
  tuition_nursery  int; tuition_jkg    int; tuition_skg    int;
  tuition_cls1     int; tuition_cls2   int; tuition_cls3   int;
  tuition_cls4     int; tuition_cls5   int; tuition_cls6   int;
  tuition_cls7     int; tuition_cls8   int; tuition_cls9   int;
  tuition_cls10    int;
  tuition_11arts   int; tuition_11com  int; tuition_11sci  int;
  tuition_12arts   int; tuition_12com  int; tuition_12sci  int;

  -- ── Working variables ──────────────────────────────────────────────────────
  s_id           uuid;
  fg_id          uuid;
  base_tuition   int;
  result_tuition int;

BEGIN

  -- ── Resolve class IDs ──────────────────────────────────────────────────────
  SELECT id INTO c_nursery FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Nursery'     LIMIT 1;
  SELECT id INTO c_jkg     FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='JKG'         LIMIT 1;
  SELECT id INTO c_skg     FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='SKG'         LIMIT 1;
  SELECT id INTO c_cls1    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 1'     LIMIT 1;
  SELECT id INTO c_cls2    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 2'     LIMIT 1;
  SELECT id INTO c_cls3    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 3'     LIMIT 1;
  SELECT id INTO c_cls4    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 4'     LIMIT 1;
  SELECT id INTO c_cls5    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 5'     LIMIT 1;
  SELECT id INTO c_cls6    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 6'     LIMIT 1;
  SELECT id INTO c_cls7    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 7'     LIMIT 1;
  SELECT id INTO c_cls8    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 8'     LIMIT 1;
  SELECT id INTO c_cls9    FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 9'     LIMIT 1;
  SELECT id INTO c_cls10   FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='Class 10'    LIMIT 1;
  SELECT id INTO c_11arts  FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='11 Arts'     LIMIT 1;
  SELECT id INTO c_11com   FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='11 Commerce' LIMIT 1;
  SELECT id INTO c_11sci   FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='11 Science'  LIMIT 1;
  SELECT id INTO c_12arts  FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='12 Arts'     LIMIT 1;
  SELECT id INTO c_12com   FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='12 Commerce' LIMIT 1;
  SELECT id INTO c_12sci   FROM public.classes WHERE session_label='TEST-2026-27' AND class_name='12 Science'  LIMIT 1;

  -- ── Resolve tuition amounts from fee_settings ──────────────────────────────
  SELECT tuition_fee_amount INTO tuition_nursery FROM public.fee_settings WHERE class_id=c_nursery AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_jkg     FROM public.fee_settings WHERE class_id=c_jkg     AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_skg     FROM public.fee_settings WHERE class_id=c_skg     AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls1    FROM public.fee_settings WHERE class_id=c_cls1    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls2    FROM public.fee_settings WHERE class_id=c_cls2    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls3    FROM public.fee_settings WHERE class_id=c_cls3    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls4    FROM public.fee_settings WHERE class_id=c_cls4    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls5    FROM public.fee_settings WHERE class_id=c_cls5    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls6    FROM public.fee_settings WHERE class_id=c_cls6    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls7    FROM public.fee_settings WHERE class_id=c_cls7    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls8    FROM public.fee_settings WHERE class_id=c_cls8    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls9    FROM public.fee_settings WHERE class_id=c_cls9    AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_cls10   FROM public.fee_settings WHERE class_id=c_cls10   AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_11arts  FROM public.fee_settings WHERE class_id=c_11arts  AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_11com   FROM public.fee_settings WHERE class_id=c_11com   AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_11sci   FROM public.fee_settings WHERE class_id=c_11sci   AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_12arts  FROM public.fee_settings WHERE class_id=c_12arts  AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_12com   FROM public.fee_settings WHERE class_id=c_12com   AND is_active=true LIMIT 1;
  SELECT tuition_fee_amount INTO tuition_12sci   FROM public.fee_settings WHERE class_id=c_12sci   AND is_active=true LIMIT 1;

  -- ── Resolve route IDs ──────────────────────────────────────────────────────
  SELECT id INTO r_amet_bus  FROM public.transport_routes WHERE route_name='Amet Bus'   LIMIT 1;
  SELECT id INTO r_amet_city FROM public.transport_routes WHERE route_name='Amet City'  LIMIT 1;
  SELECT id INTO r_makarda   FROM public.transport_routes WHERE route_name='Makarda'    LIMIT 1;
  SELECT id INTO r_jilola    FROM public.transport_routes WHERE route_name='Jilola'     LIMIT 1;
  SELECT id INTO r_banda     FROM public.transport_routes WHERE route_name='Banda'      LIMIT 1;

  -- ── Resolve discount policy IDs ────────────────────────────────────────────
  SELECT id INTO pol_rte   FROM public.conventional_discount_policies WHERE academic_session_label='TEST-2026-27' AND code='rte'         LIMIT 1;
  SELECT id INTO pol_staff FROM public.conventional_discount_policies WHERE academic_session_label='TEST-2026-27' AND code='staff_child'  LIMIT 1;
  SELECT id INTO pol_3rd   FROM public.conventional_discount_policies WHERE academic_session_label='TEST-2026-27' AND code='third_child'  LIMIT 1;

  -- ── Resolve family group IDs ───────────────────────────────────────────────
  SELECT id INTO fg_sharma  FROM public.student_family_groups WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-SHARMA'  LIMIT 1;
  SELECT id INTO fg_gupta   FROM public.student_family_groups WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-GUPTA'   LIMIT 1;
  SELECT id INTO fg_verma   FROM public.student_family_groups WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-VERMA'   LIMIT 1;
  SELECT id INTO fg_rathore FROM public.student_family_groups WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-RATHORE' LIMIT 1;

  -- ════════════════════════════════════════════════════════════════════════════
  -- HELPER: insert a discount assignment with correct required columns
  --
  -- student_conventional_discount_assignments requires:
  --   student_id, policy_id, academic_session_label,
  --   reason (NOT NULL text),
  --   before_tuition_amount (NOT NULL int ≥ 0),
  --   resulting_tuition_amount (NOT NULL int ≥ 0),
  --   calculation_snapshot (NOT NULL jsonb, default '{}')
  -- ════════════════════════════════════════════════════════════════════════════

  -- ────────────────────────────────────────────────────────────────────────────
  -- NURSERY (tuition ₹16,000)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-001', 'Aarav Test Singh',    c_nursery, '2022-04-10', 'Deepak Test Singh',  '9811000001', 'active', 'TEST: standard existing, no transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-002', 'Ananya Test Sharma',  c_nursery, '2022-07-15', 'Rajesh Test Sharma', '9811000002', 'active', 'TEST: new student — academic fee ₹1100')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-NUR-003', 'Arjun Test Gupta',    c_nursery, '2022-01-20', 'Suresh Test Gupta',  '9811000003', r_amet_bus, 'active', 'TEST: Amet Bus transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RTE: tuition → 0
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-004', 'Kavya Test Meena',    c_nursery, '2022-03-05', 'Gopal Test Meena',   '9811000004', 'active', 'TEST: RTE — tuition zero')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-NUR-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true,
           'TEST seed: RTE assignment', tuition_nursery, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_nursery,'resultingTuition',0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, status, notes)
  VALUES ('TEST-NUR-005', 'Rohit Test Rawat',    c_nursery, '2022-09-12', 'Amit Test Rawat',    'active', 'TEST: no phone edge case')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-006', 'Priya Test Joshi',    c_nursery, 'Vijay Test Joshi', '9811000006', 'active', 'TEST: no DOB edge case')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ────────────────────────────────────────────────────────────────────────────
  -- JKG (tuition ₹17,000)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-001', 'Aditya Test Bhandari', c_jkg, '2021-06-18', 'Mahesh Test Bhandari', '9811000011', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-JKG-002', 'Shruti Test Patel',    c_jkg, '2021-03-22', 'Dinesh Test Patel',    '9811000012', r_amet_city, 'active', 'TEST: Amet City transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child: tuition → 50% of ₹17,000 = ₹8,500
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-003', 'Dev Test Chauhan',     c_jkg, '2021-11-30', 'Sunil Test Chauhan',   '9811000013', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-JKG-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition   := tuition_jkg;
    result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true,
           'TEST seed: Staff Child — father is school staff',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-004', 'Nisha Test Kumari',    c_jkg, '2021-08-14', 'Ram Test Kumar',       '9811000014', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ────────────────────────────────────────────────────────────────────────────
  -- SKG (tuition ₹17,000)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-SKG-001', 'Vivaan Test Malhotra', c_skg, '2020-05-25', 'Rohit Test Malhotra',  '9811000021', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-SKG-002', 'Ishaan Test Saxena',   c_skg, '2020-02-08', 'Naveen Test Saxena',   '9811000022', r_makarda, 'active', 'TEST: Makarda route ₹14,000/yr')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RTE
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-SKG-003', 'Pooja Test Yadav',     c_skg, '2020-09-17', 'Hemraj Test Yadav',    '9811000023', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-SKG-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true,
           'TEST seed: RTE', tuition_skg, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_skg,'resultingTuition',0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 1 (tuition ₹18,000) — SHARMA family child 1 (youngest, gets 3rd Child)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-001', 'Rahul Test Sharma',   c_cls1, '2018-03-12', 'Rajesh Test Sharma', '9811000031', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL1-002', 'Sneha Test Tiwari',   c_cls1, '2018-07-21', 'Ajay Test Tiwari',   '9811000032', r_amet_bus, 'active', 'TEST: transport + standard')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 3rd Child (youngest of SHARMA family)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-003', 'Ankit Test Sharma',   c_cls1, '2018-11-05', 'Rajesh Test Sharma', '9811000033', 'active', 'TEST: 3rd Child Policy — SHARMA youngest')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL1-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    result_tuition := 6000;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot,
       family_group_id)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true,
           'TEST seed: 3rd Child Policy — SHARMA family',
           tuition_cls1, result_tuition,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_cls1,'resultingTuition',result_tuition),
           fg_sharma
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true
    );
    -- Family member (notes carries human label; sibling_order is the integer position)
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order,
       is_policy_candidate, notes)
    VALUES (fg_sharma, s_id, 'TEST-2026-27', 3, true, '3rd child — discount candidate')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-004', 'Meena Test Singh',    c_cls1, '2018-06-30', 'Bharat Test Singh',  '9811000034', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-005', 'Tarun Test Rathore',  c_cls1, 'Karan Test Rathore', '9811000035', 'active', 'TEST: no DOB')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 2 (tuition ₹18,500) — GUPTA family child 1 (youngest)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-001', 'Gaurav Test Dubey',   c_cls2, '2017-04-14', 'Anil Test Dubey',    '9811000041', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL2-002', 'Pallavi Test Mishra', c_cls2, '2017-09-26', 'Devendra Test Mishra','9811000042', r_jilola, 'active', 'TEST: Jilola route ₹17,000/yr')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 3rd Child (youngest of GUPTA family)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-003', 'Riya Test Gupta',     c_cls2, '2017-01-18', 'Suresh Test Gupta',  '9811000043', 'active', 'TEST: 3rd Child — GUPTA youngest')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL2-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    result_tuition := 6000;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot,
       family_group_id)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true,
           'TEST seed: 3rd Child — GUPTA family',
           tuition_cls2, result_tuition,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_cls2,'resultingTuition',result_tuition),
           fg_gupta
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true
    );
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order,
       is_policy_candidate, notes)
    VALUES (fg_gupta, s_id, 'TEST-2026-27', 3, true, '3rd child — discount candidate')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- RTE
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-004', 'Lokesh Test Verma',   c_cls2, '2017-12-07', 'Mahesh Test Verma',  '9811000044', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL2-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true,
           'TEST seed: RTE', tuition_cls2, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_cls2,'resultingTuition',0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 3 (tuition ₹19,000) — SHARMA family child 2
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL3-001', 'Harsha Test Trivedi', c_cls3, '2016-08-03', 'Mohan Test Trivedi', '9811000051', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL3-002', 'Manish Test Bhatt',   c_cls3, '2016-04-20', 'Naresh Test Bhatt',  '9811000052', r_banda, 'active', 'TEST: Banda route ₹9,500/yr')
  ON CONFLICT (admission_no) DO NOTHING;

  -- SHARMA family child 2 (no discount — middle sibling)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL3-003', 'Sunita Test Sharma',  c_cls3, '2015-09-11', 'Rajesh Test Sharma', '9800000001', 'active', 'TEST: SHARMA family 2nd child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL3-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_sharma, s_id, 'TEST-2026-27', 2, '2nd child — no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- Staff Child + transport
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL3-004', 'Kiran Test Kapoor',   c_cls3, '2016-11-28', 'Sanjay Test Kapoor', '9811000054', r_amet_city, 'active', 'TEST: Staff Child + transport')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL3-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition   := tuition_cls3;
    result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true,
           'TEST seed: Staff Child',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 4 (tuition ₹19,500)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL4-001', 'Akash Test Pathak',   c_cls4, '2015-05-16', 'Dinesh Test Pathak', '9811000061', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL4-002', 'Kajal Test Negi',     c_cls4, '2015-02-14', 'Prakash Test Negi',  '9811000062', r_amet_city, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RTE (transport fee still applies — only tuition = 0)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL4-003', 'Mohit Test Agarwal',  c_cls4, '2015-10-02', 'Rajiv Test Agarwal', '9811000063', r_amet_bus, 'active', 'TEST: RTE + transport (tuition 0, transport still charged)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL4-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true,
           'TEST seed: RTE (transport fee still applies)',
           tuition_cls4, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_cls4,'resultingTuition',0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 5 (tuition ₹20,000) — SHARMA family child 3 (eldest, no 3rd child discount)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL5-001', 'Deepika Test Jain',   c_cls5, '2014-07-08', 'Santosh Test Jain',  '9811000071', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL5-002', 'Vishal Test Soni',    c_cls5, '2014-12-19', 'Ganesh Test Soni',   '9811000072', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL5-002' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition   := tuition_cls5;
    result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true,
           'TEST seed: Staff Child',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- SHARMA eldest — no discount, just family membership
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL5-003', 'Pooja Test Sharma',   c_cls5, '2013-04-25', 'Rajesh Test Sharma', '9800000001', r_amet_bus, 'active', 'TEST: SHARMA eldest, transport')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL5-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_sharma, s_id, 'TEST-2026-27', 1, '1st child — no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 6 (tuition ₹21,000) — GUPTA family child 2 + custom override
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-001', 'Saurabh Test Dubey',  c_cls6, '2013-09-04', 'Vinod Test Dubey',   '9811000081', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL6-002', 'Aarti Test Choudhary',c_cls6, '2013-06-17', 'Rajesh Test Choudhary','9811000082', r_makarda, 'active', 'TEST: long route + standard')
  ON CONFLICT (admission_no) DO NOTHING;

  -- GUPTA family child 2 (middle)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-003', 'Nikhil Test Gupta',   c_cls6, '2012-11-22', 'Suresh Test Gupta',  '9800000002', 'active', 'TEST: GUPTA family 2nd child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL6-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_gupta, s_id, 'TEST-2026-27', 2, '2nd child — no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- Custom tuition override ₹15,000 (override_reason → reason in student_fee_overrides)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-004', 'Tanya Test Mathur',   c_cls6, '2013-03-29', 'Rakesh Test Mathur', '9811000084', 'active', 'TEST: manual tuition override ₹15,000')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL6-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_fee_overrides
      (student_id, fee_setting_id, custom_tuition_fee_amount,
       reason, is_active)
    SELECT s_id, fs.id, 15000,
           'TEST: management concession — tuition reduced to ₹15,000', true
    FROM public.fee_settings fs
    WHERE fs.class_id = c_cls6
      AND fs.is_active = true
      AND NOT EXISTS (
      SELECT 1 FROM public.student_fee_overrides
      WHERE student_id=s_id AND is_active=true
    )
    ORDER BY fs.updated_at DESC
    LIMIT 1;
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 7 (tuition ₹22,000) — VERMA: Staff Child + 3rd Child combo (₹6,000 wins)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-001', 'Ritesh Test Pandey',  c_cls7, '2012-05-13', 'Kamlesh Test Pandey','9811000091', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL7-002', 'Swati Test Rastogi',  c_cls7, '2012-08-25', 'Ashok Test Rastogi', '9811000092', r_jilola, 'active', 'TEST: Jilola route')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child + 3rd Child: 50% of ₹22,000 = ₹11,000 vs ₹6,000 → ₹6,000 wins
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-003', 'Prateek Test Verma',  c_cls7, '2012-01-07', 'Mahesh Test Verma',  '9800000003', 'active', 'TEST: Staff Child + 3rd Child (₹6,000 wins over ₹11,000)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL7-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL AND pol_3rd IS NOT NULL THEN
    base_tuition := tuition_cls7;
    -- Insert Staff Child (result: 50%)
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true,
           'TEST seed: Staff Child (one of two policies)',
           base_tuition, (base_tuition * 50) / 100,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',(base_tuition * 50) / 100)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true
    );
    -- Insert 3rd Child (result: ₹6,000 — lowest candidate wins)
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot,
       family_group_id)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true,
           'TEST seed: 3rd Child (lowest candidate — ₹6000 < ₹11000)',
           base_tuition, 6000,
           jsonb_build_object('policyCode','third_child','beforeTuition',base_tuition,'resultingTuition',6000),
           fg_verma
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true
    );
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order,
       is_policy_candidate, notes)
    VALUES (fg_verma, s_id, 'TEST-2026-27', 3, true, '3rd child + Staff Child — ₹6,000 final tuition')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- GUPTA eldest
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-004', 'Nidhi Test Gupta',    c_cls7, '2012-10-16', 'Suresh Test Gupta',  '9800000002', 'active', 'TEST: GUPTA family eldest')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL7-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_gupta, s_id, 'TEST-2026-27', 1, '1st child — eldest, no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 8 (tuition ₹23,000) — GUPTA family child 3 (youngest, gets 3rd Child)
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-001', 'Vikash Test Tomar',   c_cls8, '2011-07-31', 'Govind Test Tomar',  '9811000101', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL8-002', 'Ankita Test Singh',   c_cls8, '2011-04-09', 'Ramesh Test Singh',  '9811000102', r_amet_bus, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 3rd Child (GUPTA youngest)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-003', 'Himanshu Test Gupta', c_cls8, '2010-12-20', 'Suresh Test Gupta',  '9800000002', 'active', 'TEST: 3rd Child GUPTA youngest')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL8-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot,
       family_group_id)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true,
           'TEST seed: 3rd Child — GUPTA youngest',
           tuition_cls8, 6000,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_cls8,'resultingTuition',6000),
           fg_gupta
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true
    );
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order,
       is_policy_candidate, notes)
    VALUES (fg_gupta, s_id, 'TEST-2026-27', 3, true, '3rd child — discount candidate')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- RTE
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-004', 'Seema Test Tiwari',   c_cls8, '2011-09-03', 'Arun Test Tiwari',   '9811000104', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL8-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true,
           'TEST seed: RTE', tuition_cls8, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_cls8,'resultingTuition',0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true
    );
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASSES 9 & 10 — standard + transport + Staff Child
  -- ────────────────────────────────────────────────────────────────────────────

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-001', 'Rajat Test Sharma',   c_cls9, '2010-03-15', 'Vinay Test Sharma',  '9811000111', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-002', 'Shalini Test Chouhan',c_cls9, '2010-10-27', 'Vikram Test Chouhan','9811000112', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL9-003', 'Sumit Test Rana',     c_cls9, '2010-06-08', 'Satpal Test Rana',   '9811000113', r_makarda, 'active', 'TEST: long route')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-004', 'Kavitha Test Menon',  c_cls9, '2010-01-14', 'Krishna Test Menon', '9811000114', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL9-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition := tuition_cls9; result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true, 'TEST seed: Staff Child',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-001','Amit Test Verma',      c_cls10,'2009-05-21', 'Mahesh Test Verma',  '9811000121', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-002','Neha Test Pandey',     c_cls10,'2009-11-07', 'Suresh Test Pandey', '9811000122', 'active', 'TEST: RTE Class 10')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL10-002' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true, 'TEST seed: RTE',
           tuition_cls10, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_cls10,'resultingTuition',0)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL10-003','Yash Test Bhardwaj',   c_cls10,'2009-08-17', 'Anil Test Bhardwaj', '9811000123', r_jilola, 'active', 'TEST: Jilola route')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Custom override ₹20,000 (reduced from ₹25,000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-004','Simran Test Kaur',     c_cls10,'2009-02-03', 'Harjinder Test Singh','9811000124','active', 'TEST: custom override ₹20,000')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL10-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_fee_overrides
      (student_id, fee_setting_id, custom_tuition_fee_amount,
       reason, is_active)
    SELECT s_id, fs.id, 20000,
           'TEST: special concession — tuition reduced from ₹25,000 to ₹20,000', true
    FROM public.fee_settings fs
    WHERE fs.class_id = c_cls10
      AND fs.is_active = true
      AND NOT EXISTS (
      SELECT 1 FROM public.student_fee_overrides
      WHERE student_id=s_id AND is_active=true
    )
    ORDER BY fs.updated_at DESC
    LIMIT 1;
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- SENIOR CLASSES: 11 Arts, 11 Commerce, 11 Science
  -- ────────────────────────────────────────────────────────────────────────────

  -- 11 Arts (₹30,000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-001','Ravi Test Sharma',    c_11arts,'2008-06-12','Devraj Test Sharma', '9811000131','active','TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-002','Meghna Test Singh',   c_11arts,'2008-10-30','Balveer Test Singh',  '9811000132','active','TEST: new student ₹1,100 academic fee')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11A-003','Tarun Test Lohar',    c_11arts,'2008-03-25','Bhanwar Test Lohar', '9811000133', r_amet_city,'active','TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child 11 Arts: 50% of ₹30,000 = ₹15,000
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-004','Sapna Test Kumari',   c_11arts,'2008-08-14','Laxman Test Kumar',  '9811000134','active','TEST: Staff Child (₹15,000)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11A-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition := tuition_11arts; result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true, 'TEST seed: Staff Child 11 Arts',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  -- RATHORE family child 1 (eldest, in 11 Arts)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-005','Chirag Test Rathore', c_11arts,'2008-01-19','Vikram Test Rathore','9800000004','active','TEST: RATHORE eldest')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11A-005' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_rathore, s_id, 'TEST-2026-27', 1, '1st child — no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- 11 Commerce (₹30,000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-001','Rohit Test Agrawal',  c_11com,'2008-07-22','Pankaj Test Agrawal','9811000141','active','TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11C-002','Jyoti Test Mathur',   c_11com,'2008-05-09','Naresh Test Mathur', '9811000142', r_banda,'active','TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 3rd Child 11 Commerce: ₹6,000 << ₹30,000
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-003','Gaurav Test Bajaj',   c_11com,'2008-12-03','Ramdev Test Bajaj',  '9811000143','active','TEST: 3rd Child (₹6,000)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11C-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true, 'TEST seed: 3rd Child 11 Commerce',
           tuition_11com, 6000,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_11com,'resultingTuition',6000)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  -- RATHORE family child 2
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-004','Reena Test Rathore',  c_11com,'2007-09-16','Vikram Test Rathore','9800000004','active','TEST: RATHORE 2nd child')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11C-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order, notes)
    VALUES (fg_rathore, s_id, 'TEST-2026-27', 2, '2nd child — no discount')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- 11 Science (₹35,000) — highest in 11th
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-001','Arjun Test Rathod',   c_11sci,'2008-04-11','Dilip Test Rathod',  '9811000151','active','TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11S-002','Priya Test Vyas',     c_11sci,'2008-09-28','Narayan Test Vyas',  '9811000152', r_makarda,'active','TEST: transport + science')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child 11 Science: 50% of ₹35,000 = ₹17,500
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-003','Kunal Test Shah',     c_11sci,'2008-02-17','Paresh Test Shah',   '9811000153','active','TEST: Staff Child Science (₹17,500)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11S-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition := tuition_11sci; result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true, 'TEST seed: Staff Child 11 Science',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-004','Kalpana Test Bhatt',  c_11sci,'2008-11-06','Chandra Test Bhatt', '9811000154','active','TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RATHORE child 3 (youngest — 3rd Child ₹6,000 vs ₹35,000 = massive discount)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-005','Suraj Test Rathore',  c_11sci,'2008-06-30','Vikram Test Rathore','9800000004','active','TEST: RATHORE youngest — 3rd Child ₹6,000 vs ₹35,000')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11S-005' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot,
       family_group_id)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true,
           'TEST seed: 3rd Child Science — ₹6,000 vs ₹35,000',
           tuition_11sci, 6000,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_11sci,'resultingTuition',6000),
           fg_rathore
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true);
    INSERT INTO public.student_family_members
      (family_group_id, student_id, academic_session_label, sibling_order,
       is_policy_candidate, notes)
    VALUES (fg_rathore, s_id, 'TEST-2026-27', 3, true, '3rd child — huge saving vs ₹35,000 Science fee')
    ON CONFLICT (family_group_id, student_id, academic_session_label) DO NOTHING;
  END IF;

  -- ────────────────────────────────────────────────────────────────────────────
  -- CLASS 12: Arts, Commerce, Science — all variants
  -- ────────────────────────────────────────────────────────────────────────────

  -- 12 Arts (₹32,000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12A-001','Anand Test Solanki',  c_12arts,'2007-03-18','Mohan Test Solanki','9811000161','active','TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12A-002','Rekha Test Kumari',   c_12arts,'2007-10-05','Harlal Test Kumar', '9811000162', r_amet_bus,'active','TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12A-003','Dev Test Lodha',      c_12arts,'2007-07-23','Babu Test Lodha',   '9811000163','active','TEST: RTE final year')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12A-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true, 'TEST seed: RTE 12 Arts final year',
           tuition_12arts, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_12arts,'resultingTuition',0)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;
  -- No phone edge case
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, status, notes)
  VALUES ('TEST-12A-004','Poonam Test Mehta',   c_12arts,'2007-12-11','Jayant Test Mehta', 'active','TEST: no phone number edge case')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 12 Commerce (₹32,000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12C-001','Vikas Test Agarwal',  c_12com,'2007-05-09','Rajesh Test Agarwal','9811000171','active','TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12C-002','Mamta Test Gupta',    c_12com,'2007-09-14','Suresh Test Gupta',  '9811000172', r_amet_city,'active','TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child 12 Commerce: 50% of ₹32,000 = ₹16,000
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12C-003','Rohit Test Saxena',   c_12com,'2007-02-27','Naveen Test Saxena', '9811000173','active','TEST: Staff Child 12 Commerce (₹16,000)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12C-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition := tuition_12com; result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true, 'TEST seed: Staff Child 12 Commerce',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  -- 12 Science (₹38,000) — highest fee class, all variants
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-001','Aman Test Soni',      c_12sci,'2007-01-08','Rajesh Test Soni',   '9811000181','active','TEST: standard ₹38,000')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-002','Asha Test Sharma',    c_12sci,'2007-04-16','Rajesh Test Sharma', '9811000182','active','TEST: new student highest fee')
  ON CONFLICT (admission_no) DO NOTHING;
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12S-003','Rishabh Test Jain',   c_12sci,'2007-08-22','Pramod Test Jain',   '9811000183', r_jilola,'active','TEST: Science + Jilola route (max total fee)')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RTE 12 Science: tuition = 0, academic fee still applies
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-004','Tanvi Test Singh',    c_12sci,'2007-11-29','Balveer Test Singh',  '9811000184','active','TEST: RTE Science (tuition 0, academic fee remains)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_rte, 'TEST-2026-27', true, 'TEST seed: RTE 12 Science final year',
           tuition_12sci, 0,
           jsonb_build_object('policyCode','rte','beforeTuition',tuition_12sci,'resultingTuition',0)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_rte AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  -- Staff Child 12 Science: 50% of ₹38,000 = ₹19,000
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-005','Yuvraj Test Rajput',  c_12sci,'2007-06-04','Bharat Test Rajput', '9811000185','active','TEST: Staff Child Science (₹19,000)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-005' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    base_tuition := tuition_12sci; result_tuition := (base_tuition * 50) / 100;
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_staff, 'TEST-2026-27', true, 'TEST seed: Staff Child 12 Science (₹19,000)',
           base_tuition, result_tuition,
           jsonb_build_object('policyCode','staff_child','beforeTuition',base_tuition,'resultingTuition',result_tuition)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_staff AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

  -- 3rd Child 12 Science: ₹6,000 vs ₹38,000 — biggest discount in the whole school
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-006','Kajal Test Patel',    c_12sci,'2007-03-12','Dinesh Test Patel',  '9811000186','active','TEST: 3rd Child Science (₹6,000 vs ₹38,000)')
  ON CONFLICT (admission_no) DO NOTHING;
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-006' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.student_conventional_discount_assignments
      (student_id, policy_id, academic_session_label, is_active,
       reason, before_tuition_amount, resulting_tuition_amount, calculation_snapshot)
    SELECT s_id, pol_3rd, 'TEST-2026-27', true, 'TEST seed: 3rd Child 12 Science — ₹32,000 saving',
           tuition_12sci, 6000,
           jsonb_build_object('policyCode','third_child','beforeTuition',tuition_12sci,'resultingTuition',6000)
    WHERE NOT EXISTS (SELECT 1 FROM public.student_conventional_discount_assignments
      WHERE student_id=s_id AND policy_id=pol_3rd AND academic_session_label='TEST-2026-27' AND is_active=true);
  END IF;

END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification — expected: 79 students, 24 assignments, 11 family members, 2 overrides
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  c.class_name,
  COUNT(DISTINCT s.id)                                                         AS students,
  COUNT(DISTINCT cda.id)                                                       AS discount_assignments,
  COUNT(DISTINCT CASE WHEN tr.id IS NOT NULL THEN s.id END)                   AS with_transport,
  COUNT(DISTINCT sfo.id)                                                       AS with_override
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
LEFT JOIN public.student_conventional_discount_assignments cda
  ON cda.student_id = s.id AND cda.academic_session_label='TEST-2026-27' AND cda.is_active=true
LEFT JOIN public.transport_routes tr ON tr.id = s.transport_route_id
LEFT JOIN public.student_fee_overrides sfo
  ON sfo.student_id = s.id AND sfo.is_active=true
WHERE c.session_label = 'TEST-2026-27'
  AND s.admission_no LIKE 'TEST-%'
GROUP BY c.class_name, c.sort_order
ORDER BY c.sort_order;

-- Totals
SELECT
  COUNT(*)                                                      AS total_test_students,
  (SELECT COUNT(*) FROM public.student_conventional_discount_assignments cda
   JOIN public.students s ON s.id = cda.student_id
   JOIN public.classes c ON c.id = s.class_id
   WHERE c.session_label='TEST-2026-27' AND cda.is_active=true)  AS total_discount_assignments,
  (SELECT COUNT(*) FROM public.student_family_members sfm
   JOIN public.students s ON s.id = sfm.student_id
   JOIN public.classes c ON c.id = s.class_id
   WHERE c.session_label='TEST-2026-27')                         AS total_family_members,
  (SELECT COUNT(*) FROM public.student_fee_overrides sfo
   JOIN public.students s ON s.id = sfo.student_id
   JOIN public.classes c ON c.id = s.class_id
   WHERE c.session_label='TEST-2026-27' AND sfo.is_active=true)  AS total_overrides
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
WHERE c.session_label='TEST-2026-27'
  AND s.admission_no LIKE 'TEST-%';
