# Storing Aadhaar / document images and staying on free tiers — brainstorm

**Date:** 17 Aug 2026 · **Project:** veerpatta-fees-app · **Status:** brainstorm, nothing decided

---

## 1. What I measured before theorising

All figures pulled live from `vgqyilgstjvgohrsiwkb` today, not estimated.

| Thing | Now | Free cap | Used |
|---|---|---|---|
| Postgres database | **110 MB** | 500 MB | 22% |
| Supabase Storage | **106 MB** | 1 GB | 10% |
| Student photos uploaded | **0** | — | — |
| Supabase projects on the account | **2** (schoolfees, Trading Bot Aegis) | 2 | **100%** |

### The surprise: photos are not your problem

All 106 MB of Storage is the `nightly-backups` bucket — **492 objects, nothing ever deleted**:

| Month | Objects | Bytes |
|---|---|---|
| 2026-05 (from 25th) | 42 | 9.4 MB |
| 2026-06 | 180 | 36 MB |
| 2026-07 | 174 | 35 MB |
| 2026-08 (to 16th) | 96 | 26 MB |

That is ~40–50 MB/month and accelerating, because backup size tracks database size. **Straight-line, the 1 GB Storage cap is hit around mid-2028 with zero photos in it.** The backup bucket, not Aadhaar cards, is what is currently walking you toward a paid plan.

### And in the database, fee data is not the problem either

| Table | Size | Rows |
|---|---|---|
| **audit_logs** | **55 MB** | 34k |
| import_rows | 5.6 MB | 2.7k |
| installments | 2.3 MB | 2.5k |
| students | 864 kB | 614 |
| receipts | 568 kB | 363 |
| payments | 496 kB | 606 |

`audit_logs` is **50% of the entire database** at ~1.6 KB/row — row-level change capture with before/after payloads (23 MB of `update`, 15 MB of `insert`, 7 MB of `delete`). It grows in bursts from bulk operations, not daily use: 20 MB in May, 0.4 MB in June, 0.2 MB in July, **21 MB in August**. Meanwhile a full year of actual money records is roughly 5 MB.

Note the implication: a bulk import or promotion run writes tens of thousands of audit rows in one afternoon, so database growth is driven by *how often you run bulk operations*, not by how many students you have.

**Conclusion:** the real fee ledger would fit in the free tier for several decades. Two housekeeping omissions — no backup retention, no audit-log retention — are what create the "I'll have to buy a paid tier" feeling. Fix those and you buy years for free before Drive is even needed.

### What the document images would actually add

Aadhaar front + back at ~150 KB each after client-side resize:

- 614 students × 300 KB ≈ **184 MB** one-time backfill (18% of the free 1 GB)
- ~150 new admissions/year × 300 KB ≈ **45 MB/year**
- Student avatar as a small WebP thumbnail, ~8 KB × 614 ≈ **5 MB** total

So images alone would not break the free tier for ~15 years. **Images plus un-pruned backups breaks it in about 18 months.** Both need addressing; the order matters and it is the opposite of what it looks like.

---

## 2. Three constraints worth knowing before designing anything

### 2.1 A service account cannot own Drive files. This is the trap everyone hits.

Google's own docs: *"Service accounts don't have storage quota and can't own any files. Instead, they must upload files and folders into shared drives, or use OAuth 2.0 to upload items on behalf of a human user."*

Uploading to the service account's own My Drive fails with `storageQuotaExceeded`. So the design must be: **create a Shared Drive owned by the school's Workspace, add the service account as its only member.** Files then belong to the Shared Drive and consume the school's pooled storage. Shared Drive ceiling is 500,000 items — irrelevant at your scale.

### 2.2 "Unlimited" Google storage ended in July 2022

Education Fundamentals is still free, but storage is now **100 TB pooled across the whole institution**, not unlimited. For this use that is effectively infinite — you would need ~300,000 student records to notice. But the mental model should be "a very large shared pool the whole school draws on," not "infinite," because Photos/Gmail/Classroom/Drive all pull from the same 100 TB.

Also flagged: Google states that exceeding Drive API quota *"is planned to incur charges to your Google Cloud billing account later in 2026."* Only on exceeding quota, which a school will not — but it means Drive is no longer a guaranteed-forever-free API surface.

### 2.3 Drive images cannot be put in an `<img>` tag

Google's own note on `thumbnailLink`: *"Typically lasts on the order of hours. **Not intended for direct usage on web applications due to Cross-Origin Resource Sharing (CORS) policies. Consider using a proxy server.**"*

