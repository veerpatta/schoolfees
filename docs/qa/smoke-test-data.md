# Smoke-test logins and data

Everything needed to smoke-test the app without hand-building a scenario first.
Five logins, one per role, and a catalogue of `TEST-` students chosen so that
every interesting permutation already exists somewhere.

**Session: `TEST-2026-27` only.** `2026-27` is live and carries real family
money. Never post a test payment, add test data, or run an experiment against
it — hard safety rule 6 in `CLAUDE.md`.

> Passwords are in `docs/qa/credentials.local.md`, which is **gitignored**.
> These are real logins against the production project, so a password in git
> history would hand anyone with repo access a session over real student and
> payment records. If that file is missing, re-create the accounts with
> `scripts/bootstrap-test-staff.mjs` (below) and write a new one.

---

## 1. Logins

| Email | Role | Should land on |
|---|---|---|
| `qa.admin@qa.vpps.local` | `admin` | Dashboard |
| `qa.accountant@qa.vpps.local` | `accountant` | Payment Desk |
| `qa.teacher@qa.vpps.local` | `teacher` | Students |
| `qa.collector@qa.vpps.local` | `fee_collector` | Defaulters |
| `qa.viewonly@qa.vpps.local` | `view_only` | Dashboard |

The landing route comes from `getDefaultProtectedHref()` in
`lib/config/navigation.ts`. A login that lands somewhere else is a permission
bug wearing a redirect, not a cosmetic one — check it every round.

Re-create or rotate:

```bash
TEST_STAFF_PASSWORD='<password>' node scripts/bootstrap-test-staff.mjs
```

Turn them all off between rounds (keeps the rows, flips `is_active`):

```bash
TEST_STAFF_PASSWORD='x' node scripts/bootstrap-test-staff.mjs --disable
```

### What each role must NOT be able to do

| Role | Denied |
|---|---|
| `teacher` | Fee exceptions, conventional discounts, SR no, posting payments |
| `fee_collector` | Editing students, Fee Setup, Admin Tools |
| `view_only` | Every write. No Collect button, no Edit, no Save anywhere |
| `accountant` | Admin Tools, Staff Management |

`teacher` is the sharp one: they hold `students:edit_basic` but not
`students:write`, so the edit form must render *and* silently restore every fee
field server-side. `updateStudentAction` does that — see the absent-vs-empty
note in `app/protected/students/actions.ts`.

---

## 2. Students by scenario

79 `TEST-` students exist. These are the ones worth opening.

### Money states

| SR no | Student | State |
|---|---|---|
| `TEST-12S-003` | Rishabh Test Jain | **Left, still owes ₹55,500**, has an EMI plan → `lib/recovery` |
| `TEST-11C-002` | Jyoti Test Mathur | **Inactive**, owes ₹40,000 → posting and editing refused, record visible |
| `TEST-CL2-004` | Lokesh Test Verma | **Graduated**, nothing owed |
| `TEST-CL7-002` | Swati Test Rastogi | Never paid, ₹39,500 due, 2 overdue |
| `TEST-11S-002` | Priya Test Vyas | Part-paid (₹13,750 of ₹50,500) |
| `TEST-NUR-001` | Aarav Test Singh | Paid more than due so far — credit on file |
| `TEST-NUR-004` | Kavya Test Meena | RTE, **₹0 due** — the fully-clear case |

### Late fee is not a fee

The rule that breaks most often. A family whose only debt is a late fee is
**not** a defaulter, and `pending_amount` must never include it.

| SR no | Fees due | Late fee due | Must show as |
|---|---|---|---|
| `TEST-CL10-002` | **₹0** | ₹1,000 | `paid` balance status, **not** in Defaulters |
| `TEST-CL8-004` | **₹0** | ₹1,000 | same |
| `TEST-JKG-003` | ₹6,125 | **₹2,000** | two late fees accrued |
| `TEST-CL4-002` | ₹13,250 | **₹250** | partially waived late fee, on an EMI plan |

Verify with `node scripts/verify-late-fee-health.mjs --session TEST-2026-27`
(8 invariants). It must stay green after any money change.

### Conventional discounts

| SR no | Policy | Expected tuition |
|---|---|---|
| `TEST-12A-003`, `TEST-12S-004`, `TEST-NUR-004`, `TEST-CL4-003`, `TEST-SKG-003` | RTE | ₹0 |
| `TEST-11A-004`, `TEST-11S-003`, `TEST-12C-003`, `TEST-CL3-004`, `TEST-CL5-002`, `TEST-CL9-004` | Staff Child | 50% |
| `TEST-11C-003`, `TEST-11S-005`, `TEST-12S-006`, `TEST-CL1-003`, `TEST-CL2-003`, `TEST-CL8-003` | 3rd Child | ₹6,000 |
| `TEST-CL7-003` | **Staff Child + 3rd Child** | Two policies — the max-2 rule, lowest candidate wins |

