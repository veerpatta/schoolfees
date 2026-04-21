import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 md:py-14">
        <header className="mb-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Internal Admin Application
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">
            Shri Veer Patta Senior Secondary School Fee Management
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
            This portal is designed for office and accounts staff to manage
            admissions, fee plans, collections, dues, and audit-safe records.
            It is not a parent portal.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Late Fee Rule
            </p>
            <p className="mt-2 text-lg font-semibold">Flat Rs 1000</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Installment Due Dates
            </p>
            <p className="mt-2 text-lg font-semibold">
              20 Apr, 20 Jul, 20 Oct, 20 Jan
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/auth/login"
            className="rounded-xl bg-slate-900 p-5 text-white transition hover:bg-slate-800"
          >
            <p className="text-sm text-slate-200">Staff Access</p>
            <p className="mt-1 text-xl font-semibold">Sign in to continue</p>
          </Link>
          <Link
            href="/protected"
            className="rounded-xl border border-slate-300 bg-white p-5 transition hover:border-slate-400"
          >
            <p className="text-sm text-slate-600">Authenticated users</p>
            <p className="mt-1 text-xl font-semibold">Go to admin dashboard</p>
          </Link>
        </section>

        <div className="mt-auto pt-8 text-xs text-slate-500">
          Production focus: simple workflows, clear fee rules, and strong audit
          traceability.
        </div>
      </div>
    </main>
  );
}