So every image view must be fetched server-side (`files.get?alt=media`) and re-streamed from your own origin. That is fine for a document viewed at admission and then almost never again. It is bad for anything rendered in a list of 600 rows. **This single fact is what forces a hot/cold split rather than moving everything to Drive.**

---

## 3. The ideas

### Idea A — Hot/cold split: thumbnails in Supabase, originals in Drive ⭐

The core move.

- **Hot (Supabase Storage):** student avatar only, 96×96 WebP, ~8 KB. Renders instantly in lists, receipts, ID cards via existing RLS. 614 students = 5 MB. Never touches Drive.
- **Cold (Google Shared Drive):** full-resolution Aadhaar front/back, TC, birth certificate, previous marksheets. Read at admission and then approximately never.
- **Index (Postgres):** a `student_documents` table — `student_id`, `doc_type`, `drive_file_id`, `sha256`, `bytes`, `mime`, `uploaded_by`, `uploaded_at`, `consent_id`. The database is the source of truth about *what exists*; Drive is a dumb byte store.

Serving path: `GET /api/students/[id]/document/[docId]` → permission check via `has_permission()` → `files.get(alt=media)` → stream with `Cache-Control: private, max-age=3600`. Rare reads, so the proxy hop costs nothing meaningful.

Keeps Supabase Storage under ~30 MB forever, and every heavy byte lands in the 100 TB pool.

### Idea B — Encrypt before upload, so Drive never holds a readable Aadhaar ⭐

The thing I would not skip. AES-256-GCM in the upload route, key in an env var, random IV per file, store IV alongside `drive_file_id`. Drive holds `a7f3c1…bin` and nothing else.

Three problems solved at once:

1. **Workspace admins can browse Shared Drives.** Supabase gives you per-role RLS; Drive gives you folder membership. Moving children's ID documents to Drive is a *downgrade* in access control unless the bytes are opaque. Encryption restores it.
2. **DPDP Rule 6(1)(a)** names the sanctioned safeguards as *"encryption, obfuscation, masking or the use of virtual tokens."* This maps onto the rule text literally rather than by argument.
3. A leaked Drive link becomes worthless without the key, and the key never leaves the app.

Cost: zero. Trade-off: no thumbnail previews in Drive's own UI, and losing the key loses the documents — so the key needs to live in two places (env var + sealed offline copy).

### Idea C — Move nightly backups to Drive and add retention ⭐

The highest value-per-hour change on this list, and it is independent of the photo feature.

- Point `/api/cron/nightly-backup` at the Shared Drive instead of the `nightly-backups` bucket.
- Retention: keep 14 dailies + 12 monthlies + 1 per closed session. Prune the rest.
- Backups are the perfect Drive workload — write-once, never hotlinked, no CORS issue, latency irrelevant.

This alone frees the entire 1 GB bucket, ends the only growth curve you actually have today, and gets you genuine off-platform backups (right now your backups live inside the thing they are backing up).

**Bonus:** the repo already lives in `OneDrive - Veer Patta Public School`, so the school has Microsoft 365 Education too — a second free pooled store. Writing the same nightly archive to both Drive and SharePoint gives real 3-2-1 backup at zero cost.

### Idea D — Yearly cold-archive of closed sessions

Addresses "each year data keeps increasing" structurally rather than by buying headroom.

At session close: export the year's ledger to `.jsonl.gz` + a human-readable PDF register → Drive. Keep a thin `session_summary` row in Postgres (totals, headcount, collection %) so dashboards and history still work. Old-year detail becomes an on-demand restore.

Pair it with a retention policy on `audit_logs` — archive to Drive, then delete. One caveat, since I checked: **every audit row in the table is less than 5 months old, so a 12-month retention rule reclaims nothing today.** It is a forward-looking guard, not an immediate win. What reclaims space now is narrower: truncate `import_rows` once an import is accepted (5.6 MB), and decide whether bulk imports and promotion runs need per-row audit forever or whether one summary row per batch is enough — that is ~41 MB of the 55 MB.

Either way, with a rolling archive in place the database stays roughly flat year over year and the 500 MB cap stops being a horizon at all.

### Idea E — Store less: masked Aadhaar instead of the card ⭐

The strongest lever, and it is a product decision rather than an infrastructure one.

Instead of an image of the card, store: `aadhaar_last4` for display, `aadhaar_hmac` (HMAC-SHA256 with a server key) carrying the unique index for duplicate detection, plus `verified_by` / `verified_at` / `consent_id`. Optionally a masked crop showing only the last four digits.

