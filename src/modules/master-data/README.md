# master-data

The school's own lists: sessions, classes, routes.

| | |
|---|---|
| Route | /protected/master-data |
| Files | 1 data · 1 ui |

## Owns

- Academic sessions, classes and sections, transport routes

## Invariants

- Session labels parse through `parseAcademicSessionLabel()`. `2026-27` is live; `TEST-`, `UAT-` and `DEMO-` prefixes are the test forms.

## Never

- Delete a class or route that installments still reference.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
