/**
 * What the scan looked at — and, more usefully, what it did not.
 *
 * `tests/deep` opens its report with the coverage ledger before any finding,
 * on the grounds that a short findings list is ambiguous: it can mean the app
 * is healthy or it can mean almost nothing ran. A static scan has exactly the
 * same failure mode, and a worse version of it — a check that silently threw
 * on file 40 of 1,126 still produces a confident-looking report.
 *
 * So every check declares the population it swept and how many members it
 * actually reached, a check that throws is recorded as `errored` rather than
 * omitted, and the report prints the difference.
 */

export class ScanCoverage {
  constructor() {
    this.entries = [];
  }

  /**
   * @param {object} entry
   * @param {string} entry.check      check id, e.g. "guards"
   * @param {string} entry.dimension  what was enumerated, e.g. "app route handlers"
   * @param {number} entry.domainSize how many exist
   * @param {number} entry.examined   how many the check actually read
   * @param {string} [entry.strategy] exhaustive | targeted | sampled
   * @param {string} [entry.note]     what it cannot see, stated plainly
   */
  declare(entry) {
    this.entries.push({
      strategy: "exhaustive",
      skipped: [],
      ...entry,
      gap: entry.domainSize - entry.examined,
    });
  }

  errored(check, error) {
    this.entries.push({
      check,
      dimension: "(the check threw)",
      domainSize: 0,
      examined: 0,
      strategy: "errored",
      gap: 0,
      note: String(error?.stack ?? error).slice(0, 500),
      errored: true,
    });
  }

  /** True when any declared-exhaustive dimension left members unexamined. */
  hasGaps() {
    return this.entries.some((entry) => entry.strategy === "exhaustive" && entry.gap > 0);
  }

  hasErrors() {
    return this.entries.some((entry) => entry.errored);
  }

  statement() {
    const total = this.entries.reduce((sum, entry) => sum + entry.domainSize, 0);
    const seen = this.entries.reduce((sum, entry) => sum + entry.examined, 0);
    const errored = this.entries.filter((entry) => entry.errored).length;
    const lines = [
      `${this.entries.filter((entry) => !entry.errored).length} check(s) swept ${seen} of ${total} enumerated members.`,
    ];
    if (errored > 0) {
      lines.push(
        `**${errored} check(s) threw and contributed nothing.** Their part of the app is unscanned, `
          + `not clean — see the table below.`,
      );
    }
    return lines.join(" ");
  }

  toJSON() {
    return { entries: this.entries, statement: this.statement() };
  }
}
