# staff

Staff accounts, roles, and password change.

| | |
|---|---|
| Route | /protected/staff · /protected/password |
| Files | 1 data · 2 ui |

## Owns

- Staff records and role assignment
- Own-password change

## Invariants

- Five roles: `admin`, `accountant`, `teacher`, `fee_collector`, `view_only`. Legacy aliases `read_only_staff` and `defaulter_followup` still resolve.
- Roles are enforced twice: `requireAuthenticatedStaff()` in the app layer and RLS in Postgres. The MCP Worker keeps a third copy in `src/permissions.mjs`, held equivalent by `tests/unit/mcp-permissions.test.ts`.

## Never

- Re-enable public signup.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
