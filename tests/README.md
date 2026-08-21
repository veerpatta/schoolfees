# Test layout

Counts live in [`docs/maps/repo-map.md`](../docs/maps/repo-map.md), which is
generated. This file is for the things a count cannot tell you.

- `tests/unit` (157) — pure and domain logic, no database.
- `tests/integration` (93) — module and workflow tests.
- `tests/ui` (93) — route, component and policy tests, of which
  `tests/ui/interaction` (27) is the jsdom + Testing Library project.
- `tests/helpers` — shared fixtures and builders.
- `tests/scan` — the source scan: 11 deterministic checks over every module,
  migration, locale file and route handler. `npm run scan`, about a minute, no
  database and no browser. See `tests/scan/README.md`.
- `tests/deep` — the permutation harness and the live MCP conformance suite.
  `npm run deep`. See `docs/qa/deep-test/README.md`.
- `tests/smoke-readiness`, `tests/smoke-2026-05` — Playwright, run separately.

`npm run test` runs vitest over two projects: `node` for everything, and
`interaction` (jsdom) for `tests/ui/interaction/**`. Each has its own setup file.

## Two things that will surprise you

**A large number of these tests assert on source strings and paths** — that a
component is still mounted, that a class recipe is still applied, that a budget
is still declared. A rename fails them. The fix is to repoint the assertion, not
to delete it: several of them encode a bug that already happened once. The
feature-first restructure moved 689 files and had to repoint hundreds of these,
and every one it missed failed loudly at test time, which is the safe direction.

**Redirects and `notFound()` in this app stream.** Next answers 200 with the
shell and the browser moves during hydration, after `networkidle` — so anything
asserting on a status code or a once-sampled `page.url()` reports working guards
as broken. That mistake produced 41 false P0s once. Wait for the destination.
