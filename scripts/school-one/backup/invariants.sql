-- What the backup has to still be true about, after it is restored.
--
-- A dump that restores without error is not the same as a dump that restored
-- the right thing. These are the numbers the restore drill compares against the
-- manifest taken at dump time: if they match, the data came back; if they do
-- not, the backup is decoration.
--
-- STRICTLY READ-ONLY. This runs against the live production database from
-- GitHub Actions. It must never write a row, and every statement here is a
-- SELECT.
--
-- Run with: psql "$SUPABASE_PROD_DB_URL" --csv -f invariants.sql > invariants.csv

\pset footer off

-- 1. Row count for every table in public, generated from the catalogue rather
--    than a hand-kept list, so a table added next month is covered without
--    anybody remembering to add it here.
--    count(*) per table needs dynamic SQL; xpath over query_to_xml is the
--    read-only way to get it from a plain SELECT, with no function to create
--    and nothing left behind.
select
  'table_count' as kind,
  tablename as label,
  (xpath(
    '/row/cnt/text()',
    query_to_xml(
      format('select count(*) as cnt from public.%I', tablename),
      false, true, ''
    )
  ))[1]::text::bigint as value
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. Money, anchored the way the app anchors it.
--
--    A payment has no session of its own. It belongs to an installment, which
--    belongs to a class, which carries the session label — the same path every
--    money figure in the app follows. Summing payments without it would give
--    one number for every year at once, which would match after a restore
--    while hiding a whole session going missing.
select
  'payments_by_session' as kind,
  c.session_label as label,
  sum(p.amount)::bigint as value
from public.payments p
join public.installments i on i.id = p.installment_id
join public.classes c on c.id = i.class_id
group by c.session_label
order by c.session_label;

-- 3. Receipts, as one number. Append-only, so it may only ever grow; a restore
--    that comes back with fewer has lost history that cannot be reconstructed.
select
  'receipt_count' as kind,
  'all' as label,
  count(*)::bigint as value
from public.receipts;

-- 4. Students by status. Headcount and money count different populations in
--    this app deliberately, so the status split is what makes a difference
--    visible rather than a single total that can stay level while the mix moves.
select
  'students_by_status' as kind,
  status::text as label,
  count(*)::bigint as value
from public.students
group by status
order by status;
