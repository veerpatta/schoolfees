import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type SchemaClient = ReturnType<ReturnType<typeof createClient>["schema"]>;
type QueryBuilder = ReturnType<SchemaClient["from"]>;

type MoveReport = {
  startedAt: string;
  copied: Record<string, number>;
  verified: Record<string, { publicRows: number; testRows: number; ok: boolean }>;
  blockingPublicReceiptAdjustments: number;
  deletedFromPublic: boolean;
  publicTestStudentsRemaining: number;
  finishedAt?: string;
};

const BATCH_SIZE = 500;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function omit(row: Row, columns: string[]) {
  const next = { ...row };

  columns.forEach((column) => {
    delete next[column];
  });

  return next;
}

function dedupeRows(rows: Row[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const id = String(row.id ?? "");

    if (!id || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

async function fetchAll(buildQuery: () => QueryBuilder) {
  const rows: Row[] = [];

  for (let from = 0; ; from += BATCH_SIZE) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as Row[]));

    if (!data || data.length < BATCH_SIZE) {
      return rows;
    }
  }
}

async function fetchByIds(client: SchemaClient, table: string, column: string, ids: string[]) {
  const rows: Row[] = [];

  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);

    if (batch.length === 0) {
      continue;
    }

    rows.push(
      ...(await fetchAll(() => client.from(table).select("*").in(column, batch))),
    );
  }

  return dedupeRows(rows);
}

async function upsertRows(client: SchemaClient, table: string, rows: Row[]) {
  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });

    if (error) {
      throw new Error(`Failed to copy ${table}: ${error.message}`);
    }
  }
}

async function deleteRows(client: SchemaClient, table: string, ids: string[]) {
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);

    if (batch.length === 0) {
      continue;
    }

    const { error } = await client.from(table).delete().in("id", batch);

    if (error) {
      throw new Error(`Failed to delete public.${table}: ${error.message}`);
    }
  }
}

async function countRowsByIds(client: SchemaClient, table: string, ids: string[]) {
  let count = 0;

  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);

    if (batch.length === 0) {
      continue;
    }

    const { count: batchCount, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("id", batch);

    if (error) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }

    count += batchCount ?? 0;
  }

  return count;
}

