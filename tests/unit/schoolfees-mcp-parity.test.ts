import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const localSource = readFileSync(
  join(process.cwd(), "scripts/schoolfees-mcp-server.mjs"),
  "utf8",
);
const workerSource = readFileSync(
  join(process.cwd(), "workers/schoolfees-mcp/worker.mjs"),
  "utf8",
);

function registeredTools(source: string) {
  return [...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

describe("Schoolfees MCP local/Worker parity", () => {
  it("publishes the same tool surface from both transports", () => {
    expect(registeredTools(workerSource)).toEqual(registeredTools(localSource));
    expect(registeredTools(workerSource)).toContain("get_student_financial_history");
    expect(registeredTools(workerSource)).toContain("get_dashboard_analytics");
  });

  it("keeps the latest financial semantics on both transports", () => {
    for (const source of [localSource, workerSource]) {
      expect(source).toContain('const SERVER_VERSION = "0.5.0"');
      expect(source).toContain("function moneySegment(row)");
      expect(source).toContain("Custom transport (${money(row.transport_fee)} annual)");
      expect(source).toContain("total_discount_closeouts");
      expect(source).toContain("AI_WORKBOOK_SHEETS");
      expect(source).toContain("getStudentFinancialHistory");
      expect(source).toContain("getRepaymentPlanStatus");
      expect(source).toContain("planAwareRecoveryState");
      expect(source).toContain('"EMI Plans"');
      expect(source).toContain('"EMI Schedule"');
      expect(source).toContain("lateFeePendingAmount");
    }
  });
});
