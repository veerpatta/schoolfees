-- =============================================================================
-- SVP SCHOOL — SCRIPT 2: TEST STUDENTS SEED (TEST-2026-27)
-- Run AFTER Script 1. Inserts ~120 test students across all 19 classes.
-- Covers: standard, new, RTE, Staff Child, 3rd Child, transport, overrides,
--         edge cases (no phone, no DOB, zero-fee, credit state, etc.)
-- Admission numbers all start with TEST- to be easily filtered/deleted.
-- Safe to re-run — uses ON CONFLICT (admission_no) DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  -- Class IDs (looked up from TEST-2026-27)
  c_nursery     uuid; c_jkg    uuid; c_skg    uuid;
  c_cls1        uuid; c_cls2   uuid; c_cls3   uuid;
  c_cls4        uuid; c_cls5   uuid; c_cls6   uuid;
  c_cls7        uuid; c_cls8   uuid; c_cls9   uuid;
  c_cls10       uuid;
  c_11arts      uuid; c_11com  uuid; c_11sci  uuid;
  c_12arts      uuid; c_12com  uuid; c_12sci  uuid;

  -- Route IDs (reuse existing live routes)
  r_amet_bus    uuid; r_amet_city uuid; r_makarda uuid;
  r_jilola      uuid; r_banda     uuid; r_no_transport uuid;

  -- Family group IDs
  fg_sharma     uuid; fg_gupta uuid; fg_verma uuid; fg_rathore uuid;

  -- Discount policy IDs
  pol_rte       uuid; pol_staff uuid; pol_3rd uuid;

  -- Temp student ID for family member wiring
  s_id          uuid;

