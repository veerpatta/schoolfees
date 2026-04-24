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
