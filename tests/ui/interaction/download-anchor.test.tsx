import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadAnchor } from "@/ui/primitives/download-anchor";
import { ToastViewport } from "@/ui/primitives/toast";
import { DOWNLOAD_TOKEN_COOKIE, DOWNLOAD_TOKEN_PARAM } from "@/platform/helpers/download-token";

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

describe("DownloadAnchor server/client agreement", () => {
  /**
   * The nonce used to be minted inside `watch()`, which runs during render on
   * BOTH the server and the client. Each produced a different `?dl=`, so every
   * page carrying a download button — Exports, Defaulters, Transactions, bulk
   * entry — logged a React hydration mismatch, reported as "this won't be
   * patched up".
   *
   * The consequence was not cosmetic. The DOM kept the server's href while the
   * click handler closed over the client's token, so the spinner waited for a
   * nonce the server was never asked to echo back and only stopped on the
   * 90-second timeout.
   */
  it("renders the plain href on the server, with no nonce to disagree about", () => {
    const html = renderToStaticMarkup(
      <DownloadAnchor href="/protected/exports/defaulters?session=TEST-2026-27">
        Export
      </DownloadAnchor>,
    );

    expect(html).toContain('href="/protected/exports/defaulters?session=TEST-2026-27"');
    expect(html).not.toContain(DOWNLOAD_TOKEN_PARAM);
  });

  it("produces the same markup twice, so two renders cannot disagree", () => {
    const once = renderToStaticMarkup(
      <DownloadAnchor href="/protected/exports/emi-plans">Export</DownloadAnchor>,
    );
    const twice = renderToStaticMarkup(
      <DownloadAnchor href="/protected/exports/emi-plans">Export</DownloadAnchor>,
    );

    expect(once).toBe(twice);
  });
});
