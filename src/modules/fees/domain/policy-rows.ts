import "server-only";

import type { PaymentMode } from "@/platform/db/types";
export type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

export type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_id: string;
  class_ref: ClassRow | ClassRow[] | null;
};

export type RouteRow = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  annual_fee_amount: number | null;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
};

export type GlobalPolicyRow = {
  id: string;
  academic_session_label: string;
  calculation_model: "standard" | "workbook_v1";
  installment_schedule: unknown;
  late_fee_flat_amount: number;
  new_student_academic_fee_amount: number;
  old_student_academic_fee_amount: number;
  academic_fee_distribution: "first_only" | "equal" | null;
  custom_fee_heads: unknown;
  accepted_payment_modes: PaymentMode[];
  receipt_prefix: string;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
};

export type SchoolDefaultRow = {
  id: string;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
};

export type FeeSettingRow = {
  id: string;
  class_id: string;
  tuition_fee_amount: number;
  transport_fee_amount: number;
  books_fee_amount: number;
  admission_activity_misc_fee_amount: number;
  other_fee_heads: Record<string, unknown> | null;
  student_type_default: "new" | "existing";
  transport_applies_default: boolean;
  notes: string | null;
  updated_at: string;
};

export type StudentOverrideRow = {
  id: string;
  student_id: string;
  fee_setting_id: string;
  custom_tuition_fee_amount: number | null;
  custom_transport_fee_amount: number | null;
  custom_books_fee_amount: number | null;
  custom_admission_activity_misc_fee_amount: number | null;
  custom_other_fee_heads: Record<string, unknown> | null;
  custom_other_fee_head_labels?: Record<string, unknown> | null;
  custom_late_fee_flat_amount: number | null;
  other_adjustment_head: string | null;
  other_adjustment_amount: number | null;
  late_fee_waiver_amount: number;
  discount_amount: number;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
  reason: string;
  notes?: string | null;
  updated_at: string;
};

export type InstallmentBalanceRow = {
  due_date: string;
  outstanding_amount: number;
  balance_status: "paid" | "partial" | "overdue" | "pending" | "waived" | "cancelled";
  installment_label: string;
};

