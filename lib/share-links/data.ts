import "server-only";

import { randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 90;

export type StudentShareLink = {
  id: string;
  studentId: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
};

function generateToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function rowToShareLink(row: {
  id: string;
  student_id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_viewed_at: string | null;
  view_count: number;
}): StudentShareLink {
  return {
    id: row.id,
    studentId: row.student_id,
    token: row.token,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
  };
}

export async function createStudentShareLink(payload: {
  studentId: string;
  ttlDays?: number;
}) {
  const staff = await requireStaffPermission("students:write");
  const supabase = await createClient();
  const ttlDays = payload.ttlDays && payload.ttlDays > 0 ? payload.ttlDays : DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const token = generateToken();

  const { data, error } = await supabase
    .from("student_share_links")
    .insert({
      student_id: payload.studentId,
      token,
      expires_at: expiresAt,
      created_by: (staff?.id as string | undefined) ?? null,
    })
    .select(
      "id, student_id, token, expires_at, revoked_at, created_at, last_viewed_at, view_count",
    )
    .single();

  if (error || !data) {
    throw new Error(`Unable to create share link: ${error?.message ?? "unknown"}`);
  }

  return rowToShareLink(
    data as Parameters<typeof rowToShareLink>[0],
  );
}

export async function listStudentShareLinks(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_share_links")
    .select(
      "id, student_id, token, expires_at, revoked_at, created_at, last_viewed_at, view_count",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load share links: ${error.message}`);
  }

  return ((data ?? []) as Array<Parameters<typeof rowToShareLink>[0]>).map(rowToShareLink);
}

export async function revokeStudentShareLink(linkId: string) {
  await requireStaffPermission("students:write");
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error) {
    throw new Error(`Unable to revoke share link: ${error.message}`);
  }
}

export type ShareLinkValidation =
  | { ok: true; studentId: string; link: StudentShareLink }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

/**
 * Validate a share link token using the service-role client (no staff session).
 * Used by the public `/share/[token]` route.
 */
export async function validateShareLinkToken(token: string): Promise<ShareLinkValidation> {
  if (!token || token.length < 32) return { ok: false, reason: "not_found" };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_share_links")
    .select(
      "id, student_id, token, expires_at, revoked_at, created_at, last_viewed_at, view_count",
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to validate share link: ${error.message}`);
  }

  if (!data) return { ok: false, reason: "not_found" };

  const link = rowToShareLink(data as Parameters<typeof rowToShareLink>[0]);
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, studentId: link.studentId, link };
}

export async function recordShareLinkView(linkId: string) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("student_share_links")
    .select("view_count")
    .eq("id", linkId)
    .maybeSingle();
  const next = ((existing as { view_count: number } | null)?.view_count ?? 0) + 1;
  await supabase
    .from("student_share_links")
    .update({
      last_viewed_at: new Date().toISOString(),
      view_count: next,
    })
    .eq("id", linkId);
}

type ParentViewMember = {
  studentId: string;
  fullName: string;
  admissionNo: string;
  classLabel: string;
  outstandingAmount: number;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
    paymentMode: string;
  }>;
};

export async function getParentShareView(studentId: string) {
  const supabase = createAdminClient();

  const studentResult = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, class_ref:classes(class_name, section, stream_name, session_label)",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (studentResult.error || !studentResult.data) {
    throw new Error(studentResult.error?.message ?? "Student not found");
  }

  type ClassRef = { class_name: string; section: string | null; stream_name: string | null; session_label: string };
  const studentRow = studentResult.data as {
    id: string;
    full_name: string;
    admission_no: string;
    class_ref: ClassRef | ClassRef[] | null;
  };
  const classRef = Array.isArray(studentRow.class_ref)
    ? studentRow.class_ref[0] ?? null
    : studentRow.class_ref;
  const classLabel = classRef
    ? [classRef.class_name, classRef.section, classRef.stream_name].filter(Boolean).join(" ")
    : "Unknown class";

  const [financialsResult, receiptsResult] = await Promise.all([
    supabase
      .from("v_workbook_student_financials")
      .select("outstanding_amount, total_paid, total_due, next_due_label, next_due_date, next_due_amount")
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("id, receipt_number, payment_date, total_amount, payment_mode")
      .eq("student_id", studentId)
      .order("payment_date", { ascending: false })
      .limit(50),
  ]);

  type FinancialRow = {
    outstanding_amount: number | null;
    total_paid: number | null;
    total_due: number | null;
    next_due_label: string | null;
    next_due_date: string | null;
    next_due_amount: number | null;
  };
  const financialRow = (financialsResult.data as FinancialRow | null) ?? null;
  const receiptRows = (receiptsResult.data ?? []) as Array<{
    id: string;
    receipt_number: string;
    payment_date: string;
    total_amount: number;
    payment_mode: string;
  }>;

  const member: ParentViewMember = {
    studentId,
    fullName: studentRow.full_name,
    admissionNo: studentRow.admission_no,
    classLabel,
    outstandingAmount: financialRow?.outstanding_amount ?? 0,
    receipts: receiptRows.map((row) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      totalAmount: row.total_amount,
      paymentMode: row.payment_mode,
    })),
  };

  return {
    student: member,
    financial: {
      outstandingAmount: financialRow?.outstanding_amount ?? 0,
      totalPaid: financialRow?.total_paid ?? 0,
      totalDue: financialRow?.total_due ?? 0,
      nextDueLabel: financialRow?.next_due_label ?? null,
      nextDueDate: financialRow?.next_due_date ?? null,
      nextDueAmount: financialRow?.next_due_amount ?? null,
    },
    sessionLabel: classRef?.session_label ?? "",
  };
}
