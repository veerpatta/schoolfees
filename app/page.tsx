"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, School } from "lucide-react";
import { useSearchParams } from "next/navigation";

import {
  loginAction,
  type LoginActionState,
} from "@/app/auth/login/actions";

const initialState: LoginActionState = {
  status: "idle",
  message: null,
};

export default function Home() {
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );
  const next = searchParams.get("next") ?? "/protected";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-4 py-8 text-slate-950">
      <section className="w-full max-w-sm">
        <div className="rounded-xl border border-[#d8dedb] bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] sm:p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-[#e7f2f0] text-[#01696f]">
              <School className="size-7" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-semibold leading-snug text-slate-950">
              Veer Patta Public School
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              School Fee Management
            </p>
          </div>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="next" value={next} />

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-800"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@school.in"
                aria-invalid={state.status === "error" ? true : undefined}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#01696f] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-800"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  aria-invalid={state.status === "error" ? true : undefined}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 pr-12 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#01696f] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50"
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isPending}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {state.message ? (
              <p
                aria-live="polite"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
              >
                <AlertCircle
                  className="mt-1 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{state.message}</span>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#01696f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#015b61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-65"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs font-medium text-slate-500">
            Amet, Rajasthan - Internal Use Only
          </p>
        </div>
      </section>
    </main>
  );
}
