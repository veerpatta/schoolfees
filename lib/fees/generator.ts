import "server-only";

import { createClient } from "@/lib/supabase/server";

export type LedgerGenerationPreview = {
  totalActiveStudents: number;
  studentsWithFeeSettings: number;
  existingInstallments: number;
  installmentsToGenerate: number;
  totalInstallmentsAfterGeneration: number;
};

function parseDateForSession(dayMonth: string, startYear: number): Date {
  // e.g. "20 April" -> "April" "20"
  // Assuming startYear is the current academic year start year.
  // We'll hardcode logic based on month name for typical Indian academic years.
  // April to December -> startYear
  // January to March -> startYear + 1
  const [dayPattern, monthName] = dayMonth.trim().split(/\s+/);
  const day = parseInt(dayPattern, 10) || 1;
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const monthIdx = monthNames.indexOf(monthName.toLowerCase());
  
  if (monthIdx === -1) {
    throw new Error(`Invalid month in due date: ${monthName}`);
  }

  let year = startYear;
  if (monthIdx < 3) {
    // January, February, March
    year = startYear + 1;
  }

  return new Date(Date.UTC(year, monthIdx, day));
}

export async function previewLedgerGeneration(): Promise<LedgerGenerationPreview> {
  const supabase = await createClient();

  // We are going to just generate some basic stats from count queries or simple joins.
  // For a precise count of what exactly will be generated, we would need to run the calculation.
  
  // 1. Get all active students
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("status", "active");

  if (studentsError) throw new Error(studentsError.message);
  
  // 2. Get class fee settings mapped by class_id
  const { data: feeSettings, error: settingsError } = await supabase
    .from("fee_settings")
    .select("id, class_id, installment_count")
    .eq("is_active", true);
    
  if (settingsError) throw new Error(settingsError.message);

  const studentsTotal = students.length;
  
  let studentsWithSettings = 0;
  let totalProjectedInstallments = 0;

  const settingsMap = new Map();
  for (const s of feeSettings) {
    settingsMap.set(s.class_id, s);
  }

  for (const student of students) {
    const setting = settingsMap.get(student.class_id);
    if (setting) {
      studentsWithSettings++;
      totalProjectedInstallments += setting.installment_count;
    }
  }

  // 3. Count existing installments for active students
  const { count: existingCount, error: existingError } = await supabase
    .from("installments")
    .select("id", { count: "exact", head: true });

  if (existingError) throw existingError;

  return {
    totalActiveStudents: studentsTotal,
    studentsWithFeeSettings: studentsWithSettings,
    existingInstallments: existingCount || 0,
    installmentsToGenerate: Math.max(0, totalProjectedInstallments - (existingCount || 0)), // Approximate
    totalInstallmentsAfterGeneration: totalProjectedInstallments,
  };
}

