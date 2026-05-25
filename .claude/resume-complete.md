# Overhaul COMPLETE — all 10 phases shipped

Every phase from the original plan is live on `origin/main`. Item 38
(scheduled exports via email) was the only dropped item, per your
prior decision.

# Shipped commits (verify with `git log --oneline`)

- **Phase 1** — `4053991` — items 22, 27, 31, 40, 51.
- **Phase 2** — `de52399` — items 10, 12, 13.
- **Phase 3** — `abd2445` — items 20, 23, 49.
- **Phase 4** — `dbf2baa` — items 24, 25, 26, 28, 29, 30, 32, 37, 41, 44.
- **Phase 5** — `c303129` — items 46, 8, 21, 14.
- **Phase 6** — `d2ece1e` + `08c6432` — items 42, 54, 35, 39, 34, 36.
- **Phase 7** — `5e16dc0` — items 50, 52, 53.
- **Phase 8** — `9901e77` — items 18, 19.
- **Phase 9** — `45f2b7e` — item 6 (gated by `FAMILY_PAYMENTS_ENABLED`).
- **Phase 10** — `25bef1e` — items 43, 45, 47, 48.

Item 38 — dropped (scheduled exports via email).

# Operator follow-ups before turning anything on in prod

These shipped behind feature flags or as opt-in tooling — you decide
when to turn them on.

1. **Family payments (Phase 9 — item 6)** — set
   `FAMILY_PAYMENTS_ENABLED=true` in Vercel envs. Smoke-test on
   `TEST-2026-27` first using the sibling-linker workflow:
   - Open `/protected/students/family/<groupId>/pay`
   - Confirm allocation totals match, post, verify per-child receipts
   - Compare cashier UX against the historical disable rationale
     (cashier confusion). Roll back via env flag if anything regresses.

2. **Nightly backup cron (Phase 10 — item 48)** — set `CRON_SECRET`
   in Vercel envs. Manually trigger once via
   `curl https://<your-domain>/api/cron/nightly-backup -H "Authorization: Bearer <secret>"`
   to confirm CSVs land in the `nightly-backups` bucket. The Vercel
   cron entry in `vercel.json` runs at 18:00 UTC daily.

3. **Class promotion (Phase 8 — items 18 + 19)** — start at
   `/protected/admin-tools/promotion`. Always build a preview first;
   the apply step requires typing "APPLY" and rollback requires typing
   "ROLLBACK". Do a single-student preview against `TEST-2026-27`
   first to verify class-name matching for sections / streams.

4. **Parent share links (Phase 10 — item 45)** — `NEXT_PUBLIC_SITE_URL`
   must be set so the generated URLs use the production domain (not
   `localhost`). Generate a test link and confirm `/share/<token>`
   renders read-only.

# Notable risk surfaces (still on the radar)

- **`bulkUpdateStudentFields`** (Phase 7 — item 50) bypasses the full
  StudentValidatedInput path. It only touches `class_id`,
  `transport_route_id`, and `status`, but if you add new safety
  checks to `updateStudent`, mirror them in
  `bulkUpdateStudentFields` too.

- **Credit carry-forward at promotion** (Phase 8 — item 19) is
  modeled as a `discount_amount` delta on the student fee override.
  This is the lossy-but-pragmatic interpretation: it reduces the new
  session's billable amount by the credit. If accounting needs an
  actual "payment ledger" entry instead, replace with a
  `payment_adjustments` row in `applyPromotionRun`.

- **Promotion rollback** restores `class_id`/`status` and removes
  exactly the carry-forward line from override notes + decrements
  the discount delta. It does NOT undo any *new* payments / receipts
  posted under the promoted class. If staff post into the new
  session before rolling back, those payments stay attached to the
  old class after rollback.

- **Family payment RPC** (`post_family_payment`) is restored and
  granted to authenticated, but only callable when the app flag is
  on. If you want belt-and-suspenders, revoke the grant when the
  flag is off — currently the gate is app-layer only.

# Migrations shipped in this overhaul (timestamps on remote)

- `20260525122636_whatsapp_templates`
- `20260525123312_add_student_email_column`
- `20260525123643_defaulter_voice_notes`
- `20260525124501_user_activity_events`
- `20260525131743_import_duplicate_audit_decision`
- `20260525133208_student_photos`
- `20260525135507_promotion_runs`
- `20260525140415_restore_family_payments`
- `20260525141454_student_share_links`
- `20260525142048_nightly_backup_bucket`

All applied via Supabase MCP and mirrored to local
`supabase/migrations/` with matching timestamps.

# New env vars to set in Vercel

| Variable | Purpose | Phase |
|----------|---------|-------|
| `FAMILY_PAYMENTS_ENABLED` | `"true"` to turn on Pay Together UI + RPC | 9 |
| `CRON_SECRET` | Bearer token Vercel cron sends to the backup endpoint | 10 |
| `NEXT_PUBLIC_SITE_URL` | Required for parent share links to point at prod domain | 10 |

# Shared components introduced across the overhaul

`StudentFinanceGlance`, `ContactStatusChip`, `ReceiptPreviewSheet`,
`StudentReceiptsPanel`, `FamilyReceiptsBatchActions`,
`StudentStickyHeader`, `NextActionStrip`, `OptimisticBanner`,
`AnomalyToaster`, `RouteCollectionHeatmap`, `BulkWhatsappProvider`,
`BulkRowCheckbox`, `ReceiptShareActions`, `VoiceNoteRecorder`,
`VoiceNotePlayer`, `ContactLogTimelineButton`, `ActivityStrip`,
`DuplicateAuditPanel`, `BulkStudentEditBar`, `StudentAvatar`,
`StudentPhotoUpload`, `FamilyPayTogetherForm`,
`ParentShareLinkCard`, `PwaInstallPrompt`, `CollectDraftBanner`.

# Pre-existing test failures still expected on main

These four files fail identically on bare main and any branch —
they're load-time/router-mounting issues unrelated to phase work:

- `tests/ui/family-flow-links.test.tsx` — `Cannot find package
  'server-only'`
- `tests/ui/students-sibling-pill.test.tsx` — `useRouter` not mounted
- `tests/integration/navigation.test.ts` — mobile nav fixture
  mismatch
- `tests/integration/payment-desk-workflow.test.ts` — confirm-receipt
  sheet allocation table fixture mismatch

# What to do next

The overhaul backlog is empty. Use main as usual — UAT each phase as
you turn its env flag on, document any field issues, and file
follow-up tasks for anything we should refine (e.g., credit
carry-forward as payment_adjustments instead of discount delta,
deeper service-worker draft sync, ZIP packaging for nightly backup).
