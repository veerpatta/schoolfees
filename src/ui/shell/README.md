# Admin Components

Routes served across protected admin shells and admin-tool surfaces.

Paired domain libs include `lib/config`, `lib/auth`, `lib/system-sync`, and
shared Supabase session helpers.

Owns layout, navigation, status, readiness, session switch, and admin shell UI.

Keep role visibility and office copy aligned with `lib/config/navigation.ts`.
Do not expose service-role behavior in browser components.
