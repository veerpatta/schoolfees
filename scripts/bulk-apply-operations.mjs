/**
 * The operations `scripts/bulk-apply.mjs` knows how to perform.
 *
 * An operation is a deliberately narrow contract: one table, one way of finding
 * a row, and an explicit allowlist of columns that may be written. Adding a new
 * one is a small reviewable diff. That is the point — a harness that could write
 * any column of any table would be the thing that repointed 372 real students
 * into `TEST-2026-27`, only faster.
 *
 * Nothing here may touch `payments`, `receipts` or `payment_adjustments`.
 * Postgres would refuse anyway (`private.prevent_append_only_mutation`), but the
 * allowlist says so first, in a place a reader will look.
 */

/** Tables no operation may ever name, whatever the allowlist says. */
export const FORBIDDEN_TABLES = Object.freeze([
  "payments",
  "receipts",
  "payment_adjustments",
  "receipt_adjustments",
  "audit_logs",
  "user_activity_events",
  // `amount_due` is generated; the whole table is written by the fee engine.
  "installments",
]);

const STUDENT_CONTACT_AND_IDENTITY = Object.freeze([
  "full_name",
  "father_name",
  "mother_name",
  "primary_phone",
  "secondary_phone",
  "email",
  "address",
  "date_of_birth",
  "gender",
  "blood_group",
  "category",
  "religion",
  "caste",
  "nationality",
  "mother_tongue",
  "aadhaar_no",
  "jan_aadhaar_no",
  "apaar_id",
  "house",
  "roll_no",
  "previous_school",
  "tc_number",
  "board_registration_no",
  "village_city",
  "tehsil",
  "district",
  "state",
  "pincode",
  "guardian_name",
  "guardian_relation",
  "guardian_phone",
  "emergency_contact_name",
  "emergency_contact_phone",
  "notes",
]);

/**
 * Students in one session, keyed by admission number.
 *
 * Students reach a session only through `class_id`, so every student lookup is a
 * join through `classes`. Resolving without that join is how an unscoped bulk
 * update moved 372 live students into the test session.
 */
async function resolveStudentsBySession(supabase, sessionLabel, columns) {
  const { data: classRows, error: classError } = await supabase
    .from("classes")
    .select("id, class_name, section, stream_name")
    .eq("session_label", sessionLabel);

  if (classError) {
    throw new Error(`Unable to read classes for ${sessionLabel}: ${classError.message}`);
  }

  const classIds = (classRows ?? []).map((row) => row.id);

  if (classIds.length === 0) {
    throw new Error(
      `No classes exist in session ${sessionLabel}. Nothing in that session can be resolved.`,
    );
  }

  const wanted = Array.from(new Set(["id", "admission_no", "class_id", ...columns]));
  const byKey = new Map();

  for (let index = 0; index < classIds.length; index += 50) {
    const slice = classIds.slice(index, index + 50);
    const { data, error } = await supabase
      .from("students")
      .select(wanted.join(", "))
      .in("class_id", slice);

    if (error) {
      throw new Error(`Unable to read students: ${error.message}`);
    }

    for (const row of data ?? []) {
      byKey.set(row.admission_no, row);
    }
  }

  return { byKey, classRows: classRows ?? [] };
}

function classLabel(row) {
  return [row.class_name, row.section, row.stream_name].filter(Boolean).join(" ");
}

