-- =============================================================================
-- SVP SCHOOL — SCRIPT 3: CLEAR EXISTING STUDENT DATA
-- ⚠️  DANGER: This permanently deletes student records.
-- ⚠️  Only run this if you are CERTAIN the 2026-27 data should be wiped.
-- ⚠️  This script cannot be undone without a database backup restore.
--
-- SAFE VERSION: Only deletes students who have NO posted payments or receipts.
-- Students with financial history are preserved (append-only rule).
--
-- To run a FULL wipe of ALL students (including those with history),
-- uncomment the FULL WIPE section at the bottom — but only on staging/test.
-- =============================================================================

-- ── Step 1: Preview what will be deleted (run this first, look at results) ──

SELECT
  s.admission_no,
  s.full_name,
  c.session_label,
  c.class_name,
  s.status,
  COALESCE(p.payment_count, 0) AS payment_count,
  COALESCE(p.total_paid, 0) AS total_paid,
  CASE WHEN COALESCE(p.payment_count, 0) = 0 THEN 'SAFE TO DELETE' ELSE 'HAS PAYMENTS — PROTECTED' END AS deletion_status
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
LEFT JOIN (
  SELECT r.student_id, COUNT(*) AS payment_count, SUM(r.total_amount) AS total_paid
  FROM public.receipts r
  GROUP BY r.student_id
) p ON p.student_id = s.id
WHERE c.session_label IN ('2026-27', '2025-26')  -- ← adjust session labels as needed
  AND s.admission_no NOT LIKE 'TEST-%'           -- ← never touch test students
ORDER BY c.session_label, c.sort_order, s.full_name;

-- ── Step 2: Check total counts ──

SELECT
  c.session_label,
  COUNT(*) AS total_students,
  COUNT(CASE WHEN COALESCE(p.payment_count, 0) = 0 THEN 1 END) AS safe_to_delete,
  COUNT(CASE WHEN COALESCE(p.payment_count, 0) > 0 THEN 1 END) AS has_payments_protected
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
LEFT JOIN (
  SELECT student_id, COUNT(*) AS payment_count
  FROM public.receipts
  GROUP BY student_id
) p ON p.student_id = s.id
WHERE c.session_label IN ('2026-27', '2025-26')
  AND s.admission_no NOT LIKE 'TEST-%'
GROUP BY c.session_label;

-- =============================================================================
-- ⚠️  STEP 3 — ACTUAL DELETION (safe version)
-- Delete student_fee_overrides, discount_assignments, and student records
-- Only for students with NO payment history.
-- Uncomment the block below when ready. Review Step 1 output first.
-- =============================================================================

/*
DO $$
DECLARE
  safe_student_ids uuid[];
BEGIN

  -- Find students safe to delete (no payments, not TEST-)
  SELECT array_agg(s.id) INTO safe_student_ids
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE c.session_label IN ('2026-27', '2025-26')   -- adjust as needed
    AND s.admission_no NOT LIKE 'TEST-%'
    AND NOT EXISTS (
      SELECT 1 FROM public.receipts r WHERE r.student_id = s.id
    );

  IF safe_student_ids IS NULL OR array_length(safe_student_ids, 1) = 0 THEN
    RAISE NOTICE 'No students are safe to delete (all have payment history or session is empty).';
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting % students with no payment history...', array_length(safe_student_ids, 1);

  -- Delete student_fee_overrides
  DELETE FROM public.student_fee_overrides
  WHERE student_id = ANY(safe_student_ids);

  -- Delete conventional discount assignments
  DELETE FROM public.conventional_discount_assignments
  WHERE student_id = ANY(safe_student_ids);

  -- Delete from student_family_members
  DELETE FROM public.student_family_members
  WHERE student_id = ANY(safe_student_ids);

  -- Delete installment rows (only if no payments against them)
  DELETE FROM public.installments
  WHERE student_id = ANY(safe_student_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p WHERE p.installment_id = installments.id
    );

  -- Delete students
  DELETE FROM public.students
  WHERE id = ANY(safe_student_ids);

  RAISE NOTICE 'Done. % students deleted safely.', array_length(safe_student_ids, 1);

END $$;
*/

-- =============================================================================
-- ⚠️  FULL WIPE — STAGING / TEST ENVIRONMENTS ONLY
-- Completely empties all student data from specific sessions.
-- NEVER run this on a database with real payment history.
-- =============================================================================

/*
-- CONFIRM you are on staging/test before uncommenting this

DO $$
BEGIN
  -- Verify no receipts exist before proceeding
  IF EXISTS (SELECT 1 FROM public.receipts LIMIT 1) THEN
    RAISE EXCEPTION 'ABORT: Receipts exist in this database. This is not a clean test environment. Use the safe delete above instead.';
  END IF;

  -- If no receipts exist, safe to wipe everything
  DELETE FROM public.conventional_discount_assignments
  WHERE academic_session_label IN ('2026-27', '2025-26');

  DELETE FROM public.student_family_members sm
  USING public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE sm.student_id = s.id
    AND c.session_label IN ('2026-27', '2025-26')
    AND s.admission_no NOT LIKE 'TEST-%';

  DELETE FROM public.student_fee_overrides sfo
  USING public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE sfo.student_id = s.id
    AND c.session_label IN ('2026-27', '2025-26')
    AND s.admission_no NOT LIKE 'TEST-%';

  DELETE FROM public.installments inst
  USING public.students s
  JOIN public.classes c ON c.id = s.class_id
  WHERE inst.student_id = s.id
    AND c.session_label IN ('2026-27', '2025-26')
    AND s.admission_no NOT LIKE 'TEST-%';

  DELETE FROM public.students s
  USING public.classes c
  WHERE s.class_id = c.id
    AND c.session_label IN ('2026-27', '2025-26')
    AND s.admission_no NOT LIKE 'TEST-%';

  RAISE NOTICE 'Full wipe complete for sessions 2026-27 and 2025-26.';
END $$;
*/
