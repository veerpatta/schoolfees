# Multi-Session Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `2025-26`, `2026-27`, and `TEST-2026-27` work as cleanly separated working sessions across reads, writes, navigation, cache refresh, and payment posting.

**Architecture:** Centralize the working-session contract, pass the resolved session through page loaders and forms, and harden server writes so they cannot silently use the wrong year. Keep existing module boundaries and append-only finance behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres, Next cache tags, Vitest/React Testing Library.

---

### Task 1: Working Session Contract

**Files:**
- Modify: `lib/session/resolver.ts`
- Modify: `app/protected/session/actions.ts`
- Test: `tests/unit/session-resolver.test.ts`

- [ ] **Step 1: Add tests for production/test working-session metadata**

Create `tests/unit/session-resolver.test.ts` with tests that verify:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/active", () => ({
  getActiveSessionLabel: vi.fn(async () => "2026-27"),
}));

import { resolveViewSession } from "@/lib/session/resolver";

describe("resolveViewSession", () => {
  it("marks production sessions editable and collectable", async () => {
    const session = await resolveViewSession({ searchParamSession: "2025-26" });

    expect(session.sessionLabel).toBe("2025-26");
    expect(session.source).toBe("url");
    expect(session.isTest).toBe(false);
    expect(session.isProduction).toBe(true);
    expect(session.isEditable).toBe(true);
    expect(session.isCollectable).toBe(true);
  });

  it("marks test sessions editable and collectable but not production", async () => {
    const session = await resolveViewSession({ searchParamSession: "TEST-2026-27" });

    expect(session.sessionLabel).toBe("TEST-2026-27");
    expect(session.isTest).toBe(true);
    expect(session.isProduction).toBe(false);
    expect(session.isEditable).toBe(true);
    expect(session.isCollectable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused unit test and confirm it fails before implementation**

Run: `npm run test -- tests/unit/session-resolver.test.ts`

Expected before implementation: the new metadata properties are missing.

- [ ] **Step 3: Extend `ResolvedViewSession`**

Update `lib/session/resolver.ts` so `ResolvedViewSession` includes `isProduction`, `isEditable`, and `isCollectable`. `buildResolvedSession()` should set production to `!isTest`, and both editable/collectable to `true` for valid sessions.

- [ ] **Step 4: Run the focused unit test and confirm it passes**

Run: `npm run test -- tests/unit/session-resolver.test.ts`

Expected after implementation: PASS.

### Task 2: Session-Aware Navigation

**Files:**
- Modify: `lib/navigation/session-href.ts`
- Modify: `app/protected/dashboard/page.tsx`
- Modify: `app/protected/transactions/page.tsx`
- Modify: `app/protected/defaulters/page.tsx`
- Modify: `components/admin/sidebar-nav.tsx`
- Modify: `components/admin/mobile-bottom-nav.tsx`
- Test: `tests/unit/session-href.test.ts`
- Test: `tests/ui/nav-session-propagation.test.tsx`

- [ ] **Step 1: Add URL helper tests**

Create or extend `tests/unit/session-href.test.ts` to verify that session parameters are appended to protected links, preserved with hashes, and skipped for non-protected links.

- [ ] **Step 2: Tighten helper behavior**

Update `appendSessionParam()` to keep existing query values, preserve hash fragments, and allow callers to pass the resolved session label directly. Keep the helper small and pure.

- [ ] **Step 3: Fix module links that currently drop the selected session**

Update Dashboard, Transactions, Defaulters, sidebar, and mobile bottom nav links so shortcuts to Payment Desk, Students, Defaulters, Transactions, Exports, Admin Tools, receipt/student links, and repair links include the active working session where the target is under `/protected`.

- [ ] **Step 4: Run focused navigation tests**

Run: `npm run test -- tests/unit/session-href.test.ts tests/ui/nav-session-propagation.test.tsx`

Expected: PASS.

### Task 3: Session-Aware Payment Writes

**Files:**
- Modify: `components/payments/payment-entry-client.tsx`
- Modify: `app/protected/payments/page.tsx`
- Modify: `app/protected/payments/actions.ts`
- Modify: `lib/payments/data.ts`
- Test: `tests/integration/payment-session-guard.test.ts`

- [ ] **Step 1: Add payment guard tests**

Create `tests/integration/payment-session-guard.test.ts` to verify a submitted working session must match the selected student class session before payment posting proceeds.

- [ ] **Step 2: Add hidden working-session field to the payment form**

Pass `sessionLabel` from `PaymentEntryPageData` into the client form and submit it as `sessionLabel`.

- [ ] **Step 3: Guard the server action**

In `submitPaymentEntryAction()`, parse `sessionLabel`, load `getStudentDetail(studentId)`, reject if `student.classSessionLabel !== sessionLabel`, and only then call `postStudentPayment()`.

- [ ] **Step 4: Make posting policy session-aware**

Update payment mode parsing and receipt prefix selection to use the submitted working session. Use `getFeePolicyForSession(sessionLabel)` where payment policy is needed.

- [ ] **Step 5: Preserve cache refresh**

After successful payment, revalidate using the matched student/session label and student id.

- [ ] **Step 6: Run focused payment tests**

Run: `npm run test -- tests/integration/payment-session-guard.test.ts`

Expected: PASS.

### Task 4: Session-Aware Student And Import Writes

**Files:**
- Modify: `app/protected/students/actions.ts`
- Modify: `app/protected/students/new/page.tsx`
- Modify: `app/protected/imports/actions.ts`
- Modify: `app/protected/imports/page.tsx`
- Modify: `app/protected/imports/template/route.ts`
- Test: `tests/integration/student-session-guard.test.ts`
- Test: `tests/integration/import-session-flow.test.ts`

- [ ] **Step 1: Add student/import guard tests**

Add tests that cover class/session mismatch rejection and selected session propagation into import batches/templates.

- [ ] **Step 2: Pass working session into student forms and actions**

Ensure add/edit actions receive `sessionLabel` and reject selected classes from another session.

- [ ] **Step 3: Pass working session into import actions and templates**

Ensure upload, template download, and import-valid-rows paths use the selected working session, not the global default session.

- [ ] **Step 4: Run focused student/import tests**

Run: `npm run test -- tests/integration/student-session-guard.test.ts tests/integration/import-session-flow.test.ts`

Expected: PASS.

### Task 5: Session-Aware Fee Setup And Admin Repair

**Files:**
- Modify: `app/protected/fee-setup/page.tsx`
- Modify: `app/protected/fee-setup/actions.ts`
- Modify: `app/protected/admin-tools/page.tsx`
- Modify: `app/protected/dashboard/actions.ts`
- Modify: `lib/system-sync/finance-sync.ts`
- Test: `tests/integration/fee-setup-publish-active-session.test.ts`
- Test: `tests/unit/cache-safety-audit.test.ts`

- [ ] **Step 1: Verify existing tests cover publish/session behavior**

Run: `npm run test -- tests/integration/fee-setup-publish-active-session.test.ts tests/unit/cache-safety-audit.test.ts`

Expected: existing behavior is visible; failures indicate where active-session fallback remains.

- [ ] **Step 2: Pass working session into Fee Setup page data and actions**

Resolve view session on Fee Setup and use `getFeeSetupPageData({ sessionLabel })`. Save/preview/publish actions must target the submitted session.

- [ ] **Step 3: Pass working session into Admin Tools repair actions**

Ensure dashboard/admin repair actions operate on the selected session and revalidate `session:<sessionLabel>`.

- [ ] **Step 4: Run focused setup/cache tests**

Run: `npm run test -- tests/integration/fee-setup-publish-active-session.test.ts tests/unit/cache-safety-audit.test.ts`

Expected: PASS.

### Task 6: Session Setup Verification

**Files:**
- Modify: `scripts/verify-phase1-migrations.mjs`
- Create: `scripts/verify-required-sessions.mjs`
- Test: `tests/unit/migration-verification-scripts.test.ts`

- [ ] **Step 1: Add script tests**

Extend script tests so required session verification checks for `2025-26`, `2026-27`, and `TEST-2026-27`.

- [ ] **Step 2: Implement verification script**

Create a non-destructive script that reports whether each required session has an academic session row, fee policy config, class rows, and class fee defaults.

- [ ] **Step 3: Run script tests**

Run: `npm run test -- tests/unit/migration-verification-scripts.test.ts`

Expected: PASS.

### Task 7: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run tests**

Run: `npm run test`

Expected: PASS or clearly identify pre-existing failures.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Review git diff**

Run: `git diff --stat` and inspect changed files for unrelated edits.

Expected: only session pipeline, tests, scripts, and docs changed.
