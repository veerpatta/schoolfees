# Components Map

Folder structure: see `docs/maps/folder-map.md`.
Keep this file focused on component folder responsibilities.

- `components/ui`: generic reusable primitives only.
- Module folders: `dashboard`, `payments`, `students`, `transactions`, `defaulters`,
  `receipts`, `reports`, `imports`, `fees`, `ledger`, `master-data`, `finance-controls`,
  `staff`, `whatsapp-templates`.
- Shared: `admin` (the workspace shell), `mobile-app` (phone primitives), `forms`,
  `data-table`, `shared`, `command`, `auth`, `branding`, `trust`, `quality`, `system`.

27 folders in total; `docs/maps/folder-map.md` has the full list. The module-aligned split
that earlier versions of this file called "planned" has happened — `exports` and
`admin-tools` were the two that never needed their own folder.

`office/` is what remains after that split: `office-ui.tsx` and `auto-submit-form.tsx`.
