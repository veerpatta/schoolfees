const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

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

export function getRequiredEnvVar(
  name: (typeof requiredEnvVars)[number],
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Copy .env.local.example and paste the real Supabase value.`,
    );
  }

  return value;
}

export function getOptionalEnvVar(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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

export const hasRequiredEnvVars = requiredEnvVars.every((name) =>
  Boolean(process.env[name]?.trim()),
);
