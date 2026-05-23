#!/usr/bin/env node
// Compare two Supabase Postgres projects table-by-table.
// Use case: verifying a region migration (Sydney -> Mumbai) before cutover.
//
// Usage:
//   node scripts/compare-supabase-projects.mjs \
//     --source "postgres://...sydney..." \
//     --target "postgres://...mumbai..."
//
// Or via env vars:
//   SOURCE_DB_URL=... TARGET_DB_URL=... node scripts/compare-supabase-projects.mjs
//
// Optional flags:
//   --schema public            Schema to compare (default: public)
//   --table <name>             Restrict to a single table (repeatable)
//   --exclude <name>           Skip a table (repeatable)
//   --skip-hash                Only compare row counts, skip content hashes
//   --json                     Emit machine-readable JSON instead of pretty
//
// Exit code: 0 if every table matches, 1 if any mismatch or error.

import postgres from "postgres";

function parseArgs(argv) {
  const args = {
    source: process.env.SOURCE_DB_URL ?? null,
    target: process.env.TARGET_DB_URL ?? null,
    schema: "public",
    tables: [],
    exclude: [],
    skipHash: false,
    json: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--source":
        args.source = value;
        i += 1;
        break;
      case "--target":
        args.target = value;
        i += 1;
        break;
      case "--schema":
        args.schema = value;
        i += 1;
        break;
      case "--table":
        args.tables.push(value);
        i += 1;
        break;
      case "--exclude":
        args.exclude.push(value);
        i += 1;
        break;
      case "--skip-hash":
        args.skipHash = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        printHelpAndExit();
        break;
      default:
        if (flag.startsWith("--")) {
          console.error(`Unknown flag: ${flag}`);
          process.exit(2);
        }
    }
  }

  if (!args.source || !args.target) {
    console.error("ERROR: --source and --target (or SOURCE_DB_URL / TARGET_DB_URL env vars) are required.");
    printHelpAndExit(2);
  }

  return args;
}

function printHelpAndExit(code = 0) {
  console.log(
    [
      "Compare two Postgres projects table-by-table.",
      "",
      "  --source <url>      Source DB connection string (or SOURCE_DB_URL env)",
      "  --target <url>      Target DB connection string (or TARGET_DB_URL env)",
      "  --schema <name>     Schema to compare (default: public)",
      "  --table <name>      Restrict to one table; repeatable",
      "  --exclude <name>    Skip a table; repeatable",
      "  --skip-hash         Row counts only, no content hash",
      "  --json              JSON output for scripting",
      "",
      "Exit code 0 if all tables match, 1 if any mismatch.",
    ].join("\n"),
  );
  process.exit(code);
}