- Storage impact: ~200 MB becomes ~0.
- Legal impact: large (see §4).
- Note this also fixes something already in the schema — `students.aadhaar_no` is currently **plaintext text with a unique index**. Swapping the unique index onto an HMAC keeps duplicate detection working without a readable number in the table.

Worth deciding honestly: does the office need the *image*, or does it need *"an adult verified this child's Aadhaar on this date, ending 1234"*? Board forms and RTE filings usually need the number, not the scan. If the scan is genuinely required for some filing, keep it under Ideas A+B for those students only, with a retention date.

### Idea F — Cloudflare R2 instead of Drive

Technically the better blob store: 10 GB free, **zero egress cost**, S3 API, real CORS-able URLs on a custom domain — so no proxy hop and images work directly in `<img>`. 614 students of documents fits in 10 GB with room to spare.

The catch: R2 requires completing a subscription checkout with a valid payment method even to sit inside the free tier. So it is "free but a card on file." If you are willing to do that, R2 removes most of Drive's awkwardness. If "no card anywhere" is the rule, Drive wins.

### Idea G — Where the Drive call should live

You already have `supabase/functions/notion-fee-sync`, so the Edge Function pattern exists. Two options:

- **Next.js route handler on Vercel** — simplest, shares the existing auth/permission helpers, one round trip.
- **Supabase Edge Function** — keeps Drive credentials next to the database, 500k free invocations, survives a host migration.

Either way, one detail matters: **there is no transaction spanning Postgres and Drive.** A delete that succeeds in Postgres and fails at Drive leaves an orphan; the reverse loses a document. Suggest an `outbox` table written in the same transaction and drained by the nightly cron, plus a weekly reconciliation that lists the Drive folder and diffs it against the index both ways.

---

## 4. The legal angle — because this is children's ID documents

I researched this properly rather than guessing. Not legal advice, but the shape is clear and one date matters a lot.

**What is prohibited today, binding on anyone:**

- Publishing/displaying/posting an Aadhaar number publicly — s.29(4) Aadhaar Act, and Reg. 6 of the Sharing of Information Regulations 2016, which also says databases holding Aadhaar numbers **must be redacted** absent consent.
- **Making Aadhaar a condition of admission.** s.57 was struck down in *Puttaswamy* (2018) and deleted from the Act in 2019; UIDAI's 6 Sep 2018 circular says schools cannot deny admission for want of Aadhaar. The Supreme Court reinforced the consent point for APAAR in *Abhishek Baxi v. Union of India* (July 2026), requiring a genuine opt-out and holding student data processing *"fully governed by the DPDP Act, 2023."*

**What is not prohibited:** there is no subsisting UIDAI rule barring a school from holding a scanned copy. The widely-cited May 2022 "don't share photocopies" advisory was **withdrawn two days later**. Anyone quoting it is quoting a dead document. However, UIDAI's CEO announced in Dec 2025 that a rule requiring private verifiers to register and stop collecting photocopies had been approved — I could not confirm it has been notified. Direction of travel is clearly against storing scans.

**The date that matters: ~14 May 2027.** The DPDP Rules were notified 14 Nov 2025 with a phased commencement. The sections that would bite — s.8(5) security safeguards, s.8(6) breach notification, **s.9 verifiable parental consent for children**, s.16 cross-border — commence roughly 18 months later, **around 14 May 2027**. (MeitY floated compressing this to Nov 2026; as of mid-2026 sources say the timeline stands. Worth re-checking.)

So there are ~9 months to design this correctly rather than retrofit it. Three specifics:

- **Every student is a "child"** under DPDP (under 18), so s.9 verifiable parental consent applies to essentially the whole roll. The Fourth Schedule education exemption is narrow — it disapplies s.9(1)/9(3) for *tracking and behavioural monitoring* only. Holding an admission file or an Aadhaar scan is not that, so **consent stays required**.
- **s.9(2) is never exempt:** no processing likely to have a detrimental effect on a child's well-being. A leaked Aadhaar image of a minor is the textbook case.
- **Penalty ceiling for a security-safeguards failure is ₹250 crore.** Not a realistic exposure for a single school, but it explains why "encrypt, mask, minimise, set a retention period" is the right instinct now rather than later.

**What this implies for the design, concretely:** a `consent` table recording who consented, when, for what purpose, and how it can be withdrawn; a stated retention period per document type (DPDP s.8(7) requires erasure when the purpose is served, and prescribes no period for schools — so you must set and defend your own); encryption at rest (Idea B); masking (Idea E); and a Data Processing Agreement with whichever storage provider you land on. Cross-border to Google/Cloudflare is currently fine — DPDP s.16 permits transfer except to blacklisted countries, and a school is not a Significant Data Fiduciary.

