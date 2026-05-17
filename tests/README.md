# Test Layout

Folder structure: see `docs/maps/folder-map.md`.
Keep this file focused on test suite responsibilities.

- `tests/unit`: isolated pure/domain logic tests.
- `tests/integration`: module/workflow/system integration tests.
- `tests/ui`: route/component/resilience/UI policy tests.
- `tests/db`: DB-focused checks and migration/view behavior tests.

Global setup remains `tests/setup.ts`.
