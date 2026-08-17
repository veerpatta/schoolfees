/**
 * Who counts as a student — the question this server used to get wrong.
 *
 * The school has TWO rules, and they are deliberately different. From
 * 20260808210000_left_students_with_payments_stay_collectable.sql, in the head's
 * words: a student marked left who never paid has their dues cancelled, so
 * nothing is expected and nothing is chased. But a student who HAD paid and then
 * left still owes the rest, and that money must still be collected.
 *
 *   money      -> record_status = 'active' OR total_paid > 0
 *   headcount  -> record_status = 'active'
 *
 * The same migration is explicit about not merging them: "A student who has left
 * is not on the roll, however much they owe. Headcount and money are different
 * questions and conflating them is what this whole session has been unpicking."
 *
 * The previous server had one boolean, `onlyActive`, defaulting to active-only.
 * Money tools therefore under-reported real debt, two tools passed `false` and
 * counted leavers who owe nothing, and the same session produced different
 * totals depending on which tool you asked. Hence: no boolean, no default. Every
 * read names a scope, and every payload says which one it used.
 *
 * Mirrors lib/workbook/data.ts:680, lib/defaulters/data.ts:133 and
 * lib/recovery/types.ts:11.
 */

export const SCOPE_NAMES = ["on_roll", "collectable", "left_owing", "everyone"];

export const STUDENT_SCOPES = {
  on_roll: {
    name: "on_roll",
    rule: "record_status = 'active'",
    use: "Headcount, class lists, roster questions. How many children the school teaches.",
    predicate: { record_status: "eq.active" },
  },
  collectable: {
    name: "collectable",
    rule: "record_status = 'active' OR total_paid > 0",
    use: "Every money figure: expected, collected, pending, defaulters, follow-up. A student who left owing money still owes it.",
    predicate: { or: "(record_status.eq.active,total_paid.gt.0)" },
  },
  left_owing: {
    name: "left_owing",
    rule: "record_status <> 'active' AND outstanding_amount > 0",
    use: "Recovery from students who have left, graduated or gone inactive. The non-active complement to the defaulter queue.",
    predicate: { record_status: "neq.active", outstanding_amount: "gt.0" },
  },
  everyone: {
    name: "everyone",
    rule: "no status filter",
    use: "Audit and data quality only. Never use this for a money headline — it counts leavers whose dues were cancelled.",
    predicate: {},
  },
};

/**
 * Resolves a scope by name and refuses anything unnamed. A tool that forgets to
 * pass one fails loudly here rather than silently inheriting active-only, which
 * is exactly how the original bug survived.
 */
export function resolveScope(name) {
  const scope = STUDENT_SCOPES[name];
  if (!scope) {
    throw new Error(
      `Unknown student scope "${name}". Every read must name one of: ${SCOPE_NAMES.join(", ")}.`,
    );
  }
  return scope;
}

/** PostgREST params for a scope, ready to spread into a select. */
export function scopeParams(name) {
  return { ...resolveScope(name).predicate };
}

/**
 * The block every scoped payload carries. Two tools that disagree then explain
 * themselves instead of looking like a bug — which is what an AI reading two
 * responses needs in order not to contradict itself.
 */
export function describeScope(name, rows) {
  const scope = resolveScope(name);
  const block = { name: scope.name, rule: scope.rule, why: scope.use };

  if (!Array.isArray(rows)) return block;

  let onRoll = 0;
  let notOnRoll = 0;
  for (const row of rows) {
    if (row?.record_status === "active") onRoll += 1;
    else notOnRoll += 1;
  }

  const described = { ...block, counted: rows.length, onRoll, includedNotOnRoll: notOnRoll };

  // `counted` is the first number in this block and reads like a headcount. Under
  // `everyone` it is not one: on the live session it is 535 against a true roll of
  // 507, and that difference is how "535 active students" got quoted back at the
  // school. `describeScopeCount` below hard-refuses any scope but `on_roll` for
  // exactly this reason; the guard belonged on this path too.
  if (name === "everyone" && notOnRoll > 0) {
    described.warning = `Audit scope. counted (${rows.length}) is NOT a headcount — it includes ${notOnRoll} student(s) who are not on the roll. The headcount is ${onRoll}.`;
  }

  return described;
}

/**
 * The same block as describeScope, built from a count instead of the rows.
 *
 * Only valid where the scope makes every row homogeneous: `on_roll` is active by
 * definition, so onRoll === counted and nothing not-on-roll can be inside it.
 * That lets a headcount be a COUNT query rather than a full read whose only use
 * was `.length`.
 */
export function describeScopeCount(name, count) {
  const scope = resolveScope(name);
  if (name !== "on_roll") {
    throw new Error(
      `describeScopeCount is only safe for a homogeneous scope; "${name}" mixes populations, so describe it from its rows.`,
    );
  }
  return {
    name: scope.name,
    rule: scope.rule,
    why: scope.use,
    counted: count,
    onRoll: count,
    includedNotOnRoll: 0,
  };
}

/**
 * Applied client-side where a scope has to be enforced over rows already
 * fetched for another reason (a session-wide read reused by several tools).
 * Kept in lockstep with the predicates above.
 */
export function rowInScope(row, name) {
  const status = row?.record_status;
  const paid = Number(row?.total_paid || 0);
  const outstanding = Number(row?.outstanding_amount || 0);

  switch (resolveScope(name).name) {
    case "on_roll":
      return status === "active";
    case "collectable":
      return status === "active" || paid > 0;
    case "left_owing":
      return status !== "active" && outstanding > 0;
    case "everyone":
      return true;
    default:
      return false;
  }
}

/** Enrollment status is an enum; these are the human labels for it. */
export const ENROLLMENT_LABELS = {
  active: "On roll",
  inactive: "Inactive",
  left: "Left",
  graduated: "Graduated",
};

/**
 * Why the same session reports two different totals. Attached wherever one
 * payload carries blocks built under different scopes, so the difference reads
 * as arithmetic rather than as an error.
 */
export function reconciliation(entries) {
  return {
    note: "Blocks below were built under different student scopes on purpose. Headcount is on-roll students; money includes students who left owing. A difference between them is expected, not a discrepancy.",
    blocks: entries,
  };
}
