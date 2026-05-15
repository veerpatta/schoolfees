-- vpps-latest-2026-05-15-fullbook: mark Left_Students status=left (never delete)
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0025'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0035'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0044'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0057'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = 'DIRECT-20260514-M0159';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0073'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0093'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0109'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '25555505';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0130'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = 'PENDING-SR-0061';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0139'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0149'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '97';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0158'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0173'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '571';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0177'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '436';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0181'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0196'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0199'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '95842';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0219'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '5552526';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0220'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0224'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '785558';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0239'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '439';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0248'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '360';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0255'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '369';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0260'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '532622';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0264'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0267'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0271'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '7655';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0275'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '626';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0283'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '366';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0286'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '393';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0312'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '396';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0314'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '242';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0316'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '556';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0329'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '595';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0337'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '494';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0342'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '21120';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0343'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '515';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0345'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '565';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0350'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '659';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0362'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0412'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0414'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '2275';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0428'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '565767';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0431'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '67745R';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0451'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0470'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0492'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0517'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and admission_no = '619';
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0538'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0539'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0540'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0543'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0544'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0546'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0547'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0548'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0549'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0550'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0551'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0553'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0554'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0555'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0556'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0557'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0558'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0559'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0560'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || 'Not present in latest PSP PDFs and not in New Admissions Excel',
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = 'STU-0561'
      and import_name = 'vpps-latest-2026-05-15-fullbook'
  );
