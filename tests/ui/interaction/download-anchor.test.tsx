import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadAnchor } from "@/components/ui/download-anchor";
import { ToastViewport } from "@/components/ui/toast";
import { DOWNLOAD_TOKEN_COOKIE, DOWNLOAD_TOKEN_PARAM } from "@/lib/helpers/download-token";

function anchor() {
  return screen.getByRole("link", { name: /export/i }) as HTMLAnchorElement;
}

function tokenOf(link: HTMLAnchorElement) {
  return new URL(link.getAttribute("href")!, "http://localhost").searchParams.get(
    DOWNLOAD_TOKEN_PARAM,
  )!;
}

describe("DownloadAnchor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.cookie = `${DOWNLOAD_TOKEN_COOKIE}=; Path=/; Max-Age=0`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The single most important assertion here. Intercepting the click is what
  // would break the native download shelf, target="_blank" printing, and the
  // no-JS path — the whole reason this is not a fetch+blob download.
  it("never intercepts the click", () => {
    render(<DownloadAnchor href="/protected/exports/dues">Export</DownloadAnchor>);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    const prevented = vi.spyOn(event, "preventDefault");

    act(() => {
      anchor().dispatchEvent(event);
    });

    expect(prevented).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps a real href, and the download and target attributes", () => {
    render(
      <DownloadAnchor href="/protected/exports/dues?format=pdf" target="_blank">
        Export
      </DownloadAnchor>,
    );

    const link = anchor();
    expect(link.getAttribute("href")).toContain("/protected/exports/dues?format=pdf");
    expect(link).toHaveAttribute("target", "_blank");
    // target="_blank" must carry rel="noopener" without being asked.
    expect(link).toHaveAttribute("rel", "noopener");
  });

  it("adds a nonce the server can echo back", () => {
    render(<DownloadAnchor href="/protected/exports/dues">Export</DownloadAnchor>);

    expect(tokenOf(anchor())).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("preserves an existing query string", () => {
    render(
      <DownloadAnchor href="/protected/exports/dues?session=2026-27">Export</DownloadAnchor>,
    );

    const href = anchor().getAttribute("href")!;
    expect(href).toContain("session=2026-27");
    expect(href).toContain(`&${DOWNLOAD_TOKEN_PARAM}=`);
  });

  it("shows it is working, then clears when the response arrives", () => {
    render(
      <>
        <DownloadAnchor href="/protected/exports/dues">Export</DownloadAnchor>
        <ToastViewport />
      </>,
    );

    const link = anchor();
    const token = tokenOf(link);

    act(() => {
      fireEvent.click(link);
    });

    expect(link).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Preparing download");

    // The server echoing the nonce back is what says "the file is on its way".
    act(() => {
      document.cookie = `${DOWNLOAD_TOKEN_COOKIE}=${token}; Path=/`;
      vi.advanceTimersByTime(300);
    });

    expect(link).not.toHaveAttribute("aria-busy");
    expect(screen.getByText("Download ready")).toBeInTheDocument();
  });

  it("ignores a stale cookie from someone else's download", () => {
    render(<DownloadAnchor href="/protected/exports/dues">Export</DownloadAnchor>);

    const link = anchor();
    act(() => {
      fireEvent.click(link);
    });

    act(() => {
      document.cookie = `${DOWNLOAD_TOKEN_COOKIE}=some-other-token; Path=/`;
      vi.advanceTimersByTime(1000);
    });

    expect(link).toHaveAttribute("aria-busy", "true");
  });

  // A spinner that never stops is the same dead-click bug in a new costume.
  it("gives up rather than spinning forever", () => {
    render(
      <>
        <DownloadAnchor href="/protected/exports/dues" timeoutMs={5000}>
          Export
        </DownloadAnchor>
        <ToastViewport />
      </>,
    );

    const link = anchor();
    act(() => {
      fireEvent.click(link);
    });
    expect(link).toHaveAttribute("aria-busy", "true");

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(link).not.toHaveAttribute("aria-busy");
    expect(screen.getByText("Still preparing")).toBeInTheDocument();
  });
});
