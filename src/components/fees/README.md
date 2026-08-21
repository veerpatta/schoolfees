# Fee Components

Route served: `/protected/fee-setup`.

Paired domain libs: `lib/setup` and `lib/fees`.

Fee Setup is the canonical live policy/default editing path. Session selection
targets draft/review work until an explicit publish/apply action.

Preserve preview-first behavior, paid-row protection, and clear office copy.

Key files:

- `fee-setup-client.tsx`
- `generate-ledger-client.tsx`

Common checks live in fee-rule, setup-copy, and finance sync tests.
