/**
 * Bring the School One development database to the current schema, with fake data.
 *
 *   node scripts/school-one/dev-db.mjs push    (npm run db:push:dev)
 *   node scripts/school-one/dev-db.mjs seed    (npm run db:seed:dev)
 *   node scripts/school-one/dev-db.mjs reset   (npm run db:reset:dev)
 *
 * The whole point of this file is the part that refuses. `supabase db push` is a
 * one-word command whose target is a hidden file (`supabase/.temp/project-ref`)
 * that nothing in the repository controls, so "which database am I about to
 * change" is a question the CLI answers silently and this script answers loudly.
 * Four independent checks have to agree before anything runs:
 *
 *   1. SUPABASE_DEV_PROJECT_REF is set at all.
 *   2. It is not equal to PRODUCTION_SUPABASE_PROJECT_REF.
 *   3. It is not the literal production ref. This duplicates check 2 on purpose:
 *      check 2 fails open if somebody's .env.local is missing the production
 *      variable, and a guard that can be disabled by deleting a line is not a
 *      guard. The literal is the backstop.
 *   4. The CLI's existing link, if there is one, already points at the dev ref.
 *      A link to anything else is a refusal, not something to silently re-point.
 *
 * The runtime guard in src/platform/db-target.ts (P0.3) is the same rule for the
 * application. This one covers the CLI, which the application never sees.
 *
 * Docker is not required: every command here targets the remote dev project.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";

/**
 * Hard-coded on purpose — see check 3 above. If this repository is ever forked
 * for another school, this constant and PRODUCTION_SUPABASE_PROJECT_REF are the
 * two places that know which project must never be developed against.
 */
const PRODUCTION_REF_LITERAL = "vgqyilgstjvgohrsiwkb";

const LINKED_REF_FILE = "supabase/.temp/project-ref";

/**
 * Migrations that cannot run anywhere except the production database they were
 * written against, and are recorded as applied on dev instead of executed.
 *
 * This list is deliberately short, deliberately explicit, and deliberately
 * printed on every run. "Skip a migration" is a dangerous sentence, so each
 * entry has to say why the skip is a no-op rather than a loss, and name the
 * migration that replays whatever the skipped one would otherwise have done.
 *
 * Nothing goes in here to make an error go away. A migration that fails because
 * the schema is wrong is a bug to fix, not an entry to add.
 */
const UNREPLAYABLE_MIGRATIONS = [
  {
    version: "20260727113603",
    why:
      "One-off repair of the May 24 allocation drift, guarded on production's exact\n" +
      "     12 anomalies in 6 receipt pairs — correct of it, and impossible on an empty\n" +
      "     database. Its permission hardening replays in 20260727113700.",
  },
];

/** Same loader shape as scripts/repair-discount-drift.mjs: a real environment
 *  variable always wins over the file, which is what makes the refusal testable
 *  (`SUPABASE_DEV_PROJECT_REF=<prod> npm run db:push:dev` must exit non-zero). */
function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function fail(message) {
  console.error(`\n  ✖  ${message}\n`);
  process.exit(1);
}

/** Never interpolated into a log line, an error message, or a command line. */
function devPassword() {
  return process.env.SUPABASE_DEV_DB_PASSWORD?.trim() ?? "";
}

function readLinkedRef() {
  if (!existsSync(LINKED_REF_FILE)) {
    return null;
  }
  const value = readFileSync(LINKED_REF_FILE, "utf8").trim();
  return value ? value : null;
}

/**
 * The four checks. Returns the dev ref, or exits non-zero having changed
 * nothing. Called before every command, including `seed`, because `seed` runs
 * `db push` too and a seed file aimed at the wrong database is the worst of the
 * three (04 carries its own tripwire, but that is the last line, not the first).
 */
