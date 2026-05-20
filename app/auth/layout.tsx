import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm">
            <Image
              src="/branding/veer-patta-school-logo.jpg"
              alt={`${schoolProfile.name} logo`}
              width={96}
              height={96}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground">
            Shri Veer Patta Senior Secondary School
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Fee Management System
          </p>
        </div>

        {children}

        <p className="mt-4 text-center text-xs font-medium text-muted-foreground">
          For school office use only
        </p>
      </section>
    </main>
  );
}
