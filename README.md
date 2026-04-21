# Shri Veer Patta Senior Secondary School - Fee Admin App

Internal fee management web application for a single school.

## Purpose

This app is built to replace spreadsheet-heavy fee operations gradually.

- Internal admin app only (not a parent portal)
- Simple staff workflows first
- Auditability and clean records by default

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase Auth + Database
- Vercel-ready deployment

## Active Fee Rule Defaults

- Late fee: flat Rs 1000
- Installment due dates: 20 April, 20 July, 20 October, 20 January
- Class 12 Science annual fee (default setting): Rs 38000

## Quick Start (Non-coder Friendly)

1. Install Node.js 20+ from the official Node website.
2. Open this project folder in VS Code.
3. Create a file named `.env.local` in the project root.
4. Copy values from `.env.local.example` and fill your real Supabase values.
5. In terminal, run:

```bash
npm install
npm run dev
```

6. Open http://localhost:3000
7. Use `/auth/login` for staff authentication.

## Environment Variables

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

Recommended (server-only):

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Metadata:

```env
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

## Project Structure (High Level)

```text
app/
  auth/                      # Supabase auth routes and forms
  protected/                 # Internal staff dashboard and workflows
    students/
    fee-structure/
    collections/
    reports/
    settings/
components/
  admin/                     # Reusable internal dashboard components
  ui/                        # Shared shadcn/ui primitives
lib/
  auth/                      # Role and permission definitions
  config/                    # Fee-rule defaults and school profile
  db/                        # DB-facing TypeScript types
  helpers/                   # Utility helpers (currency, etc.)
  supabase/                  # Client/server/proxy setup
```

## Supabase Setup (Manual)

1. Create a Supabase project.
2. Open SQL Editor and run the SQL file from `supabase/schema.sql`.
3. In Authentication settings, disable open signups if only admins should be invited.
4. Create staff users manually via Supabase Auth dashboard (or invite flow).

## Deploy to Vercel

1. Push this project to GitHub.
2. Import repo into Vercel.
3. Add all environment variables in Vercel Project Settings -> Environment Variables.
4. Deploy.
5. Validate login and protected routes on the deployed URL.

## Daily Workflow Guideline

1. Manage student records
2. Confirm fee structure by class
3. Record collections
4. Review outstanding + daily reports

## Internal Security Notes

- Never expose service-role key to client-side code.
- Restrict staff access by role.
- Keep audit fields (`created_at`, `updated_at`, `created_by`) in all key tables.