### Fee exceptions

| SR no | Exception |
|---|---|
| `TEST-CL6-004` | Custom tuition **₹15,000** ("TEST: special management concession override") |
| `TEST-CL10-004` | Custom tuition ₹20,000 |
| `TEST-NUR-004` | Manual discount ₹1,000 from a close-due-as-discount |

`TEST-CL6-004` is the regression student: save anything else on them and that
₹15,000 must still be ₹15,000 afterwards.

### EMI / repayment plans

`TEST-12S-003` (also *left*), `TEST-CL4-002` (also partial late-fee waiver),
`TEST-NUR-002`. A plan is never edited in place — rescheduling writes a
replacement and supersedes the old one.

### Families / siblings

`TEST-CL1-003`, `TEST-CL2-003`, `TEST-CL8-003`, `TEST-11S-005`. Confirmed
families only; phone-match detection was removed and must not come back.

### Edge cases

| SR no | Edge |
|---|---|
| `TEST-NUR-005` | **No phone at all** → WhatsApp share and call must be hidden, not broken |
| `TEST-12S-002` | Email set, no other info → receipt `mailto:` without a full record |
| Two students | Missing DOB → `missing_dob_flag` on the workbook view |

---

## 3. Student information (the Info tab)

25 optional fields, added `20260813090000`. Coverage is deliberately uneven so
both the "full" and "mostly blank" renderings get exercised.

| SR no | Fields filled | Use it for |
|---|---|---|
| `TEST-CL7-002` | **25 / 25** | Desk panel with no em dashes; phone shows no "not filled" line |
| `TEST-12C-002` | 5 | Phone card drops blanks and prints a count |
| `TEST-CL6-004` | 5 (+ Aadhaar, + ₹15,000 override) | The partial-write regression |
| `TEST-12A-002` | 3 (+ Aadhaar) | Duplicate-Aadhaar collision partner |
| `TEST-12S-002` | 0 | Every group empty |

Aadhaar numbers on file: `TEST-CL6-004` = `123456789012`,
`TEST-12A-002` = `555566667777`, `TEST-CL7-002` = `222233334444`.

**Checks worth doing every round:**

1. Type `1234 5678 9012` with spaces — it must store as 12 digits.
2. Type 11 digits — must fail with "Enter all 12 digits", not save.
3. Put `TEST-12A-002`'s Aadhaar on another student — must show *"already
   recorded against another student"*, not a raw Postgres error.
4. Open `TEST-CL6-004`, save the **Address** group only, then confirm the
   ₹15,000 tuition override and the Aadhaar are both untouched. This is the
   whole reason `updateStudentInfoAction` exists.
5. Desk shows blanks as `—`; phone hides them and prints "N not filled".

---

## 4. Mobile

Resize to **390 × 844** (the `mobile-counter` viewport in
`quality/office-quality-budgets.json`) and reload — some gates only run at load.

- Student profile header shows a **pencil** next to the call button. Until
  `20260813` there was no route to the edit form from any phone surface.
- The edit form groups into tabs: Student · Parents · Info · Fees · Status.
  Switch tabs, fill a field in two different tabs, save — **both must persist**.
  If one is lost, a panel is being unmounted instead of CSS-hidden, and that is
  the FormData wipe.
- Force a validation error. The grouping must disappear and show every panel,
  because the error summary focuses the offending control and cannot reach one
  inside `display:none`.
- Any sheet's Save must sit in the pinned footer and survive the keyboard.

---

## 5. Regression sweep

```bash
npm run check && npm run test
npm run quality:budgets
npm run quality:bundles:check
node scripts/verify-late-fee-health.mjs --session TEST-2026-27
node scripts/verify-live-fee-health.mjs
node scripts/audit-test-data-in-public.mjs
```

The last one is the important one after a session like this: it is read-only and
reports any `TEST-` data that has leaked into the live `2026-27` session.

## 6. Resetting

The scenario states above were set with plain `UPDATE`s on `TEST-` rows
(`status`, `left_on`, and the information columns). Nothing here regenerated
dues or touched a receipt, so there is no cleanup step — re-run the statements
in this doc's history if a round leaves the data somewhere unexpected.

If a smoke round *does* post payments, remember receipts are append-only: a
reversal is a `payment_adjustment`, never a delete.
