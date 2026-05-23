param(
  [switch]$SkipClear
)

$ErrorActionPreference = "Stop"

function Invoke-LinkedSqlFile {
  param([Parameter(Mandatory=$true)][string]$Path)

  Write-Host ">>> $Path" -ForegroundColor Cyan
  & node_modules\.bin\supabase.cmd db query --linked --file $Path | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase query failed for $Path"
  }
}

if (-not (Test-Path -LiteralPath "node_modules\.bin\supabase.cmd")) {
  throw "Supabase CLI not found at node_modules\.bin\supabase.cmd"
}

if (-not $SkipClear) {
  Write-Host "=== Clearing Mumbai public/auth data ===" -ForegroundColor Yellow
  Invoke-LinkedSqlFile "scratch\region-restore\00-clear-target.sql"
}

Write-Host "=== Restoring Sydney public data chunks ===" -ForegroundColor Yellow
Get-ChildItem -LiteralPath "scratch\region-restore\public-chunks" -Filter "*.sql" |
  Sort-Object Name |
  ForEach-Object { Invoke-LinkedSqlFile $_.FullName }

Write-Host "=== Restoring Sydney auth data chunks ===" -ForegroundColor Yellow
Get-ChildItem -LiteralPath "scratch\region-restore\auth-chunks" -Filter "*.sql" |
  Sort-Object Name |
  ForEach-Object { Invoke-LinkedSqlFile $_.FullName }

$officeSyncPath = "scratch\region-restore\office-sync-events.sql"
if (Test-Path -LiteralPath $officeSyncPath) {
  Write-Host "=== Restoring Sydney office sync events ===" -ForegroundColor Yellow
  Invoke-LinkedSqlFile $officeSyncPath
} else {
  Write-Warning "Skipping office_sync_events: $officeSyncPath is missing"
}

Write-Host "=== Refreshing materialized views ===" -ForegroundColor Yellow
Invoke-LinkedSqlFile "scratch\region-restore\99-refresh-matviews.sql"

Write-Host "=== Final row counts ===" -ForegroundColor Green
Invoke-LinkedSqlFile "scratch\region-restore\99-verify-counts.sql"
