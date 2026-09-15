# docs/school-one — index

School One is the evolution of this fee application into one mobile-friendly school platform (staff, academics, timetable, attendance, collection, assessments, notes, reports). The fee module is finished and is a dependency, not a workspace.

| File | Read when |
|---|---|
| `CLAUDE-addendum.md` | **First**, before any School One task. Hard rules, environment matrix, module README template. |
| `BUILD-PLAN.md` | The master plan: locked decisions, assumptions register, data model, roles/permissions, phases with acceptance criteria, safety rails, release procedure. |
| `SETUP-RUNBOOK.md` | Janmejay's one-time setup steps (accounts, secrets, env scoping). Status of what is done. |
| `decisions.md` | Editable defaults (D-1…D-19). Change here, not in code comments. |
| `prompts/KICKOFF.md` | The first Claude Code prompt of the project. |
| `prompts/phase-0.md` | Phase 0 prompt pack (safety rails, backups, job platform, feature flags). |
| `prompts/phase-N.md` | Later packs, written one phase at a time after the previous phase's exit checklist. |
| `RELEASES.md` | Every production release: date, migrations, flags flipped, rollback note. |
| `fixtures/` | Structural fixtures only (timetable CSV, header rows). **No personal data, ever.** |
| `inventory-phase-0.md` | Output of prompt P0.0 (read-only repo inventory). |
| `dev-environment.md` | Output of prompt P0.2 (how to run local/dev). |

Production project ref: `vgqyilgstjvgohrsiwkb` (never a development target). Dev project ref: `wtgxcptmucjerhufzjcf`.
