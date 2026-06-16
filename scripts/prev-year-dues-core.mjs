// Pure parse + match core for the previous-year dues dry-run CLI.
//
// Dependency-free (no TS, no @/ alias, no node built-ins) so plain `node` can
// run the dry-run script without a TS runner. This MIRRORS lib/prev-year-dues/*
// and is locked to it by tests/unit/prev-year-dues-port-parity.test.ts — if the
// canonical TS lib changes, that parity test fails until this is updated. The
// Admin Tools apply path uses the TS lib directly; this exists only for the CLI.

export const normName = (v) =>
  (v ?? "").toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const normPhone = (v) => {
  const d = (v ?? "").toString().replace(/\D+/g, "");
  return d ? d.slice(-10) : "";
};

export const normAdm = (v) => (v ?? "").toString().trim().toUpperCase();

export const parseRupees = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  const c = v.replace(/[₹,\s]/g, "").trim();
  if (c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export function interpretConfirm(v) {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "") return "pending";
  if (["Y", "YES", "CONFIRM", "CONFIRMED"].includes(t)) return "confirm";
  const c = t.replace(/[^A-Z]/g, "");
  if (["WRITEOFF", "WAIVE", "WAIVED"].includes(c)) return "write_off";
  if (t === "N" || t === "NO") return "reject";
  return "pending";
}

const matchers = {
  oldAdmissionNo: (h) => h.includes("old") && h.includes("adm"),
  oldName: (h) => h.includes("name") && (h.includes("last year") || h.includes("export")),
  prevYearDue: (h) => h.includes("prev") && h.includes("due"),
  suggestedAppAdmissionNo: (h) => h.includes("suggested") && h.includes("adm"),
  appStudentName: (h) => h.includes("app") && h.includes("student") && h.includes("name"),
  appPhone: (h) => h.includes("app") && h.includes("phone"),
  confirm: (h) => h.includes("confirm"),
  correctedAppAdmissionNo: (h) => h.includes("correct") && h.includes("adm"),
};

function resolveColumns(headers) {
  const hits = {};
  for (const header of headers) {
    const n = header.trim().toLowerCase().replace(/\s+/g, " ");
    for (const key of Object.keys(matchers)) {
      if (!hits[key] && matchers[key](n)) hits[key] = header;
    }
  }
  return hits;
}

const txt = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export function parseRows(records) {
  if (!records.length) return [];
  const headers = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const cols = resolveColumns(headers);
  const get = (r, c) => (c ? (r[c] ?? null) : null);
  return records.map((r, idx) => {
    const ownerDecision = interpretConfirm(get(r, cols.confirm));
    const prevYearDue = parseRupees(get(r, cols.prevYearDue));
    const corrected = txt(get(r, cols.correctedAppAdmissionNo));
    const suggested = txt(get(r, cols.suggestedAppAdmissionNo));
    let parseError = null;
    if (ownerDecision === "confirm") {
      if (prevYearDue === null) parseError = "Confirmed row has no readable Prev-Year Due amount.";
      else if (prevYearDue <= 0) parseError = "Confirmed row has a non-positive amount.";
    }
    return {
      rowIndex: idx,
      ownerDecision,
      prevYearDue,
      targetAdmissionNo: corrected ?? suggested,
      appStudentName: txt(get(r, cols.appStudentName)),
      oldName: txt(get(r, cols.oldName)),
      appPhone: txt(get(r, cols.appPhone)),
      oldAdmissionNo: txt(get(r, cols.oldAdmissionNo)),
      parseError,
    };
  });
}

export function planRows(rows, students) {
  const byAdm = new Map();
  const byNamePhone = new Map();
  for (const s of students) {
    const a = normAdm(s.admissionNo);
    if (a) {
      if (!byAdm.has(a)) byAdm.set(a, []);
      byAdm.get(a).push(s);
    }
    const n = normName(s.fullName);
    const p = normPhone(s.phone);
    if (n && p) {
      const k = `${n}|${p}`;
      if (!byNamePhone.has(k)) byNamePhone.set(k, []);
      byNamePhone.get(k).push(s);
    }
  }
  const claimed = new Set();
  return rows.map((row) => {
    const out = {
      row,
      status: null,
      matchMethod: "unmatched",
      matchedStudentId: null,
      applyAmount: null,
      alreadyApplied: false,
      skipReason: null,
    };
    if (row.parseError) return { ...out, status: "error", skipReason: row.parseError };
    if (row.ownerDecision !== "confirm")
      return { ...out, status: "skipped", skipReason: `Owner decision: ${row.ownerDecision}` };
    let candidates = [];
    let method = "unmatched";
    const ta = normAdm(row.targetAdmissionNo);
    if (ta && byAdm.has(ta)) {
      candidates = byAdm.get(ta);
      method = "admission_no";
    }
    if (!candidates.length) {
      const n = normName(row.appStudentName ?? row.oldName);
      const p = normPhone(row.appPhone);
      if (n && p && byNamePhone.has(`${n}|${p}`)) {
        candidates = byNamePhone.get(`${n}|${p}`);
        method = "name_phone";
      }
    }
    if (!candidates.length) return { ...out, status: "unmatched", skipReason: "No matching student found." };
    if (candidates.length > 1)
      return { ...out, status: "ambiguous", matchMethod: "ambiguous", skipReason: `Multiple students (${candidates.length}) match.` };
    const s = candidates[0];
    out.matchMethod = method;
    out.matchedStudentId = s.studentId;
    if (claimed.has(s.studentId)) return { ...out, status: "error", skipReason: "Duplicate confirmed row for same student." };
    if (s.hasExistingCarryForward) {
      claimed.add(s.studentId);
      return { ...out, status: "matched", applyAmount: row.prevYearDue, alreadyApplied: true, skipReason: "Already has carry-forward (idempotent)." };
    }
    if (!s.feeSettingId || !s.classId) return { ...out, status: "no_fee_setting", skipReason: "No active fee setting for class." };
    claimed.add(s.studentId);
    return { ...out, status: "matched", applyAmount: row.prevYearDue };
  });
}
