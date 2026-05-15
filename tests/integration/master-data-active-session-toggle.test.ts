import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireStaffPermission = vi.fn();
const setActiveSessionLabel = vi.fn();
const getActiveSessionLabel = vi.fn();
const createClient = vi.fn();
const createAcademicSession = vi.fn();
const updateAcademicSession = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/session/active", () => ({
  getActiveSessionLabel,
}));

vi.mock("@/lib/session/set-active", () => ({
  setActiveSessionLabel,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/master-data/data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/master-data/data")>(
    "@/lib/master-data/data",
  );

  return {
    ...actual,
    createAcademicSession,
    updateAcademicSession,
  };
});

const initialState = { status: "idle" as const, message: "" };

function liveSessionForm(label: string) {
  const formData = new FormData();
  formData.set("sessionLabel", label);
  formData.set("confirmSessionLabel", label);
  return formData;
}

function sessionForm(label: string, isCurrent: boolean) {
  const formData = new FormData();
  formData.set("sessionId", "00000000-0000-4000-8000-000000000001");
  formData.set("sessionLabel", label);
  formData.set("sessionStatus", "active");
  formData.set("isCurrentSession", isCurrent ? "yes" : "no");
  return formData;
}

function emptyQuery(data: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn((resolve) => resolve({ data, error: null })),
  };
}

describe("Master Data active session toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    setActiveSessionLabel.mockResolvedValue(undefined);
    getActiveSessionLabel.mockResolvedValue("2026-27");
    createAcademicSession.mockResolvedValue(undefined);
    updateAcademicSession.mockResolvedValue(undefined);
  });

  it("setLiveActiveSessionAction switches active when the staff user has settings write access", async () => {
    const { setLiveActiveSessionAction } = await import("@/app/protected/master-data/actions");

    const result = await setLiveActiveSessionAction(initialState, liveSessionForm("2025-26"));

    expect(result.status).toBe("success");
    expect(requireStaffPermission).toHaveBeenCalledWith("settings:write");
    expect(setActiveSessionLabel).toHaveBeenCalledWith("2025-26");
  });

  it("setLiveActiveSessionAction throws when the staff user lacks settings write access", async () => {
    requireStaffPermission.mockRejectedValueOnce(new Error("Access denied"));
    const { setLiveActiveSessionAction } = await import("@/app/protected/master-data/actions");

    await expect(
      setLiveActiveSessionAction(initialState, liveSessionForm("2025-26")),
    ).rejects.toThrow("Access denied");
    expect(setActiveSessionLabel).not.toHaveBeenCalled();
  });

  it("create and update session actions only switch active when the requested current session differs", async () => {
    const { createSessionAction, updateSessionAction } = await import("@/app/protected/master-data/actions");

    await createSessionAction(initialState, sessionForm("2026-27", true));
    expect(setActiveSessionLabel).not.toHaveBeenCalled();

    await updateSessionAction(initialState, sessionForm("2025-26", true));
    expect(setActiveSessionLabel).toHaveBeenCalledWith("2025-26");
  });

  it("the Live now badge follows app_settings active_session_label, not stored is_current rows", async () => {
    getActiveSessionLabel.mockResolvedValue("2025-26");
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "academic_sessions") {
          return emptyQuery([
            {
              id: "session-live",
              session_label: "2025-26",
              status: "active",
              notes: null,
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
            {
              id: "session-stale",
              session_label: "2026-27",
              status: "active",
              notes: null,
              created_at: "2026-01-01",
              updated_at: "2026-01-01",
            },
          ]);
        }

        if (table === "classes" || table === "transport_routes") {
          return emptyQuery();
        }

        if (table === "fee_policy_configs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                custom_fee_heads: [],
                accepted_payment_modes: ["cash", "upi", "bank_transfer", "cheque"],
              },
              error: null,
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { getMasterDataPageData } = await import("@/lib/master-data/data");
    const data = await getMasterDataPageData();

    const liveRow = data.sessions.find((session) => session.session_label === "2025-26");
    const staleRow = data.sessions.find((session) => session.session_label === "2026-27");
    expect(liveRow?.is_current).toBe(true);
    expect(staleRow?.is_current).toBe(false);

    const { MasterDataClient } = await import("@/components/master-data/master-data-client");
    const html = renderToStaticMarkup(
      React.createElement(MasterDataClient, {
        sessions: data.sessions,
        classes: [],
        routes: [],
        feeHeads: [],
        paymentModes: [],
        initialActionState: initialState,
        actions: {
          createSessionAction: vi.fn(),
          updateSessionAction: vi.fn(),
          deleteSessionAction: vi.fn(),
          setLiveActiveSessionAction: vi.fn(),
          createClassAction: vi.fn(),
          updateClassAction: vi.fn(),
          deleteClassAction: vi.fn(),
          createRouteAction: vi.fn(),
          updateRouteAction: vi.fn(),
          deleteRouteAction: vi.fn(),
          createFeeHeadAction: vi.fn(),
          updateFeeHeadAction: vi.fn(),
          deleteFeeHeadAction: vi.fn(),
          setPaymentModeActiveAction: vi.fn(),
        },
      }),
    );

    expect(html).toContain("Live now");
    expect(html).toContain("Not live");
    expect(html).toContain("Make this the live session");
    expect(html).not.toContain("Current session</label>");
    expect(html).not.toContain('<select name="isCurrentSession"');
  });
});