export async function generateSessionLedgersAction() {
  const supabase = await createClient();

  // Note: Session start year should ideally come from a config or session_label
  const startYear = 2026; 

  const { data: schoolDefaults, error: defaultsError } = await supabase
    .from("school_fee_defaults")
    .select("installment_due_dates")
    .eq("is_active", true)
    .maybeSingle();

  if (defaultsError) throw new Error(defaultsError.message);
  
  // Fallback due dates from school rules
  const dueDatesStr = schoolDefaults?.installment_due_dates || ["20 April", "20 July", "20 October", "20 January"];

  // 1. Fetch Students
  const { data: students, error: stdErr } = await supabase
    .from("students")
    .select("id, class_id, transport_route_id, status")
    .eq("status", "active");
  if (stdErr) throw stdErr;

  // 2. Fetch Class Defaults
  const { data: classDefaults, error: clsErr } = await supabase
    .from("fee_settings")
    .select("id, class_id, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, late_fee_flat_amount, installment_count, transport_applies_default")
    .eq("is_active", true);
  if (clsErr) throw clsErr;

  // 3. Fetch Overrides
  const { data: overrides, error: ovrErr } = await supabase
    .from("student_fee_overrides")
    .select("*")
    .eq("is_active", true);
  if (ovrErr) throw ovrErr;

  const classDefMap = new Map();
  for (const c of classDefaults) {
    classDefMap.set(c.class_id, c);
  }

  const overridesMap = new Map();
  for (const o of overrides) {
    overridesMap.set(o.student_id, o);
  }

  const installmentsToInsert = [];

  for (const student of students) {
    const parentSetting = classDefMap.get(student.class_id);
    if (!parentSetting) continue;

    const override = overridesMap.get(student.id);

    const tuition = override?.custom_tuition_fee_amount ?? parentSetting.tuition_fee_amount;
    const books = override?.custom_books_fee_amount ?? parentSetting.books_fee_amount;
    const studentType = override?.student_type_override ?? parentSetting.student_type_default;
    
    let misc = 0;
    if (override?.custom_admission_activity_misc_fee_amount !== null && override?.custom_admission_activity_misc_fee_amount !== undefined) {
      misc = override.custom_admission_activity_misc_fee_amount;
    } else if (studentType === "new") {
      misc = parentSetting.admission_activity_misc_fee_amount;
    }    
    // other fee heads sum
    let otherAmount = 0;
    const otherObj = override?.custom_other_fee_heads ?? parentSetting.other_fee_heads;
    if (otherObj && typeof otherObj === "object") {
      otherAmount = Object.values(
        otherObj as Record<string, number | string | null>,
      ).reduce<number>((sum, val) => sum + Number(val ?? 0), 0);
    }

    const lateFee = override?.custom_late_fee_flat_amount ?? parentSetting.late_fee_flat_amount;
    const discount = override?.discount_amount ?? 0;
    const transportApplies = override?.transport_applies_override !== null ? override?.transport_applies_override : parentSetting.transport_applies_default;
    
    // Only apply transport fee if student uses transport and it defaults to true
    let transport = 0;
    if (student.transport_route_id && transportApplies) {
      transport = override?.custom_transport_fee_amount ?? parentSetting.transport_fee_amount;
    }
    
    const totalBase = tuition + books + misc + otherAmount;
    
    // Distribute totalBase and transport over installments
    // We assume an even split, remaining goes to first installment
    const count = parentSetting.installment_count;
    
    const basePerInstallment = Math.floor(totalBase / count);
    const transportPerInstallment = Math.floor(transport / count);
    const discountPerInstallment = Math.floor(discount / count);

    const baseRemainder = totalBase % count;
    const transportRemainder = transport % count;
    const discountRemainder = discount % count;

    for (let i = 1; i <= count; i++) {
        const isFirst = i === 1;
        const dueStr = dueDatesStr[i - 1] || dueDatesStr[dueDatesStr.length - 1]; // fallback if less dates than counts
        const dueDate = parseDateForSession(dueStr, startYear).toISOString().split('T')[0];

        installmentsToInsert.push({
            student_id: student.id,
            class_id: student.class_id,
            fee_setting_id: parentSetting.id,
            student_fee_override_id: override?.id || null,
            installment_no: i,
            installment_label: `Term ${i} (${dueStr})`,
            due_date: dueDate,
            base_amount: basePerInstallment + (isFirst ? baseRemainder : 0),
            transport_amount: transportPerInstallment + (isFirst ? transportRemainder : 0),
            discount_amount: discountPerInstallment + (isFirst ? discountRemainder : 0),
            late_fee_flat_amount: lateFee,
            status: "scheduled"
        });
    }
  }

  let generatedCount = 0;
  // Upsert in batches
  const batchSize = 100;
  for (let i = 0; i < installmentsToInsert.length; i += batchSize) {
    const batch = installmentsToInsert.slice(i, i + batchSize);
    
    const { data: upsertData, error: batchErr } = await supabase
        .from("installments")
        .upsert(batch, { onConflict: "student_id, class_id, installment_no", ignoreDuplicates: true })
        .select("id");
    
    if (batchErr) throw batchErr;
    if (upsertData) {
        generatedCount += upsertData.length;
    }
  }

  return { success: true, count: generatedCount };
}
