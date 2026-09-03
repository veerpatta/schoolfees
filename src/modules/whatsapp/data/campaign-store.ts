import "server-only";

import {
  DEFAULT_LATE_FEE_BASIS,
  isLateFeeBasis,
  type LateFeeBasis,
} from "@/modules/whatsapp/domain/late-fee";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";

/**
 * Saved campaigns and the runs they produce.
 *
 * A campaign is a saved SETTINGS SET, not a saved audience. The list of families
 * is still re-derived from the ledger every time — which is why "stop chasing
 * the ones who paid" needs nothing built: they simply are not in the next run.
 * What is stored is the rule, so the same rule can be applied again next week.
 *
 * Every write goes through the service-role client. The two tables carry a staff
 * SELECT policy and no insert policy at all, so nothing running in a browser can
 * fabricate a record of having messaged a parent.
 */

export type SavedCampaign = {
  id: string;
  sessionLabel: string;
  name: string;
  situation: NoticeSituation;
  language: NoticeLanguage;
  /** The ReminderFilters subset that defines the audience. */
  filters: SavedCampaignFilters;
  lastDate: string | null;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
  archivedAt: string | null;
  createdAt: string;
  /**
   * Raw `schedule` jsonb. Parsed by `parseCampaignSchedule`, never here — this
   * layer does IO and the shape rules are pure and tested separately.
   */
  schedule: unknown;
};

export type SavedCampaignFilters = {
  maxTotalPaid: number;
  minDueAmount: number;
  installments: number[];
  classId: string | null;
  includeRte: boolean;
};

/** One press of Send, with what it collected since. */
export type CampaignRunOutcome = {
  runId: string;
  campaignId: string | null;
  campaignName: string;
  situation: NoticeSituation;
  language: NoticeLanguage;
  startedAt: string;
  lastDate: string | null;
  lateFeePhrase: string | null;
  messaged: number;
  failed: number;
  moneyQuoted: number;
  familiesPaid: number;
  moneyCollected: number;
  /** Counted DISTINCT on provider_message_id, so a family of siblings counts once. */
  delivered: number;
  readCount: number;
  deliveryFailed: number;
  /** Siblings reached on a message naming another child. Costs nothing. */
  coveredBySibling: number;
  /** manual = somebody pressed Send. cron = the scheduled runner. */
  source: string;
  /** The schedule slot this run satisfied, or null for an ad-hoc send. */
  scheduledFor: string | null;
  /** Days between the send and the first receipt, one per family who paid. */
  daysToPay: number[];
};

const CAMPAIGN_COLUMNS =
  "id, session_label, name, situation, language, filters, last_date, late_fee_amount, late_fee_basis, archived_at, created_at, schedule";

/* eslint-disable @typescript-eslint/no-explicit-any */

function toCampaign(row: any): SavedCampaign {
  const raw = (row.filters ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    sessionLabel: String(row.session_label),
    name: String(row.name),
    situation: isNoticeSituation(row.situation) ? row.situation : DEFAULT_SITUATION,
    language: isNoticeLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
    filters: {
      maxTotalPaid: Number(raw.maxTotalPaid ?? 1100),
      minDueAmount: Number(raw.minDueAmount ?? 1),
      installments: Array.isArray(raw.installments)
        ? (raw.installments as unknown[]).map(Number).filter((n) => n >= 1 && n <= 4)
        : [1, 2],
      classId: typeof raw.classId === "string" && raw.classId ? raw.classId : null,
      includeRte: raw.includeRte === true,
    },
    lastDate: row.last_date ? String(row.last_date) : null,
    lateFeeAmount: Number(row.late_fee_amount ?? 0),
    lateFeeBasis: isLateFeeBasis(row.late_fee_basis) ? row.late_fee_basis : DEFAULT_LATE_FEE_BASIS,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
    schedule: row.schedule ?? null,
  };
}

