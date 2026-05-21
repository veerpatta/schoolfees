import { createHash } from "node:crypto";

export type SiblingDetectionRow = {
  studentId: string;
  sessionLabel: string;
  phone: string | null;
  fatherName: string | null;
  existingFamilyGroupId: string | null;
};

export type DetectedSiblingGroup = {
  groupKey: string;
  sessionLabel: string;
  studentIds: string[];
  studentCount: number;
  phoneMatch: string[];
  fatherNameMatch: boolean;
  confidence: "confirmed" | "suspected";
  existingFamilyGroupId: string | null;
};

const PLACEHOLDER_PHONES = new Set(["0000000000", "9999999999", "1234567890"]);

export function normalizeSiblingPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");

  if (digits.length !== 10) {
    return null;
  }

  if (PLACEHOLDER_PHONES.has(digits)) {
    return null;
  }

  if (/^(\d)\1{9}$/.test(digits) || /(\d)\1{6,}/.test(digits)) {
    return null;
  }

  return digits;
}

export function normalizeSiblingFatherName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSiblingGroupKey(studentIds: readonly string[]) {
  return createHash("md5").update([...studentIds].sort().join("|")).digest("hex");
}

/** Detects phone-linked sibling groups using the same conservative rules as the database view. */
export function detectSiblingGroupsFromRows(
  rows: readonly SiblingDetectionRow[],
): DetectedSiblingGroup[] {
  const buckets = new Map<string, SiblingDetectionRow[]>();

  rows.forEach((row) => {
    const normalizedPhone = normalizeSiblingPhone(row.phone);

    if (!normalizedPhone) {
      return;
    }

    const key = `${row.sessionLabel}|${normalizedPhone}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  });

  return [...buckets.entries()]
    .flatMap(([key, bucket]) => {
      const [, phone] = key.split("|");
      const studentIds = [...new Set(bucket.map((row) => row.studentId))].sort();

      if (studentIds.length < 2) {
        return [];
      }

      const familyGroupIds = [
        ...new Set(bucket.map((row) => row.existingFamilyGroupId).filter((value): value is string => Boolean(value))),
      ];
      const fatherNames = [
        ...new Set(
          bucket
            .map((row) => normalizeSiblingFatherName(row.fatherName))
            .filter((value) => value.length > 0),
        ),
      ];

      return [
        {
          groupKey: buildSiblingGroupKey(studentIds),
          sessionLabel: bucket[0]?.sessionLabel ?? "",
          studentIds,
          studentCount: studentIds.length,
          phoneMatch: [phone ?? ""].filter(Boolean),
          fatherNameMatch: fatherNames.length === 1,
          confidence: familyGroupIds.length === 1 ? "confirmed" : "suspected",
          existingFamilyGroupId: familyGroupIds.length === 1 ? familyGroupIds[0] : null,
        } satisfies DetectedSiblingGroup,
      ];
    })
    .sort((left, right) => {
      if (left.confidence !== right.confidence) {
        return left.confidence === "confirmed" ? -1 : 1;
      }

      return left.phoneMatch.join(",").localeCompare(right.phoneMatch.join(","));
    });
}
