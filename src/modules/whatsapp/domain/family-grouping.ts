import { shortClassLabel, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";

/**
 * One phone, one message.
 *
 * The audience is derived per STUDENT, because that is how the ledger stores
 * money and how the send log prevents duplicates. But a parent with three
 * children at the school was getting three messages, on one phone, within a few
 * seconds — three times the cost and, far worse, three times the nagging for one
 * family who owes one total.
 *
 * This groups the derived candidates by the number they would be sent to and
 * decides who speaks for the family. Everything else about the audience is
 * untouched: the ledger still decides who is eligible, per student, first.
 *
 * Pure and free of `server-only`. The screen shows the office how many messages
 * a run will actually cost before they press Send, which needs this arithmetic
 * in the browser.
 */

/** The subset of a candidate this file needs. Structural, so it stays pure. */
export type FamilyMemberInput = {
  studentId: string;
  studentName: string;
  studentClass: string;
  parentName: string;
  destination: string;
  dueAmount: number;
  /** From `student_collection_flags.whatsapp_language`; null follows the run. */
  preferredLanguage: NoticeLanguage | null;
  /** `sent` rows already logged for this family this session. */
  sentCount: number;
  /** The other parent's number, when one is on file and usable. */
  secondaryDestination: string | null;
};

export type FamilyMember = FamilyMemberInput & {
  /** True for the child the message is addressed to. */
  isSpokesperson: boolean;
};

export type ReminderFamily = {
  /** The number the message goes to. The grouping key. */
  destination: string;
  parentName: string;
  /** Highest amount first, so the spokesperson is the biggest debt. */
  members: FamilyMember[];
  /** The child whose name and figures fill the slots when there is no family template. */
  spokesperson: FamilyMember;
  /** Everyone else: logged as `covered_by_sibling`, never messaged separately. */
  covered: FamilyMember[];
  /** Every member's `dueAmount`, summed. What a family template would quote. */
  totalAmount: number;
  /** "Aaradhya (2), Bhavya (5)" — the family template's children line. */
  childrenLine: string;
  /** The language THIS family reads. */
  language: NoticeLanguage;
  /** Set when the family disagreed with the run default. */
  languageIsOverride: boolean;
  /** Which numbers this message goes to, and in what role. */
  destinations: FamilyDestination[];
};

export type FamilyDestination = {
  destination: string;
  role: "primary" | "secondary";
};

/**
 * After this many delivered notices with the family still on the list, try the
 * other parent as well.
 *
 * "With no payment" needs no separate check, and that is not an oversight. The
 * ledger is applied before anything else in `loadReminderAudience`, so a family
 * who paid is simply ABSENT from the list rather than present-and-filtered. A
 * family still here after two delivered notices has, by construction, not paid.
 */
export const ESCALATE_TO_SECOND_NUMBER_AFTER = 2;

/**
 * "Aaradhya (2), Bhavya (5)".
 *
 * The class is stripped of its `Class ` prefix exactly as slot {{3}} is, so the
 * children line reads the way the rest of the message does. A child whose class
 * label is empty appears by name alone rather than as "Aaradhya ()".
 */
export function childrenLine(members: ReadonlyArray<{ studentName: string; studentClass: string }>): string {
  return members
    .map((member) => {
      const className = shortClassLabel(member.studentClass);
      return className ? `${member.studentName} (${className})` : member.studentName;
    })
    .join(", ");
}

/**
 * Which language this family reads.
 *
 * The run's language is a DEFAULT, not a rule. A family who has told the office
 * they read English keeps English when the office sends a Hindi run, because the
 * preference is about them and the run setting is about the batch.
 *
 * Siblings share a phone and therefore share a message, so they cannot disagree.
 * When two rows carry different preferences the first non-null wins by amount
 * order — the largest debt is the one the office is most likely to have talked
 * to the family about.
 */
export function resolveFamilyLanguage(
  members: ReadonlyArray<{ preferredLanguage: NoticeLanguage | null }>,
  runDefault: NoticeLanguage,
): { language: NoticeLanguage; isOverride: boolean } {
  const stated = members.find((member) => member.preferredLanguage)?.preferredLanguage ?? null;
  if (!stated) return { language: runDefault, isOverride: false };
  return { language: stated, isOverride: stated !== runDefault };
}

/**
 * Which numbers to send this notice to.
 *
 * One, normally. Two once the family has had `ESCALATE_TO_SECOND_NUMBER_AFTER`
 * delivered notices and is still on the list — at which point the number we have
 * been using is demonstrably not the one that acts, and the other parent is
 * worth the second message.
 *
 * Never more than two, and the `destination_role` enum on the send log is what
 * enforces that in the database rather than here: a role has exactly two values,
 * so the unique index permits exactly two rows.
 */
export function chooseDestinations(args: {
  primary: string;
  secondary: string | null;
  sentCount: number;
  threshold?: number;
}): FamilyDestination[] {
  const threshold = args.threshold ?? ESCALATE_TO_SECOND_NUMBER_AFTER;
  const primary: FamilyDestination = { destination: args.primary, role: "primary" };

  // The same number in both fields is one number, not two. A family whose father
  // and mother rows carry the same digits must not be billed twice to reach it.
  const secondaryIsReal = Boolean(args.secondary) && args.secondary !== args.primary;
  if (!secondaryIsReal || args.sentCount < threshold) return [primary];

  return [primary, { destination: args.secondary as string, role: "secondary" }];
}

/**
 * Group candidates into families, one per destination.
 *
 * Order is preserved from the candidate list, which arrives sorted by amount, so
 * the families come back biggest-first and the spokesperson within each family is
 * its biggest debt. That matters for the fallback: when there is no approved
 * family template the message names ONE child, and it should be the one the
 * office would have led with.
 */
export function groupIntoFamilies(
  candidates: readonly FamilyMemberInput[],
  runLanguage: NoticeLanguage,
): ReminderFamily[] {
  const byDestination = new Map<string, FamilyMemberInput[]>();
  for (const candidate of candidates) {
    const existing = byDestination.get(candidate.destination);
    if (existing) existing.push(candidate);
    else byDestination.set(candidate.destination, [candidate]);
  }

  const families: ReminderFamily[] = [];
  for (const [destination, group] of byDestination) {
    const ordered = [...group].sort((left, right) => right.dueAmount - left.dueAmount);
    const members: FamilyMember[] = ordered.map((member, index) => ({
      ...member,
      isSpokesperson: index === 0,
    }));
    const spokesperson = members[0]!;
    const { language, isOverride } = resolveFamilyLanguage(members, runLanguage);

    families.push({
      destination,
      parentName: spokesperson.parentName,
      members,
      spokesperson,
      covered: members.slice(1),
      totalAmount: members.reduce((sum, member) => sum + member.dueAmount, 0),
      childrenLine: childrenLine(members),
      language,
      languageIsOverride: isOverride,
      // The whole family shares one escalation decision, from the child with the
      // longest history of being messaged — otherwise a sibling added this term
      // would reset the family's clock to zero.
      destinations: chooseDestinations({
        primary: destination,
        secondary:
          members.find((member) => member.secondaryDestination)?.secondaryDestination ?? null,
        sentCount: Math.max(...members.map((member) => member.sentCount)),
      }),
    });
  }

  return families;
}

/**
 * How many messages a run will actually cost, and how many children that covers.
 *
 * Shown before Send. The office used to read "171 families" and be billed for
 * 171 messages; with siblings grouped the two numbers differ, and the one that
 * costs money is the one worth showing.
 */
export function describeFamilyRun(families: readonly ReminderFamily[]): {
  messages: number;
  students: number;
  familiesWithSiblings: number;
  secondNumberSends: number;
} {
  let messages = 0;
  let students = 0;
  let familiesWithSiblings = 0;
  let secondNumberSends = 0;

  for (const family of families) {
    messages += family.destinations.length;
    students += family.members.length;
    if (family.members.length > 1) familiesWithSiblings += 1;
    secondNumberSends += family.destinations.filter((entry) => entry.role === "secondary").length;
  }

  return { messages, students, familiesWithSiblings, secondNumberSends };
}
