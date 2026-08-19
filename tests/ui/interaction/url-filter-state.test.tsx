import { render, act } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUrlFilterState } from "@/hooks/use-url-filter-state";

/**
 * The journey no suite covered: filter a list, open a record, press back.
 *
 * A back-navigation remounts the list from whatever RSC payload the router
 * has — which is the one rendered for the UNFILTERED url, because a
 * `history.replaceState` never created a cache entry for the filtered one. So
 * "remount with stale props while the address bar still carries the filters"
 * is not a contrived case; it is exactly what pressing back does.
 */

const routerReplace = vi.fn();

vi.mock("next/navigation", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    useRouter: () => ({
      push: vi.fn(),
      replace: routerReplace,
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

type Filters = { query: string; classId: string };

const EMPTY: Filters = { query: "", classId: "" };

function toParams(value: Filters) {
  const params = new URLSearchParams();
  if (value.query) params.set("query", value.query);
  if (value.classId) params.set("classId", value.classId);
  return params;
}

function fromParams(params: URLSearchParams): Filters {
  return {
    query: params.get("query") ?? "",
    classId: params.get("classId") ?? "",
  };
}

type HarnessProps = {
  serverValue: Filters;
  sticky?: { key: string; sessionLabel: string } | null;
  commit?: "history" | "router";
  onAdopt?: (value: Filters, source: "url" | "storage") => void;
  /** Applied when the harness's button is pressed, standing in for the UI. */
  change?: Filters;
};

function Harness({ serverValue, sticky = null, commit, onAdopt, change }: HarnessProps) {
  const [filters, setFilters] = useState<Filters>(serverValue);

  const adopt = useCallback(
    (value: Filters, source: "url" | "storage") => {
      setFilters(value);
      onAdopt?.(value, source);
    },
    [onAdopt],
  );

  useUrlFilterState<Filters>({
    pathname: "/protected/students",
    value: filters,
    toParams,
    fromParams,
    onAdopt: adopt,
    commit,
    sticky,
  });

  return (
    <>
      <output data-testid="filters">{`${filters.query}|${filters.classId}`}</output>
      <button type="button" onClick={() => change && setFilters(change)}>
        change
      </button>
    </>
  );
}

function setUrl(search: string) {
  window.history.replaceState(null, "", `/protected/students${search}`);
}

afterEach(() => {
  routerReplace.mockClear();
  window.sessionStorage.clear();
  setUrl("");
});

describe("useUrlFilterState", () => {
  it("adopts the address bar when it disagrees with the props it mounted from", () => {
    // The back-navigation shape: URL says filtered, props say otherwise.
    setUrl("?query=meena&classId=c-10");

    const { getByTestId } = render(<Harness serverValue={EMPTY} />);

    expect(getByTestId("filters").textContent).toBe("meena|c-10");
  });

  it("does not rewrite the address bar on the first render", () => {
    // This is the regression itself. The old mirror effect fired on mount and
    // wrote the stale props over the filters still in the URL, so the evidence
    // was gone before anything could read it.
    setUrl("?query=meena&classId=c-10");

    render(<Harness serverValue={EMPTY} />);

    expect(window.location.search).toBe("?query=meena&classId=c-10");
  });

  it("leaves the props alone when the address bar already agrees", () => {
    setUrl("?query=meena");
    const onAdopt = vi.fn();

    render(<Harness serverValue={{ query: "meena", classId: "" }} onAdopt={onAdopt} />);

    expect(onAdopt).not.toHaveBeenCalled();
  });

  it("mirrors a change the user made", () => {
    setUrl("");
    const { getByRole } = render(
      <Harness serverValue={EMPTY} change={{ query: "raj", classId: "" }} />,
    );

    act(() => getByRole("button", { name: "change" }).click());

    expect(window.location.search).toBe("?query=raj");
  });

  it("re-derives on browser back within the page", () => {
    setUrl("");
    const { getByTestId } = render(<Harness serverValue={EMPTY} />);

    act(() => {
      setUrl("?classId=c-12");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(getByTestId("filters").textContent).toBe("|c-12");
  });

  it("uses router.replace when the server has to read the filters", () => {
    setUrl("");
    const { getByRole } = render(
      <Harness serverValue={EMPTY} commit="router" change={{ query: "raj", classId: "" }} />,
    );

    act(() => getByRole("button", { name: "change" }).click());

    expect(routerReplace).toHaveBeenCalledWith("/protected/students?query=raj");
  });

  describe("remembering filters for the tab", () => {
    const sticky = { key: "vpps.test.filters.v1", sessionLabel: "TEST-2026-27" };

    it("restores a stored set when the url carries none", () => {
      window.sessionStorage.setItem(
        sticky.key,
        JSON.stringify({ session: "TEST-2026-27", query: "classId=c-9" }),
      );
      setUrl("");

      const { getByTestId } = render(<Harness serverValue={EMPTY} sticky={sticky} />);

      expect(getByTestId("filters").textContent).toBe("|c-9");
    });

    it("discards a set stored against a different academic session", () => {
      // The latent bug this closes: switching session strips the query string,
      // which looks exactly like a fresh arrival — so the old year's class id
      // was replayed into the new one.
      window.sessionStorage.setItem(
        sticky.key,
        JSON.stringify({ session: "2025-26", query: "classId=last-year" }),
      );
      setUrl("");

      const { getByTestId } = render(<Harness serverValue={EMPTY} sticky={sticky} />);

      expect(getByTestId("filters").textContent).toBe("|");
    });

    it("lets the url win over a stored set", () => {
      window.sessionStorage.setItem(
        sticky.key,
        JSON.stringify({ session: "TEST-2026-27", query: "classId=c-9" }),
      );
      setUrl("?classId=c-11");

      const { getByTestId } = render(<Harness serverValue={EMPTY} sticky={sticky} />);

      expect(getByTestId("filters").textContent).toBe("|c-11");
    });

    it("forgets rather than storing an empty set", () => {
      window.sessionStorage.setItem(
        sticky.key,
        JSON.stringify({ session: "TEST-2026-27", query: "classId=c-9" }),
      );
      setUrl("?classId=c-11");

      const { getByRole } = render(
        <Harness serverValue={EMPTY} sticky={sticky} change={EMPTY} />,
      );
      // Clearing the filters must not be remembered as an instruction to keep
      // clearing them.
      act(() => getByRole("button", { name: "change" }).click());

      expect(window.sessionStorage.getItem(sticky.key)).toBeNull();
    });
  });
});
