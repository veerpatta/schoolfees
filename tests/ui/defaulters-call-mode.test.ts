import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Call mode's promise is that a 40-family list becomes finishable: log an
 * outcome, land on the next family, see how far you are. Before this the
 * queue never advanced itself — `handleQuickLog` recorded the outcome and
 * left the clerk to find their place again after every call.
 */

const source = readFileSync(
  join(process.cwd(), "components/defaulters/defaulters-workspace.tsx"),
  "utf8",
);

describe("defaulters call mode", () => {
  it("advances to the next family after an outcome is logged", () => {
    expect(source).toContain("autoAdvance");
    expect(source).toContain("AUTO_ADVANCE_DELAY_MS");
    // Only for the family currently on screen — logging from the list must
    // not yank the selection around.
    expect(source).toContain("studentId === selectedStudentId");
    // And it must land on the NEXT queue entry.
    expect(source).toContain("callQueue[index + 1]?.row.studentId");
  });

  it("lets the clerk turn auto-advance off", () => {
    expect(source).toContain("onToggleAutoAdvance");
    expect(source).toContain("callQueueAutoAdvance");
  });

  it("shows call progress with promises and a recent-outcomes feed", () => {
    expect(source).toContain("function CallProgressPanel");
    expect(source).toContain("callProgressLogged");
    expect(source).toContain("callProgressPromises");
    expect(source).toContain("callProgressRecent");
    // Progress counts only outcomes recorded TODAY, in school time.
    expect(source).toContain('timeZone: "Asia/Kolkata"');
    expect(source).toContain("lastContactedAt.startsWith(today)");
    expect(source).toContain('lastOutcome === "promised_pay"');
  });

  it("previews what is coming and allows skipping one", () => {
    expect(source).toContain("function UpNextPanel");
    expect(source).toContain("callQueueUpNext");
    expect(source).toContain("callQueueSkipForNow");
  });

  it("gives mobile one family at a time with the queue one tap away", () => {
    expect(source).toContain("mobileListOpen");
    expect(source).toContain("callQueueShowFullList");
    // The queue list is hidden on phones until asked for.
    expect(source).toContain('mobileListOpen ? "" : "hidden lg:block"');
  });
});
