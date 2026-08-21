# Folder map

**Superseded by [`repo-map.md`](repo-map.md), which is generated from the tree
and gated in CI.**

This file used to hold a hand-written inventory of every folder. So did
`module-map.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `lib/README.md`,
`components/README.md` and `tests/README.md` — eight copies of one list. By the
time anybody checked, this one claimed 41 `lib/` domains where there were 46,
and 27 component folders where there were 28 plus six loose files; two of the
others gave different test counts.

Nobody was careless. A count written by hand is wrong the next time somebody
adds a folder, and nothing tells them. So the structure is generated now, and
the prose about *why* it is shaped that way lives where a reader is already
standing:

| Question | Where it is answered |
|---|---|
| What is in the repo, and how big | [`repo-map.md`](repo-map.md) — generated, `npm run docs:map` |
| What does this feature own, and what must never happen in it | `src/modules/<name>/README.md` |
| Which module is which | `src/modules/README.md` |
| What may import what | `src/platform/README.md`, `src/ui/README.md`, and `npm run quality:architecture` |
| Which code is dangerous to touch | [`danger-zones.md`](danger-zones.md) |
| Which old routes still redirect | [`legacy-routes.md`](legacy-routes.md) |
| What the database looks like | [`database-map.md`](database-map.md) |
