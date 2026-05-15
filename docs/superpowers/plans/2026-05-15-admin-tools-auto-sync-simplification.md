# Admin Tools Auto Sync Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Admin Tools simpler, make routine sync automatic, and ensure the main session switcher always shows `2025-26`, `2026-27`, and `TEST-2026-27`.

**Architecture:** Keep source-of-truth writes in Students and Fee Setup. Add a small required-session merge helper for the header switcher, add a safe auto-reconcile helper that only prepares missing dues when class fee setup is complete, and simplify Admin Tools into status plus a Session Health fallback.

**Tech Stack:** Next.js App Router, server actions, Supabase-backed loaders, Vitest static and integration tests.

---

### Task 1: Required Sessions In Switcher

**Files:**
- Modify: `app/protected/session/actions.ts`
- Test: `tests/ui/session-pill.test.tsx`

- [x] Merge required sessions into `listAvailableSessionsAction()` after loading database sessions.
- [x] Mark required missing sessions as active rows with stable synthetic ids.
- [x] Preserve real DB rows when present.
- [x] Verify test session grouping remains visible.

### Task 2: Safe Automatic Reconcile

**Files:**
- Modify: `lib/system-sync/finance-sync.ts`
- Modify: `app/protected/admin-tools/page.tsx`
- Modify: `app/protected/admin-tools/session-health/page.tsx`
- Test: `tests/integration/auto-session-reconcile.test.ts`

- [x] Add `autoReconcileSessionIfSafe(sessionLabel)` facade.
- [x] Only run repair when health shows missing dues, no class fee gaps, and no health errors.
- [x] Re-read health after reconcile.
- [x] Use it from Admin Tools and Session Health so normal viewing quietly fixes safe gaps.

### Task 3: Simplify Admin Tools

**Files:**
- Modify: `app/protected/admin-tools/page.tsx`
- Test: `tests/ui/admin-tools-simplification.test.tsx`

- [x] Replace the manual repair block with automatic-sync status copy.
- [x] Show only selected-session health cards and a Session Health link.
- [x] Keep technical setup/admin sections, but remove legacy repair buttons from the main flow.

### Task 4: Verification

**Files:**
- Modify tests as needed.

- [x] Run focused tests.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm run test`.
- [x] Run `npm run build`.
- [x] Commit and push `main`.
