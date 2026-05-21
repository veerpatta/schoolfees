import { SchoolBrand } from "@/components/branding/school-brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-sm">
        {/* School brand at top */}
        <div className="mb-6 text-center flex flex-col items-center">
          <SchoolBrand variant="icon" className="mx-auto [&>div]:size-14" priority />
          <h1 className="mt-3 text-xl font-display font-semibold text-foreground">
            {process.env[["NEXT", "PUBLIC", "SCHOOL", "NAME"].join("_")] || "Shri Veer Patta Senior Secondary School"}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Fee Management System
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">Staff portal — authorised access only</p>
        </div>

        {children}

        <p className="mt-6 text-center text-xs font-medium text-muted-foreground">
          For school office use only
        </p>
      </section>
    </main>
  );
}
