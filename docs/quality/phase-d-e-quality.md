# Phase D/E Quality Guardrails

This file records the Phase D/E quality work from the deep-research plan.

## Offline Shell

- The service worker precaches only the offline fallback, manifest, and static branding assets.
- Navigation requests fall back to `public/offline.html` only when the network is unavailable.
- Payment posting, receipt generation, and other financial writes are never handled offline.
- The fallback copy says clearly that payments and receipts need the school server.

## Telemetry

- `lib/quality/office-telemetry.ts` defines a small, privacy-safe event contract.
- Metadata keys that could carry student, receipt, phone, email, address, or admission identifiers are rejected.
- Current events are workflow-quality signals only: offline shell readiness, search/selection milestones, payment attempt/confirmation, review-needed state, and report generation.
- The helper dispatches a browser event and performance mark; it does not transmit data to an external service.

## Budgets

The source of truth for budgets is `quality/office-quality-budgets.json`.

- LCP target: `2500ms`
- INP target: `200ms`
- CLS target: `0.1`
- Payment Desk search-to-selection target: `6000ms`
- Student-selected-to-receipt target: `30000ms`

Run `npm run quality:budgets` after substantial UI refactors.

## Visual Smoke Matrix

Use the `TEST-2026-27` session for visual checks.

Required surfaces:

- Dashboard
- Payment Desk
- Students
- Reports
- Admin Tools

Required viewports:

- Desktop office: `1440 x 900`
- Mobile counter: `390 x 844`

## Design Tokens

Formal token names live in `lib/design/office-tokens.ts` and map to the CSS variables in
`app/globals.css`. New visual work should use semantic tokens instead of raw one-off colors.
