# Shri Veer Patta Senior Secondary School Fee Admin

Internal fee management web app for one school.

This project is for school office and accounts staff only.
It is not a parent portal.

## What This App Covers

- Student master records
- Workbook CSV import batches
- Fee structure and installment defaults
- Collection desk workflow
- Reports and audit-friendly outputs
- Supabase auth + database setup
- Vercel-ready deployment

## Active Fee Rule Defaults

- Late fee: flat Rs 1000
- Installment due dates: 20 April, 20 July, 20 October, 20 January
- Class 12 Science annual fee default: Rs 38000

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Supabase
- Vercel

## Project Structure

```text
app/
  auth/                      Auth pages for internal staff
  protected/                 Main internal admin workspace
    students/
    imports/
    fee-structure/
    collections/
    reports/
    settings/
components/
  admin/                     Shared internal dashboard components
  ui/                        Reusable shadcn/ui primitives
lib/
  auth/                      Role definitions
  config/                    School config, fee rules, navigation
  db/                        Shared domain types
  helpers/                   Formatting helpers
  supabase/                  Browser, server, admin, and proxy clients
supabase/
  schema.sql                 Database schema to run in Supabase
```

## Required Environment Variables

Create `.env.local` in the project root.

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxx
```

Recommended:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional display values:

```env
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

## Local Setup

1. Install Node.js 20 or newer.
2. Open this folder in VS Code.
3. Create `.env.local`.
4. Copy values from `.env.local.example`.
5. Fill the real Supabase values.
6. Run:

```bash
npm install
npm run dev
```

7. Open `http://localhost:3000`.

## Manual Browser Steps

You must do these in the browser:

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.sql`.
4. Open Supabase Authentication settings.
5. Set the site URL.
   Local: `http://localhost:3000`
   Production: your final Vercel domain
6. Add redirect URLs for:
   - `http://localhost:3000/auth/login`
   - `http://localhost:3000/auth/update-password`
   - your production `/auth/login`
   - your production `/auth/update-password`
7. Create or invite the first internal staff account.
8. After the first admin account works, disable open signups if you want invite-only access.

## First Usage Order

1. Sign in with the internal staff account.
2. Review fee defaults on the dashboard and settings pages.
3. Prepare student master CSV files from the workbook.
4. Import one class or one verified batch at a time.
5. Configure class-wise fee structures.
6. Start collections and reconcile totals daily while migration is in progress.

## Deploy To Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Deploy.
5. Open the deployed app and test:
   - `/auth/login`
   - `/protected`
   - password reset flow

## Security Notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Use invited staff accounts for production.
- Do not expose this app to parents or the public.
- Prefer audit-safe updates over destructive deletes.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```
