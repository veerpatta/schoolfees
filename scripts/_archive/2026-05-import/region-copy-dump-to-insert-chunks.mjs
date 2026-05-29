#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [inputFile, outputDir, rowsPerChunkArg = "250"] = process.argv.slice(2);

if (!inputFile || !outputDir) {
  console.error(
    "Usage: node scripts/region-copy-dump-to-insert-chunks.mjs <dump.sql> <output-dir> [rows-per-chunk]",
  );
  process.exit(2);
}

const rowsPerChunk = Number.parseInt(rowsPerChunkArg, 10);
if (!Number.isInteger(rowsPerChunk) || rowsPerChunk < 1) {
  console.error("rows-per-chunk must be a positive integer");
  process.exit(2);
}

fs.mkdirSync(outputDir, { recursive: true });

function quoteIdent(ident) {
  return `"${ident.replaceAll('"', '""')}"`;
}

function quoteQualifiedName(name) {
  return name.split(".").map(quoteIdent).join(".");
}

function splitCopyHeader(line) {
  const match = line.match(/^COPY\s+([^\s]+)\s+\((.*)\)\s+FROM\s+stdin;$/i);
  if (!match) return null;
  return {
    table: match[1],
    columns: match[2].split(",").map((part) => {
      const trimmed = part.trim();
      return trimmed.replace(/^"|"$/g, "").replaceAll('""', '"');
    }),
  };
}

function parseCopyTextRow(line) {
  const fields = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\t") {
      fields.push(current);
      current = "";
      continue;
    }
    if (ch === "\\") {
      const next = line[i + 1];
      if (next === undefined) {
        current += "\\";
      } else if (next === "N") {
        current += "\\N";
        i += 1;
      } else if (next === "b") {
        current += "\b";
        i += 1;
      } else if (next === "f") {
        current += "\f";
        i += 1;
      } else if (next === "n") {
        current += "\n";
        i += 1;
      } else if (next === "r") {
        current += "\r";
        i += 1;
      } else if (next === "t") {
        current += "\t";
        i += 1;
      } else if (next === "v") {
        current += "\v";
        i += 1;
      } else {
        current += next;
        i += 1;
      }
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function copyValueToSql(value) {
  if (value === "\\N") return "null";
  return `'${value.replaceAll("'", "''")}'`;
}

function writeChunk(state) {
  if (state.rows.length === 0) return;
  state.chunk += 1;
  const file = path.join(
    outputDir,
    `${String(state.fileIndex).padStart(3, "0")}-${state.safeTable}-${String(state.chunk).padStart(4, "0")}.sql`,
  );
  const columns = state.columns.map(quoteIdent).join(", ");
  const values = state.rows
    .map((row) => `(${row.map(copyValueToSql).join(", ")})`)
    .join(",\n");
  fs.writeFileSync(
    file,
    [
      "set session_replication_role = replica;",
      `insert into ${quoteQualifiedName(state.table)} (${columns}) values`,
      `${values};`,
      "set session_replication_role = origin;",
      "",
    ].join("\n"),
  );
  state.rows = [];
}

const text = fs.readFileSync(inputFile, "utf8");
const lines = text.split(/\r?\n/);
const summary = [];
let state = null;
let fileIndex = 0;

for (const line of lines) {
  const header = splitCopyHeader(line);
  if (header) {
    if (state) {
      throw new Error(`Nested COPY block before ${line}`);
    }
    fileIndex += 1;
    state = {
      ...header,
      fileIndex,
      safeTable: header.table.replace(/[^A-Za-z0-9_]+/g, "_"),
      chunk: 0,
      totalRows: 0,
      rows: [],
    };
    continue;
  }

  if (!state) continue;

  if (line === "\\.") {
    writeChunk(state);
    summary.push({
      table: state.table,
      rows: state.totalRows,
      chunks: state.chunk,
    });
    state = null;
    continue;
  }

  if (line === "") continue;
  const row = parseCopyTextRow(line);
  if (row.length !== state.columns.length) {
    throw new Error(
      `${state.table}: expected ${state.columns.length} columns, got ${row.length}`,
    );
  }
  state.rows.push(row);
  state.totalRows += 1;
  if (state.rows.length >= rowsPerChunk) {
    writeChunk(state);
  }
}

if (state) {
  throw new Error(`Unclosed COPY block for ${state.table}`);
}

console.log(JSON.stringify({ inputFile, outputDir, rowsPerChunk, summary }, null, 2));
