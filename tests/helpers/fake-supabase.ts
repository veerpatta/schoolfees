/**
 * A small in-memory stand-in for the supabase-js query builder.
 *
 * Enough of the surface to exercise multi-step server actions end to end —
 * chained filters, insert/upsert/update/delete, `.select()` after a write,
 * `.single()` / `.maybeSingle()` — without a database. Tests that need to
 * assert on ROWS (which family a student ended up in, whether a discount row
 * was deactivated) get to do so; a call-shape mock cannot.
 *
 * Not a Postgres emulator: no joins beyond the embedded-record shape the
 * callers already hand-roll, no RLS, no triggers.
 */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

type Filter = (row: FakeRow) => boolean;
type Operation = "select" | "insert" | "upsert" | "update" | "delete";

type Result<T> = { data: T; error: { message: string } | null };

export type FakeSupabase = {
  from: (table: string) => FakeQuery;
  tables: FakeTables;
};

class FakeQuery implements PromiseLike<Result<FakeRow[] | null>> {
  private operation: Operation | null = null;
  private readonly filters: Filter[] = [];
  private payload: FakeRow[] = [];
  private updates: FakeRow = {};
  private selectRequested = false;
  private rowLimit: number | null = null;
  private onConflictKeys: string[] = [];
  private ignoreDuplicates = false;

  constructor(
    private readonly tables: FakeTables,
    private readonly table: string,
  ) {}

  private get rows() {
    if (!this.tables[this.table]) {
      this.tables[this.table] = [];
    }
    return this.tables[this.table];
  }

  private matching() {
    return this.rows.filter((row) => this.filters.every((filter) => filter(row)));
  }

  select(columns?: string) {
    // Column projection is ignored on purpose: callers assert on values, and
    // every fake row already carries the full shape.
    void columns;
    this.selectRequested = true;
    if (!this.operation) this.operation = "select";
    return this;
  }

  insert(values: FakeRow | FakeRow[]) {
    this.operation = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: FakeRow | FakeRow[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ) {
    this.operation = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.onConflictKeys = (options.onConflict ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates);
    return this;
  }

  update(values: FakeRow) {
    this.operation = "update";
    this.updates = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[column]));
    return this;
  }

  overlaps(column: string, values: readonly unknown[]) {
    const wanted = new Set(values);
    this.filters.push((row) => {
      const cell = row[column];
      return Array.isArray(cell) && cell.some((entry) => wanted.has(entry));
    });
    return this;
  }

  order(column: string, options?: Record<string, unknown>) {
    // Ordering is a no-op; assertions sort explicitly where order matters.
    void column;
    void options;
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  private run(): Result<FakeRow[] | null> {
    switch (this.operation) {
      case "insert": {
        const inserted = this.payload.map((row) => ({ ...row }));
        this.rows.push(...inserted);
        return { data: this.selectRequested ? inserted : null, error: null };
      }
      case "upsert": {
        const written: FakeRow[] = [];
        for (const candidate of this.payload) {
          const existing = this.rows.find((row) =>
            this.onConflictKeys.every((key) => row[key] === candidate[key]),
          );
          if (existing && this.onConflictKeys.length > 0) {
            if (this.ignoreDuplicates) continue;
            Object.assign(existing, candidate);
            written.push(existing);
            continue;
          }
          const inserted = { ...candidate };
          this.rows.push(inserted);
          written.push(inserted);
        }
        return { data: this.selectRequested ? written : null, error: null };
      }
      case "update": {
        const touched = this.matching();
        for (const row of touched) Object.assign(row, this.updates);
        return { data: this.selectRequested ? touched.map((row) => ({ ...row })) : null, error: null };
      }
      case "delete": {
        const doomed = new Set(this.matching());
        this.tables[this.table] = this.rows.filter((row) => !doomed.has(row));
        return { data: this.selectRequested ? [...doomed] : null, error: null };
      }
      default: {
        const found = this.matching().map((row) => ({ ...row }));
        return { data: this.rowLimit === null ? found : found.slice(0, this.rowLimit), error: null };
      }
    }
  }

  async single(): Promise<Result<FakeRow | null>> {
    const { data, error } = this.run();
    const rows = data ?? [];
    if (rows.length !== 1) {
      return { data: null, error: { message: `expected exactly one row, got ${rows.length}` } };
    }
    return { data: rows[0], error };
  }

  async maybeSingle(): Promise<Result<FakeRow | null>> {
    const { data, error } = this.run();
    const rows = data ?? [];
    if (rows.length > 1) {
      return { data: null, error: { message: `expected at most one row, got ${rows.length}` } };
    }
    return { data: rows[0] ?? null, error };
  }

  then<TResult1 = Result<FakeRow[] | null>, TResult2 = never>(
    onFulfilled?: ((value: Result<FakeRow[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

export function createFakeSupabase(seed: FakeTables = {}): FakeSupabase {
  const tables: FakeTables = {};
  for (const [table, rows] of Object.entries(seed)) {
    tables[table] = rows.map((row) => ({ ...row }));
  }

  return {
    tables,
    from: (table: string) => new FakeQuery(tables, table),
  };
}
