# Students

The student master, and every per-student exception to the fee policy.

| | |
|---|---|
| Routes | `/protected/students`, `/[studentId]`, `/[studentId]/edit`, `/[studentId]/statement`, `/new`, `/bulk-update` |
| Handlers | `/students/index` (search), `/students/photo`, `/[studentId]/fee-pdf`, `/family/[familyGroupId]/{fee-pdf,statement}` |
| Components | `src/modules/students/ui/` |
| Lib | `src/modules/students/` (server-only), `src/modules/students/` (shared with Transactions) |

## The list

Backed by `v_student_directory` — one filterable row per student per session, so a
predicate and its count come from the same query.

That matters because of how it used to work: the list picked 40 identities first and
enriched them with money second, so a dues filter would narrow the page while the header
count reported the unfiltered total. Anything money-shaped was computed after the fact,
printed on the row, and unreachable as a filter.

**24 segment chips in four families** — money, enrolment, quality, fee profile — each with
a live count, on Students and Transactions both. `src/modules/students/domain/student-segments.ts` defines
them; the `seg_*` columns in the view implement them.

Three rules:

- **OR within a family, AND across families.** "Overdue + Fully paid" must mean *either* —
  those buckets are mutually exclusive, and ANDing them returns nothing, which reads as a
  broken filter.
- **A family never scopes its own counts.** Scope every count by every selection and each
  unselected chip reads 0 — the classic broken-facet bug.
- **Every `seg_*` must mirror the TypeScript predicate it replaces, quirks included.** A
  filter that disagrees with the number printed on the row it filters is worse than no
  filter.

Fee-profile chips carry `requiresPermission: "fees:view"`. `student_fee_overrides` has
narrower RLS than `students`, so a teacher gets a NULL join and would read a confident
`false` — hide the chip rather than show a wrong zero.

`src/modules/students` sits outside `src/modules/students` on purpose: that folder is `server-only`, and
Transactions imports the segment vocabulary into the browser.

## The student page

Built around payment history, which is what the page is actually opened for.

**Identity bar** → **money band** (Outstanding · Paid this session · Session fee · Last
receipt, with one mutually-exclusive status ribbon) → **four tabs, Receipts first and
default**.

Every figure has exactly one home. The previous version rendered `outstandingAmount` under
eight different labels across 2,150px of page, with receipts 1,100px down.

Two constraints that are easy to break:

- **One saffron CTA per screen** (design system §6). `StudentRowCollectButton
  variant="primary"` hardcodes `bg-accent`, so mounting it beside another accent button
  ships two.
- **The phone branch is a separate subtree.** Desktop work sits inside `hidden md:block`;
  `md:hidden` renders unchanged. A `md:hidden` block *inside* a `hidden md:block` tree can
  never render — two such dead blocks were found and deleted.

## Student information (the Info tab)

25 optional columns on `public.students` — identity, government IDs, school record,
structured address, guardian and emergency contact — added in `20260813090000`. They are
declared exactly once, in **`src/modules/students/domain/info-fields.ts`**, and everything else maps over
that table: the select list, the row mapper, the form reader, the validator, the labels,
the desk panel, the phone cards and the edit inputs. Adding a 26th field is one entry
there, one column in a migration, and one label key in each of the three catalogues.

Three things to know before touching it:

- **The tab key is still `about`.** Only the label changed to "Info", so existing links and
  the legacy `?tab=profile|notes|history` mappings in `normalizeTab()` keep working.
- **Desk shows every field including blanks; the phone shows only filled rows** plus an
  "N not filled" line. On a desk the gaps are the point — they are the list of what still
  has to be collected. On a phone they would be four screens of em dashes.
- **`updateStudentInfoAction` is deliberately not `updateStudentAction`.** The quick-edit
  sheets post one group at a time, which is the exact shape that goes wrong in the big
  action's absent-vs-empty restore. The narrow action builds its `UPDATE` from the fields
  the form actually rendered, so fees, class, discounts, status and SR no are never in the
  statement. `toStudentInfoColumns` omits keys it was not given for the same reason;
  `tests/ui/student-info-fields.test.ts` guards it.

`students.aadhaar_no` carries a partial unique index — two students cannot share an
Aadhaar. The `23505` is mapped to a field-level message via `isDuplicateAadhaarError`,
matched on the index name so a duplicate SR no does not point at the wrong field.

### The three spreadsheet surfaces

The fields also cross the **Student Master export**, the **import template** and the
**bulk-update sheet**, and the only thing joining those three is the column header string.
That makes `field.header` load-bearing in a way a UI label never was: an export writing
"Aadhaar no" against an importer that only knows "Aadhaar number" looks like a working
round trip until the re-upload drops the column, which reads to the office as data loss.