async function listTables(sql, schema) {
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = ${schema}
      and table_type = 'BASE TABLE'
    order by table_name
  `;
  return rows.map((r) => r.table_name);
}

async function getPrimaryKeyColumns(sql, schema, table) {
  const rows = await sql`
    select a.attname as column_name
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = (${`${schema}.${table}`})::regclass
      and i.indisprimary
    order by array_position(i.indkey, a.attnum)
  `;
  return rows.map((r) => r.column_name);
}

async function countRows(sql, schema, table) {
  // Use sql.unsafe for the identifier; the schema/table came from
  // information_schema so they're trusted.
  const rows = await sql.unsafe(
    `select count(*)::bigint as n from "${schema}"."${table}"`,
  );
  return Number(rows[0].n);
}

async function hashTable(sql, schema, table, pkCols) {
  if (pkCols.length === 0) {
    // No primary key — fall back to count-only.
    return null;
  }

  // Hash strategy:
  //   1. For each row, build text(row) (Postgres' built-in cast of the
  //      composite to text — stable column ordering by catalog order).
  //   2. md5 each row's text representation.
  //   3. Sort the md5s (so insert order doesn't matter), concatenate, md5
  //      the result.
  //
  // Caveat: text(row) depends on column order in the catalog. Since both
  // databases were built from the same migration history, column order
  // matches. If you ever rebuild the target with reordered columns this
  // check will false-mismatch; use --skip-hash in that case.

  const ident = `"${schema}"."${table}"`;
  const result = await sql.unsafe(`
    select md5(string_agg(row_hash, '' order by row_hash)) as table_hash
    from (
      select md5(${ident}::text) as row_hash
      from ${ident}
    ) sub
  `);
  return result[0]?.table_hash ?? null;
}

async function inspect(sql, schema, table, opts) {
  const count = await countRows(sql, schema, table);
  let hash = null;
  if (!opts.skipHash) {
    const pk = await getPrimaryKeyColumns(sql, schema, table);
    if (pk.length > 0) {
      hash = await hashTable(sql, schema, table, pk);
    }
  }
  return { count, hash };
}

async function main() {
  const args = parseArgs(process.argv);

  const source = postgres(args.source, { prepare: false, max: 4 });
  const target = postgres(args.target, { prepare: false, max: 4 });

  let exitCode = 0;
  const results = [];

  try {
    const sourceTables = await listTables(source, args.schema);
    const targetTables = await listTables(target, args.schema);

    const allTables = Array.from(
      new Set([...sourceTables, ...targetTables]),
    ).sort();

    const filtered = allTables.filter((t) => {
      if (args.tables.length > 0 && !args.tables.includes(t)) return false;
      if (args.exclude.includes(t)) return false;
      return true;
    });

    for (const table of filtered) {
      const inSource = sourceTables.includes(table);
      const inTarget = targetTables.includes(table);

      if (!inSource || !inTarget) {
        results.push({
          table,
          status: "MISSING",
          inSource,
          inTarget,
        });
        exitCode = 1;
        continue;
      }

      try {
        const [s, t] = await Promise.all([
          inspect(source, args.schema, table, args),
          inspect(target, args.schema, table, args),
        ]);

        const countsMatch = s.count === t.count;
        const hashesMatch =
          args.skipHash || (s.hash != null && s.hash === t.hash);
        const status =
          countsMatch && hashesMatch ? "MATCH" : "MISMATCH";
        if (status !== "MATCH") exitCode = 1;

        results.push({
          table,
          status,
          sourceCount: s.count,
          targetCount: t.count,
          sourceHash: s.hash,
          targetHash: t.hash,
        });
      } catch (err) {
        results.push({
          table,
          status: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
        exitCode = 1;
      }
    }

    if (args.json) {
      console.log(JSON.stringify({ exitCode, results }, null, 2));
    } else {
      printPretty(results);
    }
  } finally {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  }

  process.exit(exitCode);
}

function printPretty(results) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `${pad("TABLE", 40)} ${pad("STATUS", 10)} ${pad("SOURCE", 12)} ${pad("TARGET", 12)} HASH`,
  );
  console.log("-".repeat(100));
  for (const r of results) {
    const tag = r.status;
    const left = pad(r.table, 40);
    const status = pad(tag, 10);
    if (r.status === "MISSING") {
      console.log(
        `${left} ${status} present: source=${r.inSource} target=${r.inTarget}`,
      );
      continue;
    }
    if (r.status === "ERROR") {
      console.log(`${left} ${status} ${r.error}`);
      continue;
    }
    const sc = pad(r.sourceCount ?? "-", 12);
    const tc = pad(r.targetCount ?? "-", 12);
    const hashCol =
      r.sourceHash && r.targetHash
        ? r.sourceHash === r.targetHash
          ? `match (${r.sourceHash.slice(0, 8)}...)`
          : `DIFFER src=${r.sourceHash.slice(0, 8)} tgt=${r.targetHash.slice(0, 8)}`
        : "skipped";
    console.log(`${left} ${status} ${sc} ${tc} ${hashCol}`);
  }

  const mismatches = results.filter((r) => r.status !== "MATCH").length;
  console.log("-".repeat(100));
  if (mismatches === 0) {
    console.log(`All ${results.length} tables MATCH.`);
  } else {
    console.log(
      `${mismatches} of ${results.length} tables need investigation. See above.`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
