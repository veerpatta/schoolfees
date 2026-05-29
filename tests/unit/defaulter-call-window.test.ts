import { describe, expect, it } from "vitest";

import { callWindowForHour, pickBestCallWindow } from "@/lib/defaulters/cadence";

describe("callWindowForHour", () => {
  it("buckets hours into the right band", () => {
    expect(callWindowForHour(6)).toBe("morning");
    expect(callWindowForHour(11)).toBe("morning");
    expect(callWindowForHour(12)).toBe("afternoon");
    expect(callWindowForHour(16)).toBe("afternoon");
    expect(callWindowForHour(17)).toBe("evening");
    expect(callWindowForHour(21)).toBe("evening");
    expect(callWindowForHour(23)).toBe("night");
    expect(callWindowForHour(2)).toBe("night");
  });
});

describe("pickBestCallWindow", () => {
  it("returns null below the minimum reached threshold", () => {
    expect(pickBestCallWindow({})).toBeNull();
    expect(pickBestCallWindow({ evening: 1 })).toBeNull();
  });

  it("returns the dominant window once there's enough signal", () => {
    expect(pickBestCallWindow({ morning: 1, evening: 3 })).toBe("evening");
    expect(pickBestCallWindow({ afternoon: 2 })).toBe("afternoon");
  });
});
