import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/protected", label: "Overview" },
  { href: "/protected/students", label: "Students" },
  { href: "/protected/fee-structure", label: "Fee Structure" },
  { href: "/protected/collections", label: "Collections" },
  { href: "/protected/reports", label: "Reports" },
  { href: "/protected/settings", label: "Settings" },
];

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[240px_1fr] md:px-6 md:py-6">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Shri Veer Patta SSS
          </p>
          <h1 className="mt-2 text-lg font-bold">Fee Admin</h1>
          <nav className="mt-5 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
