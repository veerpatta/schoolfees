# system-sync

Cache invalidation and financial revalidation. Small, and every money path depends on it.

| | |
|---|---|
| Route | — |
| Files | 5 domain · 3 data |

## Owns

- Revalidating paths and cache tags after a write
- Draining the materialized-view refresh queue
- Session health checks

## Invariants

- `revalidateSessionFinance` busts the `session:{label}` tag the dashboard reads. A write that moves money and skips this serves stale figures until something else happens to clear them.

## Never

- Assume `revalidatePath` is enough. It does not evict an `unstable_cache` entry.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
