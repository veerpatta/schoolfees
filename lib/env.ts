const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

const placeholderPatterns = [
  "YOUR_PROJECT_ID",
  "REPLACE_WITH_REAL",
  "PASTE_",
  "CHANGE_ME",
] as const;

const truthyEnvValues = new Set(["1", "true", "yes", "on"]);
const appModes = ["production", "test"] as const;

export type AppMode = (typeof appModes)[number];

function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function withHttpsIfNeeded(value: string) {
  const normalizedValue = normalizeUrl(value);

  if (
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://")
  ) {
    return normalizedValue;
  }

  return `https://${normalizedValue}`;
}

function isPlaceholderValue(value: string) {
  const normalizedValue = value.trim();

  return placeholderPatterns.some((pattern) =>
    normalizedValue.toUpperCase().includes(pattern),
  );
}

export function getRequiredEnvVar(
  name: (typeof requiredEnvVars)[number],
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Set a real value in .env.local or Vercel Project Settings.`,
    );
  }

  if (isPlaceholderValue(value)) {
    throw new Error(
      `Unsafe placeholder detected for ${name}. Replace it with the real project value before deployment.`,
    );
  }

  return value;
}

export function getOptionalEnvVar(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getAppMode(): AppMode {
  const value = getOptionalEnvVar("APP_MODE") ?? "production";

  if ((appModes as readonly string[]).includes(value)) {
    return value as AppMode;
  }

  throw new Error(
    `Invalid APP_MODE: ${value}. Expected "production" or "test".`,
  );
}

export function getSupabaseSchemaForAppMode() {
  return getAppMode() === "test" ? "test" : "public";
}

export function hasExplicitSiteUrl() {
  return Boolean(getOptionalEnvVar("NEXT_PUBLIC_SITE_URL"));
}

export function isConfiguredSiteUrlSecure() {
  const configuredUrl = getOptionalEnvVar("NEXT_PUBLIC_SITE_URL");

  if (!configuredUrl) {
    return false;
  }

  return withHttpsIfNeeded(configuredUrl).startsWith("https://");
}

export function isBootstrapSignupEnabled() {
  const value = getOptionalEnvVar("NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP");

  if (!value) {
    return false;
  }

  return truthyEnvValues.has(value.toLowerCase());
}

// Gates exposure of the new `teacher` and `defaulter_followup` roles in the
// Staff Management dropdown. Keep off in production until office staff have
// been briefed on the new personas, then flip on.
export function isStaffRolesV2Enabled() {
  const value = getOptionalEnvVar("STAFF_ROLES_V2");

  if (!value) {
    return false;
  }

  return truthyEnvValues.has(value.toLowerCase());
}

// Gates the in-app language switcher (English / Hindi / Hinglish). The flag
// is now opt-out: when LOCALE_SWITCHER_ENABLED is unset or truthy, the
// switcher is on; only an explicit falsy value (`0`, `false`, `off`, `no`)
// disables it. Per-env overrides remain available (Vercel env / .env.local).
export function isLocaleSwitcherEnabled() {
  const value = getOptionalEnvVar("LOCALE_SWITCHER_ENABLED");

  if (!value) {
    return true;
  }

  return truthyEnvValues.has(value.toLowerCase());
}

// Gates the simplified V2 receipt layout (school header → student strip →
// installment table → totals footer → signature → collapsed Fee detail
// section). Default OFF in production, ON in TEST-2026-27. Office staff
// expect the V1 layout until reconciliation is verified against V2 prints.
//
// Uses NEXT_PUBLIC_ so the client-side receipt preview sheet (in the
// Transactions and Receipts modules) and the server-side detail page both
// read the same value at request time.
export function isReceiptLayoutV2Enabled() {
  const value = getOptionalEnvVar("NEXT_PUBLIC_RECEIPT_LAYOUT_V2");

  if (!value) {
    return false;
  }

  return truthyEnvValues.has(value.toLowerCase());
}

// Gates the redesigned admin shell (tighter sidebar, header session pill,
// global Cmd/Ctrl+K command palette, top-bar overflow). Default OFF in
// production, ON in TEST-2026-27. Old shell remains the fallback.
export function isShellV2Enabled() {
  const value = getOptionalEnvVar("SHELL_V2");

  if (!value) {
    return false;
  }

  return truthyEnvValues.has(value.toLowerCase());
}

export function isVercelProductionEnvironment() {
  return getOptionalEnvVar("VERCEL_ENV") === "production";
}

export function getRuntimeEnvironmentLabel() {
  const vercelEnvironment = getOptionalEnvVar("VERCEL_ENV");

  if (vercelEnvironment) {
    return vercelEnvironment;
  }

  if (process.env.NODE_ENV === "development") {
    return "local/development";
  }

  return process.env.NODE_ENV ?? "local";
}

export function getPublicSiteUrl() {
  const configuredUrl = getOptionalEnvVar("NEXT_PUBLIC_SITE_URL");

  if (configuredUrl) {
    return withHttpsIfNeeded(configuredUrl);
  }

  if (typeof window !== "undefined") {
    return normalizeUrl(window.location.origin);
  }

  return "http://localhost:3000";
}

export function getSiteUrl() {
  const configuredUrl = getOptionalEnvVar("NEXT_PUBLIC_SITE_URL");

  if (configuredUrl) {
    return withHttpsIfNeeded(configuredUrl);
  }

  const vercelProductionUrl = getOptionalEnvVar(
    "VERCEL_PROJECT_PRODUCTION_URL",
  );

  if (vercelProductionUrl) {
    return withHttpsIfNeeded(vercelProductionUrl);
  }

  const vercelUrl = getOptionalEnvVar("VERCEL_URL");

  if (vercelUrl) {
    return withHttpsIfNeeded(vercelUrl);
  }

  return getPublicSiteUrl();
}

export function createAbsoluteUrl(path: string, baseUrl = getPublicSiteUrl()) {
  return new URL(path, `${baseUrl}/`).toString();
}

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback = "/protected",
) {
  const normalizedValue = (value ?? "").trim();

  if (!normalizedValue.startsWith("/") || normalizedValue.startsWith("//")) {
    return fallback;
  }

  return normalizedValue;
}

export const hasRequiredEnvVars = requiredEnvVars.every((name) =>
  Boolean(process.env[name]?.trim()),
);
