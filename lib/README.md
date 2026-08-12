# Lib Domain Map

Folder structure: see `docs/maps/folder-map.md`.
Keep this file focused on domain/data responsibilities.

There are **41 domains**. `docs/maps/folder-map.md` lists them all, grouped by purpose.

The ones worth knowing before you start: `fees` and `workbook` (the fee engine),
`payments` (posting), `money` (the label vocabulary — update `money/glossary.ts` first and
let the code follow), `segments` (the filter vocabulary, deliberately outside `students`
because that folder is `server-only`), `repayment-plans` (EMI), `prev-year-dues`
(carry-forward), `recovery` (students who left still owing), and `system-sync` (which busts
the cache tags every money path depends on).

Behavior is source-of-truth aligned: Students + Fee Setup drive dues and downstream reporting surfaces.