export const OPERATIONS = Object.freeze({
  "student-fields": {
    table: "students",
    matchColumn: "admission_no",
    describe: "Contact, guardian and information fields on a student record.",
    feeImpact: false,
    writable: STUDENT_CONTACT_AND_IDENTITY,
    resolve: (supabase, sessionLabel) =>
      resolveStudentsBySession(supabase, sessionLabel, STUDENT_CONTACT_AND_IDENTITY),
  },

  "student-status": {
    table: "students",
    matchColumn: "admission_no",
    describe: "Enrolment status and leaving date.",
    // A student who leaves stops accruing, so the ledger has to be reworked.
    feeImpact: true,
    writable: ["status", "left_on", "notes"],
    allowedValues: { status: ["active", "inactive", "left", "graduated"] },
    followUp:
      "Status drives who accrues fees. Run Admin Tools → Session Health → prepare missing dues,\n" +
      "  or Fee Setup → Generate, so the ledger matches the new statuses.",
    resolve: (supabase, sessionLabel) =>
      resolveStudentsBySession(supabase, sessionLabel, ["status", "left_on", "notes"]),
  },

  "student-class": {
    table: "students",
    matchColumn: "admission_no",
    describe: "Move a student to another class inside the same session.",
    feeImpact: true,
    writable: ["class_id"],
    // The plan names a class the way staff say it ("Class 7", "Class 12 Science");
    // the harness resolves that to an id WITHIN the session and never outside it.
    virtualColumns: { class: "class_id" },
    followUp:
      "Class decides the fee settings that apply. Re-generate dues in Fee Setup → Generate\n" +
      "  for the affected students, then check Session Health.",
    resolve: (supabase, sessionLabel) =>
      resolveStudentsBySession(supabase, sessionLabel, ["class_id"]),
    prepare: async ({ context, value, sessionLabel }) => {
      const wanted = String(value).trim().toLowerCase();
      const matches = context.classRows.filter(
        (row) => classLabel(row).toLowerCase() === wanted,
      );

      if (matches.length === 0) {
        const known = context.classRows.map(classLabel).sort().join(", ");
        throw new Error(`No class "${value}" in session ${sessionLabel}. Known: ${known}`);
      }

      if (matches.length > 1) {
        throw new Error(`Class "${value}" is ambiguous in session ${sessionLabel}.`);
      }

      return matches[0].id;
    },
    render: (context, value) => {
      const match = context.classRows.find((row) => row.id === value);
      return match ? classLabel(match) : String(value ?? "");
    },
  },

  "student-transport": {
    table: "students",
    matchColumn: "admission_no",
    describe: "Assign or clear a student's transport route.",
    feeImpact: true,
    writable: ["transport_route_id"],
    virtualColumns: { route: "transport_route_id" },
    followUp:
      "Transport is a fee head. Re-generate dues for the affected students in\n" +
      "  Fee Setup → Generate so the transport line matches the new route.",
    resolve: async (supabase, sessionLabel) => {
      const resolved = await resolveStudentsBySession(supabase, sessionLabel, [
        "transport_route_id",
      ]);

      const { data, error } = await supabase
        .from("transport_routes")
        .select("id, route_code, route_name, is_active");

      if (error) {
        throw new Error(`Unable to read transport routes: ${error.message}`);
      }

      return { ...resolved, routeRows: data ?? [] };
    },
    prepare: async ({ context, value }) => {
      if (value === null || value === "" || value === undefined) {
        return null;
      }

      const wanted = String(value).trim().toLowerCase();
      const matches = context.routeRows.filter(
        (row) =>
          row.route_code?.toLowerCase() === wanted || row.route_name?.toLowerCase() === wanted,
      );

      if (matches.length === 0) {
        throw new Error(`No transport route "${value}".`);
      }

      if (matches.length > 1) {
        throw new Error(`Transport route "${value}" is ambiguous.`);
      }

      if (!matches[0].is_active) {
        throw new Error(`Transport route "${value}" is inactive.`);
      }

      return matches[0].id;
    },
    render: (context, value) => {
      if (!value) {
        return "(none)";
      }
      const match = context.routeRows.find((row) => row.id === value);
      return match ? `${match.route_code} ${match.route_name}` : String(value);
    },
  },

  "transport-route-master": {
    table: "transport_routes",
    matchColumn: "route_code",
    describe: "The transport route master list.",
    feeImpact: true,
    writable: ["route_name", "default_installment_amount", "annual_fee_amount", "is_active", "notes"],
    followUp:
      "Route amounts feed every rider's transport line. Re-generate dues in\n" +
      "  Fee Setup → Generate for the classes whose students ride these routes.",
    resolve: async (supabase) => {
      const { data, error } = await supabase
        .from("transport_routes")
        .select("id, route_code, route_name, default_installment_amount, annual_fee_amount, is_active, notes");

      if (error) {
        throw new Error(`Unable to read transport routes: ${error.message}`);
      }

      const byKey = new Map();
      for (const row of data ?? []) {
        byKey.set(row.route_code, row);
      }
      return { byKey };
    },
  },

  "student-fee-override": {
    table: "student_fee_overrides",
    matchColumn: "admission_no",
    describe: "Per-student fee exceptions. The narrow-write regression lives here.",
    feeImpact: true,
    writable: [
      "student_type_override",
      "transport_applies_override",
      "custom_tuition_fee_amount",
      "custom_transport_fee_amount",
      "custom_books_fee_amount",
      "custom_admission_activity_misc_fee_amount",
      "custom_late_fee_flat_amount",
      "discount_amount",
      "reason",
      "notes",
      "is_active",
    ],
    allowedValues: { student_type_override: ["new", "existing"] },
    followUp:
      "An override only reaches a parent's bill once the ledger is regenerated.\n" +
      "  Run Fee Setup → Generate, then `node scripts/repair-discount-drift.mjs --session <label>`\n" +
      "  to confirm no ledger is left disagreeing with the policy.",
    resolve: async (supabase, sessionLabel) => {
      const students = await resolveStudentsBySession(supabase, sessionLabel, []);
      const studentIds = Array.from(students.byKey.values()).map((row) => row.id);
      const overridesByStudent = new Map();

      for (let index = 0; index < studentIds.length; index += 200) {
        const slice = studentIds.slice(index, index + 200);
        const { data, error } = await supabase
          .from("student_fee_overrides")
          .select("*")
          .in("student_id", slice)
          .eq("is_active", true);

        if (error) {
          throw new Error(`Unable to read fee overrides: ${error.message}`);
        }

        for (const row of data ?? []) {
          overridesByStudent.set(row.student_id, row);
        }
      }

      // Key by admission number so the plan reads like a staff instruction, but
      // carry the override row's own id — that is what gets updated.
      const byKey = new Map();
      for (const [admissionNo, student] of students.byKey) {
        const override = overridesByStudent.get(student.id);
        if (override) {
          byKey.set(admissionNo, override);
        }
      }

      return { byKey, classRows: students.classRows, missingNote: "no active fee override row" };
    },
  },
});

export function describeOperations() {
  return Object.entries(OPERATIONS)
    .map(([name, operation]) => {
      const impact = operation.feeImpact ? " [fee impact]" : "";
      return `  ${name}${impact}\n      ${operation.describe}\n      writable: ${operation.writable.join(", ")}`;
    })
    .join("\n");
}