export async function listCampaigns(
  supabase: any,
  sessionLabel: string,
  { includeArchived = false } = {},
): Promise<SavedCampaign[]> {
  let query = supabase
    .from("whatsapp_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("session_label", sessionLabel)
    .order("name");

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  // Fail loud: an empty list would read as "no campaigns yet" and invite the
  // office to create a duplicate of one that already exists.
  if (error) throw new Error(`Could not read saved campaigns: ${error.message}`);
  return ((data ?? []) as any[]).map(toCampaign);
}

export async function getCampaign(supabase: any, id: string): Promise<SavedCampaign | null> {
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read that campaign: ${error.message}`);
  return data ? toCampaign(data) : null;
}

export type CampaignInput = {
  sessionLabel: string;
  name: string;
  situation: NoticeSituation;
  language: NoticeLanguage;
  filters: SavedCampaignFilters;
  lastDate: string | null;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
  /**
   * The parsed schedule, or null for a campaign that only ever runs by hand.
   *
   * Written straight to the jsonb column. Validated by `parseCampaignSchedule`
   * before it reaches here, so an unusable shape never lands in the database.
   */
  schedule: Record<string, unknown> | null;
};

export async function saveCampaign(
  supabase: any,
  input: CampaignInput,
  staffId: string | null,
  existingId?: string,
): Promise<{ id: string } | { duplicateName: true }> {
  const row = {
    session_label: input.sessionLabel,
    name: input.name,
    situation: input.situation,
    language: input.language,
    filters: input.filters,
    last_date: input.lastDate,
    late_fee_amount: input.lateFeeAmount,
    late_fee_basis: input.lateFeeBasis,
    schedule: input.schedule,
    updated_by: staffId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existingId
    ? await supabase
        .from("whatsapp_campaigns")
        .update(row)
        .eq("id", existingId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("whatsapp_campaigns")
        .insert({ ...row, created_by: staffId })
        .select("id")
        .maybeSingle();

  // 23505 on (session_label, name). Reported rather than thrown: two campaigns
  // with one name is a mistake worth naming, not a crash.
  if (error?.code === "23505") return { duplicateName: true };
  if (error) throw new Error(`Could not save that campaign: ${error.message}`);
  return { id: String(data?.id ?? existingId) };
}

/**
 * Archive rather than delete. A campaign is referenced by its runs, and a run is
 * evidence that parents were messaged.
 */
export async function archiveCampaign(supabase: any, id: string, archived: boolean) {
  const { error } = await supabase
    .from("whatsapp_campaigns")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(`Could not archive that campaign: ${error.message}`);
}

/* ------------------------------------------------------------------- runs */

/**
 * Open a run and return its id, so `sendOne` can stamp every send with it.
 *
 * Best-effort by design: this is bookkeeping, and a bookkeeping failure must
 * never stop the office sending. A null id means the sends are logged without a
 * run, exactly as the 142 rows from before runs existed are.
 */
export async function openRun(
  supabase: any,
  run: {
    campaignId: string | null;
    sessionLabel: string;
    campaignName: string;
    situation: NoticeSituation;
    language: NoticeLanguage;
    filters: unknown;
    lastDate: string | null;
    lateFeePhrase: string;
    selectedCount: number;
    startedBy: string | null;
    /** 'manual' = somebody pressed Send. 'cron' = the scheduled runner. */
    source?: "manual" | "cron";
    /**
     * The schedule slot this run satisfies, or null for an ad-hoc send.
     *
     * Stored rather than derived from `started_at`, so a slot deliberately run a
     * day late still counts as that slot instead of leaving it forever due.
     */
    scheduledFor?: string | null;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_campaign_runs")
      .insert({
        campaign_id: run.campaignId,
        session_label: run.sessionLabel,
        campaign_name: run.campaignName,
        situation: run.situation,
        language: run.language,
        filters: run.filters,
        last_date: run.lastDate,
        late_fee_phrase: run.lateFeePhrase,
        selected_count: run.selectedCount,
        started_by: run.startedBy,
      })
      .select("id")
      .maybeSingle();

    if (error) throw error;
    return data?.id ? String(data.id) : null;
  } catch (caught) {
    console.warn("[whatsapp-reminders] could not open a run record", caught);
    return null;
  }
}

/** Close it with what actually happened. Best-effort for the same reason. */
export async function closeRun(
  supabase: any,
  runId: string | null,
  totals: { sent: number; failed: number; already: number; moneyQuoted: number },
) {
  if (!runId) return;
  try {
    await supabase
      .from("whatsapp_campaign_runs")
      .update({
        finished_at: new Date().toISOString(),
        sent_count: totals.sent,
        failed_count: totals.failed,
        already_count: totals.already,
        money_quoted: totals.moneyQuoted,
      })
      .eq("id", runId);
  } catch (caught) {
    console.warn("[whatsapp-reminders] could not close the run record", caught);
  }
}

export async function listRunOutcomes(
  supabase: any,
  sessionLabel: string,
  { campaignId, limit = 40 }: { campaignId?: string; limit?: number } = {},
): Promise<CampaignRunOutcome[]> {
  let query = supabase
    .from("v_whatsapp_run_outcomes")
    .select(
      "run_id, campaign_id, campaign_name, situation, language, started_at, last_date, late_fee_phrase, messaged, failed, money_quoted, families_paid, money_collected, delivered, read_count, delivery_failed, covered_by_sibling, source, scheduled_for, days_to_pay",
    )
    .eq("session_label", sessionLabel)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not read run history: ${error.message}`);

  return ((data ?? []) as any[]).map((row) => ({
    runId: String(row.run_id),
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    campaignName: String(row.campaign_name),
    situation: isNoticeSituation(row.situation) ? row.situation : DEFAULT_SITUATION,
    language: isNoticeLanguage(row.language) ? row.language : DEFAULT_LANGUAGE,
    startedAt: String(row.started_at),
    lastDate: row.last_date ? String(row.last_date) : null,
    lateFeePhrase: row.late_fee_phrase ? String(row.late_fee_phrase) : null,
    messaged: Number(row.messaged ?? 0),
    failed: Number(row.failed ?? 0),
    moneyQuoted: Number(row.money_quoted ?? 0),
    familiesPaid: Number(row.families_paid ?? 0),
    moneyCollected: Number(row.money_collected ?? 0),
    delivered: Number(row.delivered ?? 0),
    readCount: Number(row.read_count ?? 0),
    deliveryFailed: Number(row.delivery_failed ?? 0),
    coveredBySibling: Number(row.covered_by_sibling ?? 0),
    source: String(row.source ?? "manual"),
    scheduledFor: row.scheduled_for ? String(row.scheduled_for) : null,
    daysToPay: Array.isArray(row.days_to_pay)
      ? (row.days_to_pay as unknown[]).map(Number).filter((value) => Number.isFinite(value))
      : [],
  }));
}