BEGIN

  -- ── Resolve class IDs ──────────────────────────────────────────────────────
  SELECT id INTO c_nursery FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Nursery' LIMIT 1;
  SELECT id INTO c_jkg FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='JKG' LIMIT 1;
  SELECT id INTO c_skg FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='SKG' LIMIT 1;
  SELECT id INTO c_cls1 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 1' LIMIT 1;
  SELECT id INTO c_cls2 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 2' LIMIT 1;
  SELECT id INTO c_cls3 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 3' LIMIT 1;
  SELECT id INTO c_cls4 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 4' LIMIT 1;
  SELECT id INTO c_cls5 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 5' LIMIT 1;
  SELECT id INTO c_cls6 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 6' LIMIT 1;
  SELECT id INTO c_cls7 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 7' LIMIT 1;
  SELECT id INTO c_cls8 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 8' LIMIT 1;
  SELECT id INTO c_cls9 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 9' LIMIT 1;
  SELECT id INTO c_cls10 FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='Class 10' LIMIT 1;
  SELECT id INTO c_11arts FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='11 Arts' LIMIT 1;
  SELECT id INTO c_11com FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='11 Commerce' LIMIT 1;
  SELECT id INTO c_11sci FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='11 Science' LIMIT 1;
  SELECT id INTO c_12arts FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='12 Arts' LIMIT 1;
  SELECT id INTO c_12com FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='12 Commerce' LIMIT 1;
  SELECT id INTO c_12sci FROM public.classes
    WHERE session_label='TEST-2026-27' AND class_name='12 Science' LIMIT 1;

  -- ── Resolve transport route IDs ────────────────────────────────────────────
  SELECT id INTO r_amet_bus   FROM public.transport_routes WHERE route_name='Amet Bus'    LIMIT 1;
  SELECT id INTO r_amet_city  FROM public.transport_routes WHERE route_name='Amet City'   LIMIT 1;
  SELECT id INTO r_makarda    FROM public.transport_routes WHERE route_name='Makarda'     LIMIT 1;
  SELECT id INTO r_jilola     FROM public.transport_routes WHERE route_name='Jilola'      LIMIT 1;
  SELECT id INTO r_banda      FROM public.transport_routes WHERE route_name='Banda'       LIMIT 1;
  -- No-transport marker: NULL route_id means no transport fee

  -- ── Resolve discount policy IDs ────────────────────────────────────────────
  SELECT id INTO pol_rte   FROM public.conventional_discount_policies
    WHERE academic_session_label='TEST-2026-27' AND code='rte';
  SELECT id INTO pol_staff FROM public.conventional_discount_policies
    WHERE academic_session_label='TEST-2026-27' AND code='staff_child';
  SELECT id INTO pol_3rd   FROM public.conventional_discount_policies
    WHERE academic_session_label='TEST-2026-27' AND code='third_child';

  -- ── Resolve family group IDs ───────────────────────────────────────────────
  SELECT id INTO fg_sharma  FROM public.student_family_groups
    WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-SHARMA';
  SELECT id INTO fg_gupta   FROM public.student_family_groups
    WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-GUPTA';
  SELECT id INTO fg_verma   FROM public.student_family_groups
    WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-VERMA';
  SELECT id INTO fg_rathore FROM public.student_family_groups
    WHERE academic_session_label='TEST-2026-27' AND family_label='TEST-FAMILY-RATHORE';

  -- ════════════════════════════════════════════════════════════════════════════
  -- NURSERY  (tuition ₹16,000 · 4 installments)
  -- ════════════════════════════════════════════════════════════════════════════

  -- 01: Standard existing student, no transport
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-001', 'Aarav Test Singh',       c_nursery, '2022-04-10', 'Deepak Test Singh',   '9811000001', 'active', 'TEST: standard existing, no transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 02: New student (student_type_default should be 'new' → higher academic fee)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-002', 'Ananya Test Sharma',     c_nursery, '2022-07-15', 'Rajesh Test Sharma',  '9811000002', 'active', 'TEST: new student — academic fee ₹1100')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 03: Transport student
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-NUR-003', 'Arjun Test Gupta',       c_nursery, '2022-01-20', 'Suresh Test Gupta',   '9811000003', r_amet_bus, 'active', 'TEST: Amet Bus transport')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 04: RTE student (tuition = ₹0)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-004', 'Kavya Test Meena',       c_nursery, '2022-03-05', 'Gopal Test Meena',    '9811000004', 'active', 'TEST: RTE — tuition zero')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Assign RTE discount to TEST-NUR-004
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-NUR-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE assignment', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 05: No phone number (edge case)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, status, notes)
  VALUES ('TEST-NUR-005', 'Rohit Test Rawat',       c_nursery, '2022-09-12', 'Amit Test Rawat',     'active', 'TEST: no phone number edge case')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 06: No DOB (edge case)
  INSERT INTO public.students (admission_no, full_name, class_id, father_name, primary_phone, status, notes)
  VALUES ('TEST-NUR-006', 'Priya Test Joshi',       c_nursery, 'Vijay Test Joshi',    '9811000006', 'active', 'TEST: no date of birth edge case')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════════
  -- JKG  (tuition ₹17,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-001', 'Aditya Test Bhandari',   c_jkg, '2021-06-18', 'Mahesh Test Bhandari', '9811000011', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-JKG-002', 'Shruti Test Patel',      c_jkg, '2021-03-22', 'Dinesh Test Patel',    '9811000012', r_amet_city, 'active', 'TEST: Amet City transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-003', 'Dev Test Chauhan',       c_jkg, '2021-11-30', 'Sunil Test Chauhan',   '9811000013', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Assign Staff Child discount to TEST-JKG-003
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-JKG-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child - father is school staff', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-JKG-004', 'Nisha Test Kumari',      c_jkg, '2021-08-14', 'Ram Test Kumar',       '9811000014', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════════
  -- SKG  (tuition ₹17,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-SKG-001', 'Vivaan Test Malhotra',   c_skg, '2020-05-25', 'Rohit Test Malhotra', '9811000021', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-SKG-002', 'Ishaan Test Saxena',     c_skg, '2020-02-08', 'Naveen Test Saxena',  '9811000022', r_makarda, 'active', 'TEST: Makarda route — long distance ₹14000')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-SKG-003', 'Pooja Test Yadav',       c_skg, '2020-09-17', 'Hemraj Test Yadav',   '9811000023', 'active', 'TEST: RTE student')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-SKG-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 1  (tuition ₹18,000) — 3rd Child family: SHARMA (child 1)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-001', 'Rahul Test Sharma',      c_cls1, '2018-03-12', 'Rajesh Test Sharma',  '9811000031', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL1-002', 'Sneha Test Tiwari',      c_cls1, '2018-07-21', 'Ajay Test Tiwari',    '9811000032', r_amet_bus, 'active', 'TEST: transport + standard')
  ON CONFLICT (admission_no) DO NOTHING;

  -- 3rd child (youngest) of SHARMA family
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-003', 'Ankit Test Sharma',      c_cls1, '2018-11-05', 'Rajesh Test Sharma',  '9811000033', 'active', 'TEST: 3rd Child Policy — SHARMA family child 1')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL1-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child Policy — SHARMA family', true)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_sharma, s_id, '3rd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-004', 'Meena Test Singh',       c_cls1, '2018-06-30', 'Bharat Test Singh',   '9811000034', 'active', 'TEST: new student — academic fee ₹1100')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL1-005', 'Tarun Test Rathore',     c_cls1, 'Karan Test Rathore',   '9811000035', 'active', 'TEST: no DOB')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 2  (tuition ₹18,500) — 3rd Child family: GUPTA (child 1)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-001', 'Gaurav Test Dubey',      c_cls2, '2017-04-14', 'Anil Test Dubey',     '9811000041', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL2-002', 'Pallavi Test Mishra',    c_cls2, '2017-09-26', 'Devendra Test Mishra','9811000042', r_jilola, 'active', 'TEST: Jilola route — long distance ₹17000')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-003', 'Riya Test Gupta',        c_cls2, '2017-01-18', 'Suresh Test Gupta',   '9811000043', 'active', 'TEST: 3rd Child — GUPTA family child 1')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL2-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child Policy — GUPTA family', true)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_gupta, s_id, '3rd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL2-004', 'Lokesh Test Verma',      c_cls2, '2017-12-07', 'Mahesh Test Verma',   '9811000044', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL2-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 3  (tuition ₹19,000) — SHARMA family child 2
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL3-001', 'Harsha Test Trivedi',    c_cls3, '2016-08-03', 'Mohan Test Trivedi',  '9811000051', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL3-002', 'Manish Test Bhatt',      c_cls3, '2016-04-20', 'Naresh Test Bhatt',   '9811000052', r_banda, 'active', 'TEST: Banda route ₹9500')
  ON CONFLICT (admission_no) DO NOTHING;

  -- SHARMA family child 2 (in Class 3 — older sibling of Class 1 child)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL3-003', 'Sunita Test Sharma',     c_cls3, '2015-09-11', 'Rajesh Test Sharma',  '9800000001', 'active', 'TEST: SHARMA family child 2 (older sibling)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL3-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_sharma, s_id, '2nd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL3-004', 'Kiran Test Kapoor',      c_cls3, '2016-11-28', 'Sanjay Test Kapoor',  '9811000054', 'active', 'TEST: Staff Child + transport')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL3-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 4  (tuition ₹19,500)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL4-001', 'Akash Test Pathak',      c_cls4, '2015-05-16', 'Dinesh Test Pathak',  '9811000061', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL4-002', 'Kajal Test Negi',        c_cls4, '2015-02-14', 'Prakash Test Negi',   '9811000062', r_amet_city, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL4-003', 'Mohit Test Agarwal',     c_cls4, '2015-10-02', 'Rajiv Test Agarwal',  '9811000063', 'active', 'TEST: RTE + transport combo')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL4-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE (transport fee still applies)', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 5  (tuition ₹20,000) — SHARMA family child 3 (oldest)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL5-001', 'Deepika Test Jain',      c_cls5, '2014-07-08', 'Santosh Test Jain',   '9811000071', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL5-002', 'Vishal Test Soni',       c_cls5, '2014-12-19', 'Ganesh Test Soni',    '9811000072', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL5-002' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- SHARMA family child 3 = eldest, no 3rd-child discount on them
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL5-003', 'Pooja Test Sharma',      c_cls5, '2013-04-25', 'Rajesh Test Sharma',  '9800000001', r_amet_bus, 'active', 'TEST: SHARMA family child 3 (eldest sibling)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL5-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_sharma, s_id, '1st child') ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 6  (tuition ₹21,000) — GUPTA family child 2
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-001', 'Saurabh Test Dubey',     c_cls6, '2013-09-04', 'Vinod Test Dubey',    '9811000081', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL6-002', 'Aarti Test Choudhary',   c_cls6, '2013-06-17', 'Rajesh Test Choudhary','9811000082', r_makarda, 'active', 'TEST: long route + standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-003', 'Nikhil Test Gupta',      c_cls6, '2012-11-22', 'Suresh Test Gupta',   '9800000002', 'active', 'TEST: GUPTA family child 2')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL6-003' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_gupta, s_id, '2nd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL6-004', 'Tanya Test Mathur',      c_cls6, '2013-03-29', 'Rakesh Test Mathur',  '9811000084', 'active', 'TEST: custom tuition override ₹15000 (manual exception)')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Apply manual tuition override via student_fee_overrides
  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL6-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_fee_overrides
      (student_id, academic_session_label, custom_tuition_fee_amount, override_reason, is_active)
    VALUES (s_id, 'TEST-2026-27', 15000, 'TEST: special management concession override', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 7  (tuition ₹22,000) — VERMA family: Staff Child + 3rd Child combo
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-001', 'Ritesh Test Pandey',     c_cls7, '2012-05-13', 'Kamlesh Test Pandey', '9811000091', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL7-002', 'Swati Test Rastogi',     c_cls7, '2012-08-25', 'Ashok Test Rastogi',  '9811000092', r_jilola, 'active', 'TEST: Jilola route')
  ON CONFLICT (admission_no) DO NOTHING;

  -- Staff Child + 3rd Child — lowest tuition wins: 50% of ₹22,000 = ₹11,000 vs ₹6,000 → ₹6,000 wins
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-003', 'Prateek Test Verma',     c_cls7, '2012-01-07', 'Mahesh Test Verma',   '9800000003', 'active', 'TEST: Staff Child + 3rd Child combo (₹6000 wins)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL7-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES
      (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child', true),
      (s_id, pol_3rd,   'TEST-2026-27', 'TEST: 3rd Child (lowest wins)', true)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_verma, s_id, '3rd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL7-004', 'Nidhi Test Gupta',       c_cls7, '2012-10-16', 'Suresh Test Gupta',   '9800000002', 'active', 'TEST: GUPTA family eldest')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL7-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_gupta, s_id, '1st child') ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 8  (tuition ₹23,000) — GUPTA family child 3 (eligible for 3rd child)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-001', 'Vikash Test Tomar',      c_cls8, '2011-07-31', 'Govind Test Tomar',   '9811000101', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL8-002', 'Ankita Test Singh',      c_cls8, '2011-04-09', 'Ramesh Test Singh',   '9811000102', r_amet_bus, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-003', 'Himanshu Test Gupta',    c_cls8, '2010-12-20', 'Suresh Test Gupta',   '9800000002', 'active', 'TEST: GUPTA family child 3 — 3rd Child discount')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL8-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child — GUPTA family youngest', true)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_gupta, s_id, '3rd child') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL8-004', 'Seema Test Tiwari',      c_cls8, '2011-09-03', 'Arun Test Tiwari',    '9811000104', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL8-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 9  (tuition ₹24,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-001', 'Rajat Test Sharma',      c_cls9, '2010-03-15', 'Vinay Test Sharma',   '9811000111', 'active', 'TEST: standard existing')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-002', 'Shalini Test Chouhan',   c_cls9, '2010-10-27', 'Vikram Test Chouhan', '9811000112', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL9-003', 'Sumit Test Rana',        c_cls9, '2010-06-08', 'Satpal Test Rana',    '9811000113', r_makarda, 'active', 'TEST: long route')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL9-004', 'Kavitha Test Menon',     c_cls9, '2010-01-14', 'Krishna Test Menon',  '9811000114', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL9-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- CLASS 10  (tuition ₹25,000) — Board exam year
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-001', 'Amit Test Verma',       c_cls10, '2009-05-21', 'Mahesh Test Verma',  '9811000121', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-002', 'Neha Test Pandey',      c_cls10, '2009-11-07', 'Suresh Test Pandey', '9811000122', 'active', 'TEST: RTE')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL10-002' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-CL10-003', 'Yash Test Bhardwaj',    c_cls10, '2009-08-17', 'Anil Test Bhardwaj', '9811000123', r_jilola, 'active', 'TEST: Jilola route')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-CL10-004', 'Simran Test Kaur',      c_cls10, '2009-02-03', 'Harjinder Test Singh','9811000124', 'active', 'TEST: custom override ₹20000')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-CL10-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_fee_overrides
      (student_id, academic_session_label, custom_tuition_fee_amount, override_reason, is_active)
    VALUES (s_id, 'TEST-2026-27', 20000, 'TEST: special case concession ₹5000 reduction', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 11 ARTS  (tuition ₹30,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-001', 'Ravi Test Sharma',       c_11arts, '2008-06-12', 'Devraj Test Sharma', '9811000131', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-002', 'Meghna Test Singh',      c_11arts, '2008-10-30', 'Balveer Test Singh',  '9811000132', 'active', 'TEST: new student ₹1100 academic fee')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11A-003', 'Tarun Test Lohar',       c_11arts, '2008-03-25', 'Bhanwar Test Lohar', '9811000133', r_amet_city, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-004', 'Sapna Test Kumari',      c_11arts, '2008-08-14', 'Laxman Test Kumar',   '9811000134', 'active', 'TEST: Staff Child (50% of ₹30000 = ₹15000)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11A-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child — tuition becomes ₹15000', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- RATHORE family eldest (in 11 Arts)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11A-005', 'Chirag Test Rathore',    c_11arts, '2008-01-19', 'Vikram Test Rathore', '9800000004', 'active', 'TEST: RATHORE family child 1')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11A-005' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_rathore, s_id, '1st child') ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 11 COMMERCE  (tuition ₹30,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-001', 'Rohit Test Agrawal',     c_11com, '2008-07-22', 'Pankaj Test Agrawal', '9811000141', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11C-002', 'Jyoti Test Mathur',      c_11com, '2008-05-09', 'Naresh Test Mathur',  '9811000142', r_banda, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-003', 'Gaurav Test Bajaj',      c_11com, '2008-12-03', 'Ramdev Test Bajaj',   '9811000143', 'active', 'TEST: 3rd Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11C-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child (₹6000 < 50% of ₹30000 = ₹15000)', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- RATHORE family child 2 (in 11 Commerce)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11C-004', 'Reena Test Rathore',     c_11com, '2007-09-16', 'Vikram Test Rathore', '9800000004', 'active', 'TEST: RATHORE family child 2')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11C-004' LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_rathore, s_id, '2nd child') ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 11 SCIENCE  (tuition ₹35,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-001', 'Arjun Test Rathod',      c_11sci, '2008-04-11', 'Dilip Test Rathod',   '9811000151', 'active', 'TEST: standard — highest class fee in 11th')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-11S-002', 'Priya Test Vyas',        c_11sci, '2008-09-28', 'Narayan Test Vyas',   '9811000152', r_makarda, 'active', 'TEST: transport + high fee')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-003', 'Kunal Test Shah',        c_11sci, '2008-02-17', 'Paresh Test Shah',    '9811000153', 'active', 'TEST: Staff Child (50% of ₹35000 = ₹17500)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11S-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child Science stream', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-004', 'Kalpana Test Bhatt',     c_11sci, '2008-11-06', 'Chandra Test Bhatt',  '9811000154', 'active', 'TEST: new student')
  ON CONFLICT (admission_no) DO NOTHING;

  -- RATHORE family child 3 (youngest — eligible for 3rd child ₹6000)
  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-11S-005', 'Suraj Test Rathore',     c_11sci, '2008-06-30', 'Vikram Test Rathore', '9800000004', 'active', 'TEST: RATHORE 3rd child — ₹6000 << ₹35000')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-11S-005' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child Science ₹6000 (huge saving)', true)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.student_family_members (family_group_id, student_id, birth_order_note)
    VALUES (fg_rathore, s_id, '3rd child') ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 12 ARTS  (tuition ₹32,000) — Final year Arts
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12A-001', 'Anand Test Solanki',     c_12arts, '2007-03-18', 'Mohan Test Solanki', '9811000161', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12A-002', 'Rekha Test Kumari',      c_12arts, '2007-10-05', 'Harlal Test Kumar',  '9811000162', r_amet_bus, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12A-003', 'Dev Test Lodha',         c_12arts, '2007-07-23', 'Babu Test Lodha',    '9811000163', 'active', 'TEST: RTE (final year)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12A-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE — final year', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12A-004', 'Poonam Test Mehta',      c_12arts, '2007-12-11', 'Jayant Test Mehta',  '9811000164', 'active', 'TEST: no phone number')
  ON CONFLICT (admission_no) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 12 COMMERCE  (tuition ₹32,000)
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12C-001', 'Vikas Test Agarwal',     c_12com, '2007-05-09', 'Rajesh Test Agarwal', '9811000171', 'active', 'TEST: standard')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12C-002', 'Mamta Test Gupta',       c_12com, '2007-09-14', 'Suresh Test Gupta',   '9811000172', r_amet_city, 'active', 'TEST: transport')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12C-003', 'Rohit Test Saxena',      c_12com, '2007-02-27', 'Naveen Test Saxena',  '9811000173', 'active', 'TEST: Staff Child')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12C-003' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child Commerce', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 12 SCIENCE  (tuition ₹38,000) — Highest fee class
  -- ════════════════════════════════════════════════════════════════════════════

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-001', 'Aman Test Soni',         c_12sci, '2007-01-08', 'Rajesh Test Soni',    '9811000181', 'active', 'TEST: standard — highest fee ₹38000')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-002', 'Asha Test Sharma',       c_12sci, '2007-04-16', 'Rajesh Test Sharma',  '9811000182', 'active', 'TEST: new student highest fee (₹38000 + ₹1100)')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, transport_route_id, status, notes)
  VALUES ('TEST-12S-003', 'Rishabh Test Jain',      c_12sci, '2007-08-22', 'Pramod Test Jain',    '9811000183', r_jilola, 'active', 'TEST: science + Jilola route (max total fee)')
  ON CONFLICT (admission_no) DO NOTHING;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-004', 'Tanvi Test Singh',       c_12sci, '2007-11-29', 'Balveer Test Singh',  '9811000184', 'active', 'TEST: RTE (tuition zero, still pays academic + installment)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-004' LIMIT 1;
  IF s_id IS NOT NULL AND pol_rte IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_rte, 'TEST-2026-27', 'TEST: RTE Science final year — tuition zero', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-005', 'Yuvraj Test Rajput',     c_12sci, '2007-06-04', 'Bharat Test Rajput',  '9811000185', 'active', 'TEST: Staff Child Science (50% of ₹38000 = ₹19000)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-005' LIMIT 1;
  IF s_id IS NOT NULL AND pol_staff IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_staff, 'TEST-2026-27', 'TEST: Staff Child — 50% of ₹38000', true)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.students (admission_no, full_name, class_id, date_of_birth, father_name, primary_phone, status, notes)
  VALUES ('TEST-12S-006', 'Kajal Test Patel',       c_12sci, '2007-03-12', 'Dinesh Test Patel',   '9811000186', 'active', 'TEST: 3rd Child Science (₹6000 vs ₹38000 — massive saving)')
  ON CONFLICT (admission_no) DO NOTHING;

  SELECT id INTO s_id FROM public.students WHERE admission_no='TEST-12S-006' LIMIT 1;
  IF s_id IS NOT NULL AND pol_3rd IS NOT NULL THEN
    INSERT INTO public.conventional_discount_assignments
      (student_id, policy_id, academic_session_label, assigned_by_note, is_active)
    VALUES (s_id, pol_3rd, 'TEST-2026-27', 'TEST: 3rd Child Science — biggest discount case', true)
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Verification summary
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  c.class_name,
  COUNT(s.id) AS student_count,
  COUNT(CASE WHEN cda.policy_id IS NOT NULL THEN 1 END) AS with_discount,
  COUNT(CASE WHEN s.transport_route_id IS NOT NULL THEN 1 END) AS with_transport,
  COUNT(CASE WHEN sfo.id IS NOT NULL THEN 1 END) AS with_override
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
LEFT JOIN public.conventional_discount_assignments cda
  ON cda.student_id = s.id AND cda.academic_session_label = 'TEST-2026-27' AND cda.is_active = true
LEFT JOIN public.student_fee_overrides sfo
  ON sfo.student_id = s.id AND sfo.academic_session_label = 'TEST-2026-27' AND sfo.is_active = true
WHERE c.session_label = 'TEST-2026-27'
  AND s.admission_no LIKE 'TEST-%'
GROUP BY c.class_name, c.sort_order
ORDER BY c.sort_order;