async function main() {
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const baseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const publicClient = baseClient.schema("public");
  const testClient = baseClient.schema("test");
  const report: MoveReport = {
    startedAt: new Date().toISOString(),
    copied: {},
    verified: {},
    blockingPublicReceiptAdjustments: 0,
    deletedFromPublic: false,
    publicTestStudentsRemaining: 0,
  };

  const testClasses = await fetchAll(() =>
    publicClient.from("classes").select("id, session_label").like("session_label", "TEST%"),
  );
  const testClassIds = unique(testClasses.map((row) => String(row.id ?? "")));
  const students = await fetchByIds(publicClient, "students", "class_id", testClassIds);
  const studentIds = unique(students.map((row) => String(row.id ?? "")));
  const studentFeeOverrides = await fetchByIds(
    publicClient,
    "student_fee_overrides",
    "student_id",
    studentIds,
  );
  const installments = await fetchByIds(publicClient, "installments", "student_id", studentIds);
  const installmentRows = installments.map((row) => omit(row, ["amount_due"]));
  const receipts = await fetchByIds(publicClient, "receipts", "student_id", studentIds);
  const receiptIds = unique(receipts.map((row) => String(row.id ?? "")));
  const payments = await fetchByIds(publicClient, "payments", "receipt_id", receiptIds);
  const paymentIds = unique(payments.map((row) => String(row.id ?? "")));
  const paymentAdjustments = await fetchByIds(
    publicClient,
    "payment_adjustments",
    "payment_id",
    paymentIds,
  );
  const refundRequests = await fetchByIds(publicClient, "refund_requests", "student_id", studentIds);
  const conventionalDiscountAssignments = await fetchByIds(
    publicClient,
    "student_conventional_discount_assignments",
    "student_id",
    studentIds,
  );
  const importBatchesByTargetSession = await fetchAll(() =>
    publicClient.from("import_batches").select("*").like("target_session_label", "TEST%"),
  );
  const importRowsByStudent = dedupeRows([
    ...(await fetchByIds(publicClient, "import_rows", "target_student_id", studentIds)),
    ...(await fetchByIds(publicClient, "import_rows", "duplicate_student_id", studentIds)),
    ...(await fetchByIds(publicClient, "import_rows", "imported_student_id", studentIds)),
  ]);
  const importBatchIds = unique([
    ...importBatchesByTargetSession.map((row) => String(row.id ?? "")),
    ...importRowsByStudent.map((row) => String(row.batch_id ?? "")),
  ]);
  const importBatches = dedupeRows([
    ...importBatchesByTargetSession,
    ...(await fetchByIds(publicClient, "import_batches", "id", importBatchIds)),
  ]);
  const importRows = dedupeRows([
    ...(await fetchByIds(publicClient, "import_rows", "batch_id", importBatchIds)),
    ...importRowsByStudent,
  ]);

  const receiptAdjustmentRows = await fetchByIds(
    publicClient,
    "receipt_adjustments",
    "student_id",
    studentIds,
  ).catch(() => []);
  report.blockingPublicReceiptAdjustments = receiptAdjustmentRows.length;

  const copyPlan: Array<[string, Row[]]> = [
    ["students", students],
    ["student_fee_overrides", studentFeeOverrides],
    ["installments", installmentRows],
    ["receipts", receipts],
    ["payments", payments],
    ["payment_adjustments", paymentAdjustments],
    ["refund_requests", refundRequests],
    ["student_conventional_discount_assignments", conventionalDiscountAssignments],
    ["import_batches", importBatches],
    ["import_rows", importRows],
  ];

  for (const [table, rows] of copyPlan) {
    await upsertRows(testClient, table, rows);
    report.copied[table] = rows.length;
  }

  for (const [table, rows] of copyPlan) {
    const ids = unique(rows.map((row) => String(row.id ?? "")));
    const testRows = await countRowsByIds(testClient, table, ids);
    report.verified[table] = {
      publicRows: rows.length,
      testRows,
      ok: testRows === rows.length,
    };
  }

  const readline = createInterface({ input, output });
  const confirmation = await readline.question(
    'Type "DELETE PUBLIC TEST DATA" to remove copied TEST rows from public: ',
  );
  readline.close();

  if (confirmation === "DELETE PUBLIC TEST DATA") {
    if (report.blockingPublicReceiptAdjustments > 0) {
      throw new Error(
        "Public receipt_adjustments reference TEST students. They are not mirrored by this phase, so public deletion was stopped.",
      );
    }

    await deleteRows(publicClient, "import_rows", unique(importRows.map((row) => String(row.id ?? ""))));
    await deleteRows(publicClient, "import_batches", unique(importBatches.map((row) => String(row.id ?? ""))));
    await deleteRows(
      publicClient,
      "student_conventional_discount_assignments",
      unique(conventionalDiscountAssignments.map((row) => String(row.id ?? ""))),
    );
    await deleteRows(publicClient, "refund_requests", unique(refundRequests.map((row) => String(row.id ?? ""))));
    await deleteRows(
      publicClient,
      "payment_adjustments",
      unique(paymentAdjustments.map((row) => String(row.id ?? ""))),
    );
    await deleteRows(publicClient, "payments", unique(payments.map((row) => String(row.id ?? ""))));
    await deleteRows(publicClient, "receipts", unique(receipts.map((row) => String(row.id ?? ""))));
    await deleteRows(publicClient, "installments", unique(installments.map((row) => String(row.id ?? ""))));
    await deleteRows(
      publicClient,
      "student_fee_overrides",
      unique(studentFeeOverrides.map((row) => String(row.id ?? ""))),
    );
    await deleteRows(publicClient, "students", studentIds);
    report.deletedFromPublic = true;
  }

  report.publicTestStudentsRemaining = await countRowsByIds(
    publicClient,
    "students",
    studentIds,
  );
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