---

## 5. The bigger risk nobody asked about: Vercel Hobby forbids commercial use

This deserves flagging because it threatens "free forever" harder than storage does.

Vercel's Terms: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* The Fair Use Guidelines define commercial as *"any Deployment that is used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project, including a paid employee or consultant writing the code"* — and list *"any method of requesting or processing payment"* and *"receiving payment to create, update, or host the site"* as examples. A fee-collection and dues-recovery system for a fee-charging school sits inside that definition on more than one limb.

Stated remedy: Vercel *"may shut down and terminate projects or deployments using the Hobby plan without notice for any reason or no reason."* In practice the deployment is paused and resuming requires Pro at $20/seat/month.

Options, honestly ranked:

1. **Accept the risk.** Enforcement is discretionary and largely complaint-driven. Cheapest, non-zero chance of an abrupt outage on a live fee system mid-session.
2. **Cloudflare Workers — free tier, no commercial-use restriction.** I verified this: the old §2.8 was deleted in 2023, the surviving content restriction applies only to the CDN, and the Developer Platform terms contain no commercial-use clause. But Workers **Free** gives 10 ms CPU per request, and Cloudflare's own docs say SSR typically uses "10–20 ms" — plus a 3 MB gzipped Worker ceiling this codebase would likely blow. So free Cloudflare probably will not hold this app.
3. **Cloudflare Workers Paid — $5/month.** The cheapest fully legitimate path. Cheaper than Vercel Pro ($20) and Supabase Pro ($25). `@opennextjs/cloudflare` supports Next.js 16 App Router, ISR, middleware, and image optimization; only Node.js middleware is unsupported. Migration is real work but not exotic.
4. **Self-host on an always-on school PC behind a free Cloudflare Tunnel.** Zero cost, no commercial-use restriction, no CPU limit. Trades cloud reliability for a machine in the office — plausible for a single-school internal tool, and it keeps children's ID documents on premises, which is the strongest possible answer to the DPDP question.

Two smaller notes: Supabase pauses free projects after 7 days of low activity — your nightly cron keeps it warm, so don't remove that. And you are at **2 of 2 free Supabase projects**, so "spin up a second free project as an archive" is not available.

---

## 6. If I had to sequence it

**Now, independent of any decision (a weekend, no new dependencies):**

1. Backup retention — 14 daily + 12 monthly. Reclaims ~85 MB immediately and stops the only growth curve you actually have.
2. Truncate `import_rows` on import acceptance (~5.6 MB), and put a rolling archive rule on `audit_logs` now so the 2027 bursts don't compound. Optionally collapse bulk-operation audit to one row per batch — that is ~41 MB.

**Then the document feature:** Idea E first (decide whether the image is actually needed), then A + B for whatever survives that question, with consent and retention modelled in from the start rather than added in 2027.

**Then, deliberately:** Idea C moves backups to Drive, which is also the honest test of the whole Drive integration — if service-account-to-Shared-Drive works reliably for backups for a month, it will work for documents.

**Separately, on its own clock:** decide the hosting question. It is not urgent, but it is the one that can take the app down without warning.

---

## Sources

Supabase [pricing](https://supabase.com/pricing) · [billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase) · [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) · Vercel [ToS](https://vercel.com/legal/terms) · [fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) · Google [Education storage](https://support.google.com/a/answer/10403871) · [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits) · [shared drives / service accounts](https://developers.google.com/workspace/drive/api/guides/about-shareddrives) · [files reference (thumbnailLink)](https://developers.google.com/workspace/drive/api/reference/rest/v3/files) · [shared drive limits](https://support.google.com/a/answer/7338880) · Cloudflare [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [Aadhaar Act as amended](https://uidai.gov.in/images/Aadhaar_Act_2016_as_amended.pdf) · [Sharing of Information Regulations 2016](https://uidai.gov.in/images/6_The_Aadhaar_Sharing_of_Information_Regulations_2016.pdf) · [PIB: May 2022 advisory withdrawn](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1829162&reg=48&lang=2) · [UIDAI: no denial of school admission](https://uidai.gov.in/en/about-uidai/legal-framework/circulars/2049-no-denial-of-admission-in-schools-for-want-of-aadhaar-and-organising-special-aadhaar-enrollment-update-camps-at-schools.html) · [PIB: DPDP Rules 2025 notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) · [Abhishek Baxi v. UoI (2026)](https://www.livelaw.in/sc-judgments/2026-livelaw-sc-719-abhishek-baxi-vs-union-of-india-542875)