So `header` lives in the descriptor next to `labelKey`, and is deliberately **not**
translated — an uploaded sheet is matched back on it, and a header that changed with the
operator's locale would read as "column not recognised". `tests/unit/student-info-round-trip.test.ts`
downloads the Update template's headers, feeds them to `buildAutoColumnMapping`, and
asserts every field maps back to itself.

Two rules that carry money-shaped risk:

- **The import template appends, never inserts.** `buildStudentTemplateValidations` pins
  the class, route, New/Old and policy dropdowns to fixed column *numbers*, so a column
  added ahead of them silently attaches a dropdown to the wrong column. The test asserts
  those indexes.
- **An unmapped column must not blank a saved value.** The commit path applies the same
  `hasMappedValue` guard the importer already used for Class: an office uploading a
  phone-number correction has no Aadhaar column in that file, and reading its absence as
  "clear it" would empty a register they spent a term filling in. Rows staged before these
  fields existed have no `info` key at all, so the deserializer defaults it — a
  half-uploaded batch still commits after a deploy.

Bulk update generates its entries from the same catalogue, all with `affectsFees: false`:
correcting an Aadhaar never regenerates dues.

## Editing from a phone

`/protected/students/[id]/edit` always rendered fine on a phone; until `20260813` it was
simply unreachable from one — both entry points sat inside `hidden md:block` trees, and the
list's row action was hover-only. `MobileStudentProfile` now carries a pencil in its sticky
header (not the bottom bar, which owns Collect).

The form itself is ~50 controls, so on a phone it groups into `MobileTabs`
(Student · Parents · Info · Fees · Status). **Panels are hidden with `hidden md:block`, never
conditionally rendered** — an unmounted panel drops its inputs from `FormData`, and the save
then reads as "the form never offered this field". That is the wipe described above, arrived
at from the other direction. `md:block` also means the desk tree is unchanged: every group
visible at once, as the no-disclosure rule requires. A failed save drops the grouping
entirely, because the error summary focuses the offending control and cannot reach one
inside a `display:none` panel.

## Per-student exceptions

- **`student_fee_overrides`** — custom tuition, transport, academic fee, other heads, a
  per-student late-fee rate, and a manual discount. Editing requires `fees:write` and a
  reason of at least four characters, from **both** editors: the fee panel in the edit form
  and `StudentFeePlanSheet`. Two editors writing the same money columns under different
  contracts is how these drift.
- **Conventional discounts** — RTE / Staff Child / 3rd Child and custom policies, assigned
  explicitly, never inferred from an import. Tuition only, at most two active per student
  per year, lowest candidate tuition wins. See `docs/modules/conventional-discounts.md`.
- **Transport is charged two ways** — a `transport_routes` row, or
  `student_fee_overrides.custom_transport_fee_amount` with no route at all. Always render
  through `buildTransportRouteLabel`; "No transport" printed beside a ₹14,000 charge was a
  real bug on three surfaces.

A discount only moves money when dues are **regenerated**. Writing an assignment directly
in SQL leaves it disagreeing with the projection — that is what
`scripts/repair-discount-drift.mjs` exists to find.

## Families

`student_family_groups` + `student_family_members`, **staff-confirmed only**, one family
per student per session. They exist to make the 3rd Child Policy traceable.

Phone-number-derived sibling guessing was removed in `20260811090000`. On live data it
produced 27 groups over 59 students, six pairing unrelated surnames, one child in two
"families" at once — and it was the slowest read in the app. **Do not reintroduce it.**

## EMI plans

A student carrying a previous-year balance can be put on interest-free monthly
instalments. The card lives on this page; the rules are in
`docs/product/school-rules.md` and the data model in `docs/maps/database-map.md`.
While a plan is active, concession controls here are hidden and refused server-side.

## Bulk update

`/protected/students/bulk-update` ships a column-picked Excel sheet pre-filled with current
values. Four rules:

- **A blank cell means "leave alone."** Only the literal word `CLEAR` empties a value, and
  `CLEAR` is refused for class and status.
- **A row with any invalid cell is skipped whole**, never applied in part.
- **The browser never sends a change list** — apply re-posts the file and the server
  recomputes the change set against current stored values.
- **Class ids are confined to the active session.** An unscoped lookup once repointed 372
  real students into `TEST-2026-27`.

Dues regenerate only for students whose class, route or status actually moved.

## Related

`docs/modules/import.md` · `docs/modules/conventional-discounts.md` ·
`docs/modules/payment-desk.md`
