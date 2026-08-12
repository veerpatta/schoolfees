# Test Layout

Folder structure: see `docs/maps/folder-map.md`.
Keep this file focused on test suite responsibilities.

- `tests/unit` (119 files): isolated pure/domain logic tests.
- `tests/integration` (90): module/workflow/system integration tests.
- `tests/ui` (82): route/component/resilience/UI policy tests.
- `tests/ui/interaction`: the jsdom + Testing Library subset — its own vitest project.
- `tests/helpers`: shared fixtures and builders.
- `tests/smoke-readiness`, `tests/smoke-2026-05`: Playwright, run separately.

There is **no `tests/db`**; earlier versions of this file claimed one.

`npm run test` runs **291 files / 1,777 tests** across two vitest projects — `node` for
everything, and `interaction` (jsdom) for `tests/ui/interaction/**`. Each has its own setup
file: `tests/setup.ts` and `tests/ui/interaction/setup.ts`. Playwright is
`npm run smoke:readiness`.

**A large number of these tests assert on source strings** — that a component is still
mounted, that a class recipe is still applied, that a budget is still declared. A refactor
that renames something will fail them. The fix is to repoint the assertion at the new name,
not to delete it: several of them encode a bug that already happened once.
