import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_TOKEN_COOKIE,
  DOWNLOAD_TOKEN_PARAM,
  readDownloadToken,
  stripDownloadToken,
  withDownloadToken,
} from "@/lib/helpers/download-token";

const url = (query: string) => `https://vpps.test/protected/exports/dues${query}`;

describe("download token", () => {
  it("reads a well-formed nonce", () => {
    expect(readDownloadToken(url(`?${DOWNLOAD_TOKEN_PARAM}=abc123def456`))).toBe("abc123def456");
  });

  it("returns null when there is no nonce", () => {
    expect(readDownloadToken(url(""))).toBeNull();
    expect(readDownloadToken(url("?session=2026-27"))).toBeNull();
  });

  // The value is reflected into a Set-Cookie header, so it must never carry
  // anything that could break out of it.
  it("refuses anything that is not an opaque id", () => {
    for (const bad of ["short", "has spaces", "semi;colon", "a".repeat(65), "<script>"]) {
      expect(readDownloadToken(url(`?${DOWNLOAD_TOKEN_PARAM}=${encodeURIComponent(bad)}`))).toBeNull();
    }
  });

  it("echoes the nonce back as a short-lived, readable cookie", () => {
    const response = withDownloadToken(
      new Request(url(`?${DOWNLOAD_TOKEN_PARAM}=abc123def456`)),
      new Response("x"),
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${DOWNLOAD_TOKEN_COOKIE}=abc123def456`);
    expect(cookie).toContain("Max-Age=30");
    // Lax, not Strict: a download is a top-level navigation and Strict drops
    // the cookie on the target="_blank" print route.
    expect(cookie).toContain("SameSite=Lax");
    // Readable by JS on purpose — the client polls for it.
    expect(cookie).not.toContain("HttpOnly");
  });

  it("leaves a response alone when no nonce was sent", () => {
    const response = withDownloadToken(new Request(url("")), new Response("x"));

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the nonce out of anything that gets logged", () => {
    const stripped = stripDownloadToken(url(`?session=2026-27&${DOWNLOAD_TOKEN_PARAM}=abc123def456`));

    expect(stripped).toContain("session=2026-27");
    expect(stripped).not.toContain(DOWNLOAD_TOKEN_PARAM);
  });
});

describe("every download route echoes the token", () => {
  const routes = [
    "app/protected/exports/[exportType]/route.ts",
    "app/protected/finance-controls/export/route.ts",
    "app/protected/imports/template/route.ts",
    "app/protected/payments/bulk/template/route.ts",
    "app/protected/reports/export/route.ts",
    "app/protected/students/bulk-update/template/route.ts",
    "app/protected/transactions/export/route.ts",
  ];

  it.each(routes)("%s calls withDownloadToken", (route) => {
    const source = readFileSync(join(process.cwd(), route), "utf8");
    expect(source).toContain("withDownloadToken");
  });
});