function resolveDevRef() {
  const devRef = process.env.SUPABASE_DEV_PROJECT_REF?.trim();
  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (!devRef) {
    fail(
      "SUPABASE_DEV_PROJECT_REF is not set.\n\n" +
        "     Set it in .env.local to the ref of the schoolfees-dev project.\n" +
        "     Without it this script has no way to tell dev from production, so it stops.",
    );
  }

  if (productionRef && devRef === productionRef) {
    fail(
      `SUPABASE_DEV_PROJECT_REF is the PRODUCTION project (${devRef}).\n\n` +
        "     Refusing to run. Development never targets the live school database.\n" +
        "     Fix SUPABASE_DEV_PROJECT_REF in .env.local.",
    );
  }

  if (devRef === PRODUCTION_REF_LITERAL) {
    fail(
      `SUPABASE_DEV_PROJECT_REF is the PRODUCTION project (${devRef}).\n\n` +
        "     Refusing to run. This check is hard-coded and does not depend on\n" +
        "     PRODUCTION_SUPABASE_PROJECT_REF being present.",
    );
  }

  const linkedRef = readLinkedRef();

  if (linkedRef && linkedRef !== devRef) {
    fail(
      `The Supabase CLI is linked to ${linkedRef}, not the dev project ${devRef}.\n\n` +
        "     Refusing to re-point it silently — if that ref is production, a push\n" +
        "     would have run against the live school database.\n\n" +
        `     If the link is wrong, delete ${LINKED_REF_FILE} and run this again;\n` +
        "     push re-links to the dev project from scratch.",
    );
  }

  return devRef;
}

/**
 * The repo pins the CLI as a devDependency, so use that binary rather than
 * whatever `npx` resolves — a global CLI on a different version is exactly the
 * kind of difference that makes "it worked on my machine" a migration incident.
 *
 * The password goes in the child's environment as SUPABASE_DB_PASSWORD (which
 * the CLI reads natively), never as an argument: arguments are visible in the
 * process list and in any shell history that echoes the command.
 */
