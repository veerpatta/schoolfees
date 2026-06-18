# Readiness Smoke

Use this smoke check when preparing the VPPS office app for daily staff use.
It is intentionally read-only by default and targets `TEST-2026-27`.

## Command

```powershell
npm run smoke:readiness
```

By default, Playwright artifacts are written outside the repo:

```text
%TEMP%\schoolfees-readiness-smoke
```

Each test attaches a compact Markdown report with the checked route, final URL,
HTTP status, page identity result, console/server error counts, and safe
interaction count.

## Authentication

The command expects an already signed-in staff browser state. Provide it with:

```powershell
$env:SCHOOLFEES_READINESS_STORAGE_STATE="path\to\admin.json"
npm run smoke:readiness
```

If no authenticated state is available or the state has expired, the smoke run
fails with a clear sign-in message and does not mutate data.

## Optional Checks

Set `SCHOOLFEES_READINESS_DOWNLOAD_EXPORTS=1` to download the first XLSX export
and verify the filename. Leave this off for the fastest read-only route pass.

Payment posting, import apply, fee edits, and recovery collection are not run by
this npm script. Verify those with the authenticated Browser QA path in
`TEST-2026-27` only.