/**
 * The families one run messaged, and whether money has landed since.
 *
 * Read per run rather than joined into the list, because it is the detail page's
 * question and the list only needs totals.
 */
export async function loadRunRecipients(
  supabase: any,
  runId: string,
): Promise<
  Array<{
    studentId: string;
    admissionNo: string;
    studentName: string;
    destination: string;
    dueAmount: number;
    status: string;
    error: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("whatsapp_reminder_sends")
    // `full_name` on the base table — `student_name` exists only on the
    // matview, which is not what this joins to.
    .select("student_id, destination, due_amount, status, error_message, students(admission_no, full_name)")
    .eq("run_id", runId)
    .order("due_amount", { ascending: false });

  if (error) throw new Error(`Could not read who this run messaged: ${error.message}`);

  return ((data ?? []) as any[]).map((row) => ({
    studentId: String(row.student_id),
    admissionNo: String(row.students?.admission_no ?? ""),
    studentName: String(row.students?.full_name ?? ""),
    destination: String(row.destination ?? ""),
    dueAmount: Number(row.due_amount ?? 0),
    status: String(row.status ?? ""),
    error: row.error_message ? String(row.error_message) : null,
  }));
}

/**
 * The scheduled slots each campaign has already run for, this session.
 *
 * Keyed by campaign so `campaignsDueOn` can ask "has this slot gone out" without
 * a query per campaign. Only rows carrying a `scheduled_for` count: an ad-hoc
 * send of the same campaign is not the scheduled run, and treating it as one
 * would silently skip the slot.
 */
export async function loadRanScheduleSlots(
   
  supabase: any,
  sessionLabel: string,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("whatsapp_campaign_runs")
    .select("campaign_id, scheduled_for")
    .eq("session_label", sessionLabel)
    .not("scheduled_for", "is", null)
    .not("campaign_id", "is", null);

  // Failing open would offer every scheduled campaign as due and invite the
  // office to send a second copy of something that already went out.
  if (error) throw new Error(`Could not read scheduled run history: ${error.message}`);

  const byCampaign = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ campaign_id: string; scheduled_for: string }>) {
    const slots = byCampaign.get(row.campaign_id);
    if (slots) slots.push(row.scheduled_for);
    else byCampaign.set(row.campaign_id, [row.scheduled_for]);
  }
  return byCampaign;
}
