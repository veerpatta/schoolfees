const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export function getRequiredEnvVar(
  name: (typeof requiredEnvVars)[number],
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnvVar(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getSiteUrl() {
  const configuredUrl = getOptionalEnvVar("NEXT_PUBLIC_SITE_URL");

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const vercelUrl = getOptionalEnvVar("VERCEL_URL");

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

export const hasRequiredEnvVars = requiredEnvVars.every((name) =>
  Boolean(process.env[name]?.trim()),
);
