/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import postgres from "npm:postgres@3.4.9";

const NOTION_VERSION = "2022-06-28";
const HUB_TITLE = "VPPS Fee Read-only Mirror Hub";
const STUDENT_DB_TITLE = "VPPS Fee Data Sync (Auto - Do Not Edit)";
const DAILY_DB_TITLE = "VPPS Daily Fee Summary (Auto)";
const WARNING_TEXT = "Read-only mirror from the Schoolfees app. Use Defaulters in the app for promises, callbacks, and recovery follow-up.";
const DEFAULT_SESSION = "TEST-2026-27";
const STANDARD_CLASS_COLUMNS = [
  "PP3",
  "PP4",
  "PP5",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

type SyncBody = {
  session?: string;
  dry_run?: boolean;
  source?: string;
};

type SyncStats = {
  studentsSynced: number;
  familiesSynced: number;
  dailySummariesSynced: number;
  trackerRowsSynced: number;
  errors: string[];
  warnings: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getEnv(name: string, required = true) {
  const value = Deno.env.get(name);
  if (!value && required) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value ?? "";
}

function istDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function titleText(title: string) {
  return [{ text: { content: title.slice(0, 2000) } }];
}

function richText(value: unknown) {
  const content = value === null || value === undefined ? "" : String(value);
  return { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
}

function titleProp(value: unknown) {
  const content = value === null || value === undefined ? "" : String(value);
  return { title: [{ text: { content: content.slice(0, 2000) } }] };
}

function numberProp(value: unknown) {
  const number = Number(value ?? 0);
  return { number: Number.isFinite(number) ? number : 0 };
}

function selectProp(value: unknown) {
  const name = value === null || value === undefined || value === "" ? "Unknown" : String(value);
  return { select: { name: name.slice(0, 100) } };
}

function dateProp(value: unknown) {
  if (!value) return { date: null };
  return { date: { start: String(value) } };
}

function checkboxProp(value: unknown) {
  return { checkbox: Boolean(value) };
}

function phoneProp(value: unknown) {
  const phone = value === null || value === undefined ? "" : String(value);
  return { phone_number: phone ? phone.slice(0, 100) : null };
}

function normalizeClassColumn(label: string) {
  const cleaned = label
    .toUpperCase()
    .replace(/CLASS|GRADE|STD|STANDARD|\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/PP\s*3|PRE\s*PRIMARY\s*3/.test(cleaned)) return "PP3";
  if (/PP\s*4|PRE\s*PRIMARY\s*4/.test(cleaned)) return "PP4";
  if (/PP\s*5|PRE\s*PRIMARY\s*5|KG/.test(cleaned)) return "PP5";
  if (/^1(\D|$)|\bI\b/.test(cleaned)) return "I";
  if (/^2(\D|$)|\bII\b/.test(cleaned)) return "II";
  if (/^3(\D|$)|\bIII\b/.test(cleaned)) return "III";
  if (/^4(\D|$)|\bIV\b/.test(cleaned)) return "IV";
  if (/^5(\D|$)|\bV\b/.test(cleaned)) return "V";
  if (/^6(\D|$)|\bVI\b/.test(cleaned)) return "VI";
  if (/^7(\D|$)|\bVII\b/.test(cleaned)) return "VII";
  if (/^8(\D|$)|\bVIII\b/.test(cleaned)) return "VIII";
  if (/^9(\D|$)|\bIX\b/.test(cleaned)) return "IX";
  if (/^10(\D|$)|\bX\b/.test(cleaned)) return "X";
  if (/^11(\D|$)|\bXI\b/.test(cleaned)) return "XI";
  if (/^12(\D|$)|\bXII\b/.test(cleaned)) return "XII";
  return "";
}

class NotionClient {
  apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async request(path: string, init: RequestInit = {}, attempt = 1): Promise<any> {
    await sleep(360);
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) return {};
      return response.json();
    }

    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(750 * attempt * attempt);
      return this.request(path, init, attempt + 1);
    }

    throw new Error(`Notion ${response.status} ${path}: ${detail}`);
  }

  async search(query: string, object?: "page" | "database") {
    const body: Record<string, unknown> = { query, page_size: 10 };
    if (object) body.filter = { property: "object", value: object };
    return this.request("/search", { method: "POST", body: JSON.stringify(body) });
  }

  async findPageByTitle(title: string) {
    const result = await this.search(title, "page");
    return result.results?.find((page: any) => getPageTitle(page) === title) ?? null;
  }

  async findDatabaseByTitle(title: string) {
    const result = await this.search(title, "database");
    return result.results?.find((database: any) => getDatabaseTitle(database) === title) ?? null;
  }

  async createHubPage(parentPageId: string) {
    return this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: { title: titleProp(HUB_TITLE) },
      }),
    });
  }

  async createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>) {
    return this.request("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        title: titleText(title),
        properties,
      }),
    });
  }

  async updateDatabaseProperties(databaseId: string, properties: Record<string, unknown>) {
    if (Object.keys(properties).length === 0) return;
    await this.request(`/databases/${databaseId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }

  async queryByRichText(databaseId: string, property: string, value: string) {
    const result = await this.request(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 1,
        filter: { property, rich_text: { equals: value } },
      }),
    });
    return result.results?.[0] ?? null;
  }

  async updatePage(pageId: string, properties: Record<string, unknown>) {
    return this.request(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }

  async createPage(databaseId: string, properties: Record<string, unknown>) {
    return this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });
  }

  async addDatabaseWarning(databaseId: string) {
    try {
      await this.request(`/blocks/${databaseId}/children`, {
        method: "PATCH",
        body: JSON.stringify({
          children: [
            {
              object: "block",
              type: "callout",
              callout: {
                rich_text: [{ text: { content: WARNING_TEXT } }],
                color: "yellow_background",
              },
            },
          ],
        }),
      });
    } catch {
      // Some Notion database surfaces do not accept child blocks. The database
      // title still carries the "Auto" warning and synced properties are owned.
    }
  }
}

function getPageTitle(page: any) {
  const titleProperty = Object.values(page.properties ?? {}).find((property: any) => property.type === "title") as any;
  return titleProperty?.title?.map((part: any) => part.plain_text).join("") ?? "";
}

function getDatabaseTitle(database: any) {
  return database.title?.map((part: any) => part.plain_text).join("") ?? "";
}

const studentDbSchema: Record<string, unknown> = {
  Name: { title: {} },
  "Sync Key": { rich_text: {} },
  "Student ID": { rich_text: {} },
  "SR No": { rich_text: {} },
  Class: { select: {} },
  Session: { select: {} },
  "Father Name": { rich_text: {} },
  Phone: { phone_number: {} },
  "Family Key": { rich_text: {} },
  Route: { rich_text: {} },
  "Total Due": { number: { format: "rupee" } },
  "Total Paid": { number: { format: "rupee" } },
  "Total Pending": { number: { format: "rupee" } },
  "Inst 1 Status": { select: { options: statusOptions() } },
  "Inst 2 Status": { select: { options: statusOptions() } },
  "Inst 3 Status": { select: { options: statusOptions() } },
  "Inst 4 Status": { select: { options: statusOptions() } },
  "Inst 1 Due Amount": { number: { format: "rupee" } },
  "Inst 2 Due Amount": { number: { format: "rupee" } },
  "Inst 3 Due Amount": { number: { format: "rupee" } },
  "Inst 4 Due Amount": { number: { format: "rupee" } },
  "Inst 1 Paid Amount": { number: { format: "rupee" } },
  "Inst 2 Paid Amount": { number: { format: "rupee" } },
  "Inst 3 Paid Amount": { number: { format: "rupee" } },
  "Inst 4 Paid Amount": { number: { format: "rupee" } },
  "Late Fee Applied": { checkbox: {} },
  "Last Payment Date": { date: {} },
  "Last Payment Amount": { number: { format: "rupee" } },
  "Last Payment Mode": { select: {} },
  "Last Receipt No": { rich_text: {} },
  "Sibling Count": { number: {} },
  "Family Total Pending": { number: { format: "rupee" } },
  "Last Synced": { date: {} },
};

const dailyDbSchema: Record<string, unknown> = {
  Summary: { title: {} },
  Key: { rich_text: {} },
  Date: { date: {} },
  Session: { select: {} },
  "Collected Today": { number: { format: "rupee" } },
  "Collected MTD": { number: { format: "rupee" } },
  "Collected Session-to-Date": { number: { format: "rupee" } },
  "Payments Count": { number: {} },
  "Defaulter Count": { number: {} },
  "Dues by Class": { rich_text: {} },
  "Last Synced": { date: {} },
  ...Object.fromEntries(STANDARD_CLASS_COLUMNS.map((name) => [`Dues ${name}`, { number: { format: "rupee" } }])),
};

function statusOptions() {
  return [
    { name: "Paid", color: "green" },
    { name: "Partial", color: "yellow" },
    { name: "Pending", color: "red" },
  ];
}

function missingProperties(database: any, desired: Record<string, unknown>) {
  const existing = database.properties ?? {};
  return Object.fromEntries(Object.entries(desired).filter(([name]) => !existing[name]));
}

function studentProperties(student: any, family: any, syncedAt: string) {
  return {
    Name: titleProp(student.student_name),
    "Sync Key": richText(`${student.session}:${student.student_id}`),
    "Student ID": richText(student.student_id),
    "SR No": richText(student.sr_no),
    Class: selectProp(student.class),
    Session: selectProp(student.session),
    "Father Name": richText(student.father_name),
    Phone: phoneProp(student.phone),
    "Family Key": richText(student.family_key),
    Route: richText(student.transport_route),
    "Total Due": numberProp(student.total_annual_fees_due),
    "Total Paid": numberProp(student.total_paid_to_date),
    "Total Pending": numberProp(student.total_pending),
    "Inst 1 Status": selectProp(student.inst1_status),
    "Inst 2 Status": selectProp(student.inst2_status),
    "Inst 3 Status": selectProp(student.inst3_status),
    "Inst 4 Status": selectProp(student.inst4_status),
    "Inst 1 Due Amount": numberProp(student.inst1_due_amount),
    "Inst 2 Due Amount": numberProp(student.inst2_due_amount),
    "Inst 3 Due Amount": numberProp(student.inst3_due_amount),
    "Inst 4 Due Amount": numberProp(student.inst4_due_amount),
    "Inst 1 Paid Amount": numberProp(student.inst1_paid_amount),
    "Inst 2 Paid Amount": numberProp(student.inst2_paid_amount),
    "Inst 3 Paid Amount": numberProp(student.inst3_paid_amount),
    "Inst 4 Paid Amount": numberProp(student.inst4_paid_amount),
    "Late Fee Applied": checkboxProp(student.late_fee_applied),
    "Last Payment Date": dateProp(student.last_payment_date),
    "Last Payment Amount": numberProp(student.last_payment_amount),
    "Last Payment Mode": student.last_payment_mode ? selectProp(student.last_payment_mode) : { select: null },
    "Last Receipt No": richText(student.last_receipt_no),
    "Sibling Count": numberProp(family?.sibling_count ?? 1),
    "Family Total Pending": numberProp(family?.family_total_pending ?? student.total_pending),
    "Last Synced": dateProp(syncedAt),
  };
}

function dailyProperties(summary: any, syncedAt: string) {
  const duesByClass = summary.dues_by_class ?? {};
  const classColumns = Object.fromEntries(
    STANDARD_CLASS_COLUMNS.map((column) => [`Dues ${column}`, numberProp(0)]),
  );

  for (const [classLabel, amount] of Object.entries(duesByClass)) {
    const column = normalizeClassColumn(String(classLabel));
    if (column) classColumns[`Dues ${column}`] = numberProp(amount);
  }

  return {
    Summary: titleProp(`${summary.session} ${summary.summary_date}`),
    Key: richText(`${summary.session}:${summary.summary_date}`),
    Date: dateProp(summary.summary_date),
    Session: selectProp(summary.session),
    "Collected Today": numberProp(summary.total_collected_today),
    "Collected MTD": numberProp(summary.collection_month_to_date),
    "Collected Session-to-Date": numberProp(summary.collection_session_to_date),
    "Payments Count": numberProp(summary.payments_count_today),
    "Defaulter Count": numberProp(summary.defaulter_count),
    "Dues by Class": richText(JSON.stringify(duesByClass)),
    "Last Synced": dateProp(syncedAt),
    ...classColumns,
  };
}

async function ensureHub(notion: NotionClient) {
  const configured = Deno.env.get("NOTION_HUB_PAGE_ID");
  if (configured) return { id: configured };

  const existing = await notion.findPageByTitle(HUB_TITLE);
  if (existing) return existing;

  const parentPageId = Deno.env.get("NOTION_PARENT_PAGE_ID");
  if (!parentPageId) {
    throw new Error(`Could not find "${HUB_TITLE}". Set NOTION_HUB_PAGE_ID or NOTION_PARENT_PAGE_ID.`);
  }

  return notion.createHubPage(parentPageId);
}

async function ensureDatabase(notion: NotionClient, hubPageId: string, title: string, schema: Record<string, unknown>) {
  let database = await notion.findDatabaseByTitle(title);
  if (!database) {
    database = await notion.createDatabase(hubPageId, title, schema);
    await notion.addDatabaseWarning(database.id);
    return database;
  }

  const missing = missingProperties(database, schema);
  await notion.updateDatabaseProperties(database.id, missing);
  if (Object.keys(missing).length > 0) {
    database = await notion.request(`/databases/${database.id}`);
  }
  return database;
}

async function upsertPageByKey(notion: NotionClient, databaseId: string, keyProperty: string, key: string, properties: Record<string, unknown>) {
  const existing = await notion.queryByRichText(databaseId, keyProperty, key);
  if (existing) {
    await notion.updatePage(existing.id, properties);
    return existing.id;
  }
  const created = await notion.createPage(databaseId, properties);
  return created.id;
}

async function readSyncData(sql: postgres.Sql, session: string, summaryDate: string) {
  const students = await sql`
    select *
    from public.v_notion_student_fee_summary
    where session = ${session}
    order by class, student_name
  `;
  const families = await sql`
    select *
    from public.v_notion_family_fee_summary
    where session = ${session}
    order by family_total_pending desc, student_names
  `;
  const daily = await sql`
    select *
    from public.v_notion_daily_collection_summary
    where session = ${session}
      and summary_date = ${summaryDate}
    limit 1
  `;

  return { students, families, daily };
}

async function writeLog(sql: postgres.Sql, session: string, dryRun: boolean, stats: SyncStats) {
  const status = dryRun
    ? "dry_run"
    : stats.errors.length > 0 && (stats.studentsSynced > 0 || stats.dailySummariesSynced > 0)
      ? "partial"
      : stats.errors.length > 0
        ? "failed"
        : "success";

  await sql`
    insert into public.notion_sync_log (
      session_label,
      students_synced,
      families_synced,
      daily_summaries_synced,
      tracker_rows_synced,
      errors_count,
      status,
      error_detail,
      dry_run
    )
    values (
      ${session},
      ${stats.studentsSynced},
      ${stats.familiesSynced},
      ${stats.dailySummariesSynced},
      ${stats.trackerRowsSynced},
      ${stats.errors.length},
      ${status},
      ${[...stats.errors, ...stats.warnings].join("\n").slice(0, 8000) || null},
      ${dryRun}
    )
  `;
}

async function runSync(body: SyncBody, request: Request) {
  const session = body.session || Deno.env.get("NOTION_SYNC_DEFAULT_SESSION") || DEFAULT_SESSION;
  const dryRun = body.dry_run ?? true;
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");

  if (cronSecret && request.headers.get("x-vpps-cron-secret") !== cronSecret && body.source === "pg_cron") {
    return jsonResponse({ error: "Invalid cron secret." }, 401);
  }

  const databaseUrl = getEnv("NOTION_SYNC_DATABASE_URL");
  const sql = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5, ssl: "require" });
  const stats: SyncStats = {
    studentsSynced: 0,
    familiesSynced: 0,
    dailySummariesSynced: 0,
    trackerRowsSynced: 0,
    errors: [],
    warnings: [],
  };

  try {
    const summaryDate = body.source === "manual" ? istDateString() : istDateString();
    const syncedAt = new Date().toISOString();
    const { students, families, daily } = await readSyncData(sql, session, summaryDate);
    const familyByKey = new Map(families.map((family: any) => [family.family_key, family]));

    if (dryRun) {
      stats.studentsSynced = students.length;
      stats.familiesSynced = families.length;
      stats.dailySummariesSynced = daily.length;
      await writeLog(sql, session, true, stats);
      return jsonResponse({
        ok: true,
        dry_run: true,
        session,
        summary_date: summaryDate,
        would_sync: {
          students: students.length,
          families: families.length,
          daily_summaries: daily.length,
        },
        samples: {
          students: students.slice(0, 3),
          families: families.slice(0, 3),
          daily: daily[0] ?? null,
        },
      });
    }

    const notion = new NotionClient(getEnv("NOTION_API_KEY"));
    const hub = await ensureHub(notion);
    const studentDb = await ensureDatabase(notion, hub.id, STUDENT_DB_TITLE, studentDbSchema);
    const dailyDb = await ensureDatabase(notion, hub.id, DAILY_DB_TITLE, dailyDbSchema);

    for (const student of students) {
      try {
        const family = familyByKey.get(student.family_key);
        const key = `${student.session}:${student.student_id}`;
        await upsertPageByKey(notion, studentDb.id, "Sync Key", key, studentProperties(student, family, syncedAt));
        stats.studentsSynced += 1;
      } catch (error) {
        stats.errors.push(`Student ${student.student_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const summary of daily) {
      try {
        const key = `${summary.session}:${summary.summary_date}`;
        await upsertPageByKey(notion, dailyDb.id, "Key", key, dailyProperties(summary, syncedAt));
        stats.dailySummariesSynced += 1;
      } catch (error) {
        stats.errors.push(`Daily summary ${summary.summary_date}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    stats.familiesSynced = families.length;
    await writeLog(sql, session, false, stats);

    return jsonResponse({
      ok: stats.errors.length === 0,
      session,
      summary_date: summaryDate,
      stats,
    }, stats.errors.length === 0 ? 200 : 207);
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message : String(error));
    await writeLog(sql, session, dryRun, stats);
    return jsonResponse({ ok: false, session, stats }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST." }, 405);
  }

  let body: SyncBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return runSync(body, request);
});
