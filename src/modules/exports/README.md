# exports

Every XLSX and printable the office downloads, and the AI context bundle.

| | |
|---|---|
| Route | `/protected/exports` · `/protected/exports/[exportType]` |
| Files | 1 domain · 2 data |

## Owns

- The response builders every export shares: xlsx, printable HTML, and the
  student-information column set
- The AI context bundle — a 16-sheet workbook built from ~14 reads
- Parsing the defaulter filters an export inherits from the screen

## Invariants

- **The export follows the filter.** Downloading "all students" while the
  Students page is filtered to "Never paid" and getting all 509 back is the same
  surprise as the filter not applying at all.
- Every response is wrapped once by `withDownloadToken`, so the client's spinner
  knows when the file actually started arriving. The route has a dozen return
  paths; wrapping each one is how one gets missed.
- Exports carrying Aadhaar (`student-master`, `ai-context-bundle`) check
  `students:view` as well as `reports:view`.
- **A reversed receipt is never summed.** Every sheet that totals receipt money
  consults reversal state first.

## Never

- Report an empty sheet as an absence. The bundle checks every read and says
  where it is incomplete, because a reader cannot tell "no data" from "read
  failed" by looking at a blank tab.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
This module has no `ui/`: `/protected/exports` is a page of links, and the
downloads are route handlers.

The route itself stays in `src/app` and is a dispatcher: it authenticates,
resolves the session and segments, and hands off. It was 2,182 lines before the
builders moved here.
