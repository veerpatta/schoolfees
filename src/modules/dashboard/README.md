# dashboard

Five read-only boards over one money band. Analytics, never a write.

| | |
|---|---|
| Route | `/protected/dashboard?view=overview\|collection\|recovery\|classes\|latefee` |
| Files | 7 domain · 3 data · 15 ui |

## Owns

- The five boards and the money band above them
- The shell's "Day so far" pulse
- Anomaly rules over recent payments

## Invariants

- Boards are **links, not client tab state** — a board has to stay linkable and back-navigable.
- **No charting library.** The route sits under a gzip ceiling in `quality/route-bundle-baseline.json`; every chart is hand-rolled SVG on `--chart-1…5`.
- `get_dashboard_summary` and `get_dashboard_analytics` are cached on the `session:{label}` tag. Anything that moves money must bust it — refunds did not, and served stale numbers until the next posting happened to clear it.

## Never

- Post, adjust or repair anything from here. It reads.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
