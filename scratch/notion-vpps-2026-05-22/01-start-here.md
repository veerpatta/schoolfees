# 📌 Start Here

## One-line summary

This is the internal fee-management app for **Shri Veer Patta Senior Secondary School (VPPS / Veer Patta School)**.

It is built for office staff, accounts staff, and school admins. It is not a parent portal, public payment app, or multi-school SaaS product.

## Current status

🟢 **Live in production for AY 2026-27**

- Live session: `2026-27`
- Test/debug session: `TEST-2026-27`
- Receipt prefix: `SVP`
- Live data exists for real students, dues, receipts, and payments

## Product direction

The app is now an **automation-first office workflow**:

- Students and Fee Setup are the source of truth.
- Dues, dashboard totals, defaulters, payment previews, transactions, and exports derive from those sources.
- Normal office staff should not need manual ledger sync steps.
- Financial records stay append-only and auditable.

## Daily workspace

| Area | Purpose |
| --- | --- |
| 📊 Dashboard | Read-only analytics, shortcuts, and attention items |
| 👥 Students | Student master, student exceptions, families/siblings |
| 🧾 Fee Setup | Canonical policy/default editor |
| 💸 Payment Desk | Only place to post payments |
| 📚 Transactions | Read-only financial record center |
| 📞 Defaulters | Daily follow-up workspace |
| 📤 Exports | XLSX download center |
| 🛠️ Admin Tools | Rare setup, config, troubleshooting, and corrections |

## Default landing by role

| Role | Landing |
| --- | --- |
| admin | Dashboard |
| accountant | Payment Desk |
| read_only_staff | Dashboard |

## Non-negotiable rules

- Never test against `2026-27`.
- Never post test payments against real students.
- Use `TEST-2026-27` for debugging and UAT.
- Payment Desk is the only payment posting surface.
- Posted receipts, payments, adjustments, and audit logs are append-only.
- Do not expose service-role keys in browser code.
- Keep staff-facing text simple and office-friendly.

## Read next

1. 🧭 Product & School Rules
2. 💸 Finance Safety & Payment Rules
3. 🗂️ Module Guide
4. 🧱 Developer Map
5. 🤖 AI Agent Instructions