function runSupabase(args, { password, tolerateFailure = false } = {}) {
  const isWindows = process.platform === "win32";
  const bin = isWindows ? "node_modules\\.bin\\supabase.cmd" : "node_modules/.bin/supabase";

  console.log(`\n  →  supabase ${args.join(" ")}\n`);

  const result = spawnSync(bin, args, {
    stdio: "inherit",
    shell: isWindows,
    env: password ? { ...process.env, SUPABASE_DB_PASSWORD: password } : process.env,
  });

  if (result.error) {
    fail(`Could not run the Supabase CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (tolerateFailure) {
      console.log(`\n  ·  (continuing: that step exited ${result.status})\n`);
      return false;
    }
    fail(`supabase ${args[0]} ${args[1] ?? ""} exited with code ${result.status}.`);
  }

  return true;
}

/**
 * Record the unreplayable migrations as applied before pushing, so the push runs
 * straight through instead of stopping on one and needing a human.
 *
 * Tolerates failure: on a brand-new project the migration history table does not
 * exist until the first push, and a repair against it is then meaningless rather
 * than wrong. The push that follows says plainly if anything is still stuck.
 */
function recordUnreplayableMigrations(password) {
  if (UNREPLAYABLE_MIGRATIONS.length === 0) {
    return;
  }

  console.log("  Recording migrations that cannot replay on an empty database:\n");

  for (const { version, why } of UNREPLAYABLE_MIGRATIONS) {
    console.log(`     ${version} — ${why}\n`);
    runSupabase(["migration", "repair", "--status", "applied", "--linked", version], {
      password,
      tolerateFailure: true,
    });
  }
}

function linkToDev(devRef) {
  if (readLinkedRef() === devRef) {
    return;
  }

  const password = devPassword();

  if (!password) {
    fail(
      "SUPABASE_DEV_DB_PASSWORD is not set and the CLI is not linked yet.\n\n" +
        "     Set it in .env.local (the dev project's database password), or run\n" +
        `     npx supabase link --project-ref ${devRef} by hand and type the password there.`,
    );
  }

  runSupabase(["link", "--project-ref", devRef], { password });
}

async function confirmReset(devRef) {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(
    `\n  ⚠  db:reset:dev DROPS EVERY TABLE on ${devRef} and replays all migrations.\n`,
  );

  const answer = await rl.question(`     Type the dev project ref to confirm: `);
  rl.close();

  if (answer.trim() !== devRef) {
    fail("Confirmation did not match. Nothing was changed.");
  }
}

/**
 * The five smoke logins (one per role) come from the existing bootstrap script,
 * not from SQL. Logins live in `auth.users` and are created through the Auth
 * Admin API — a seed file cannot forge one without hand-writing rows that the
 * auth trigger expects to write itself. So the admin user for dev is the same
 * mechanism the repo already has, pointed at the dev project by .env.local.
 *
 * Skipped with a clear message rather than failing, because a schema-and-data
 * seed is still useful without logins and TEST_STAFF_PASSWORD is deliberately
 * not stored in the repo.
 */
function bootstrapDevStaff(devRef) {
  if (!process.env.TEST_STAFF_PASSWORD?.trim()) {
    console.log(
      "\n  ·  Skipping staff logins: TEST_STAFF_PASSWORD is not set.\n" +
        "     Set it and run `node scripts/bootstrap-test-staff.mjs` to create the\n" +
        "     five role logins (qa.admin@qa.vpps.local and friends) on this project.\n",
    );
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  if (!url.includes(devRef)) {
    console.log(
      "\n  ·  Skipping staff logins: NEXT_PUBLIC_SUPABASE_URL does not point at the\n" +
        `     dev project (${devRef}). The bootstrap script writes through that URL,\n` +
        "     so it is not run until the two agree.\n",
    );
    return;
  }

  console.log("\n  →  node scripts/bootstrap-test-staff.mjs\n");

  const result = spawnSync(process.execPath, ["scripts/bootstrap-test-staff.mjs"], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`bootstrap-test-staff.mjs exited with code ${result.status}.`);
  }
}

async function main() {
  const command = process.argv[2];

  if (!command || !["push", "seed", "reset"].includes(command)) {
    console.error(
      "\n  Usage: node scripts/school-one/dev-db.mjs <push|seed|reset>\n\n" +
        "    push   apply all migrations to the dev project (no seed data)\n" +
        "    seed   apply migrations and run the seed files from config.toml\n" +
        "    reset  DROP everything on dev and replay migrations + seeds\n",
    );
    process.exit(1);
  }

  const devRef = resolveDevRef();

  console.log(`\n  Development database: ${devRef}\n`);

  if (command === "push") {
    linkToDev(devRef);
    recordUnreplayableMigrations(devPassword());
    // --include-all, which the production release command in BUILD-PLAN §8
    // deliberately does NOT use. `db push` otherwise skips any migration whose
    // timestamp precedes the last one already applied, and refuses the run:
    //
    //   Found local migration files to be inserted before the last migration
    //   on remote database.
    //
    // A backfill migration is exactly that shape — 20260612023100 repairs a gap
    // discovered years of commits later — and dev is supposed to hold every
    // migration in the repository, in timestamp order, with nothing skipped.
    // Production is a different question and stays a human decision.
    runSupabase(["db", "push", "--linked", "--include-all", "--yes"], {
      password: devPassword(),
    });
    console.log("\n  ✓  Migrations applied. Run `npm run db:seed:dev` for fake data.\n");
    return;
  }

  if (command === "seed") {
    linkToDev(devRef);
    recordUnreplayableMigrations(devPassword());
    // --include-seed is the only seeding path: this CLI has no `db query` and
    // psql is not installed. The files it runs come from [db.seed].sql_paths in
    // supabase/config.toml, which deliberately lists 01, 02 and 04 — never 03,
    // which is a deletion script (decisions.md D-22).
    runSupabase(["db", "push", "--linked", "--include-all", "--include-seed", "--yes"], {
      password: devPassword(),
    });
    bootstrapDevStaff(devRef);
    console.log("\n  ✓  Seeded. Re-running this command changes nothing.\n");
    return;
  }

  await confirmReset(devRef);
  linkToDev(devRef);
  runSupabase(["db", "reset", "--linked"], { password: devPassword() });
  bootstrapDevStaff(devRef);
  console.log("\n  ✓  Dev project reset and re-seeded.\n");
}

await main();
