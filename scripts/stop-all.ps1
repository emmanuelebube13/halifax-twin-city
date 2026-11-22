<#
.SYNOPSIS
  Stops the Halifax Digital Twin: web app, serving API, transit collector and database.

.DESCRIPTION
  Stops each part that is running, in this order: web app (port 5173), API (port 8010), collector
  (scripts\collector-stop.ps1), database (pg_ctl stop -m fast). Stopping the collector leaves a gap
  in the feed archive that cannot be filled later, so use -AppOnly to stop only the API and web app.
  A part that is not running is skipped.

.PARAMETER AppOnly
  Stop only the web app and the API; leave the collector and database running.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1 -AppOnly
#>
param([switch]$AppOnly)

$ErrorActionPreference = "Stop"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"

# Stop a process and everything it started (npm starts node; the venv launcher starts python).
function Stop-Tree([int]$Id) {
  # taskkill writes to stderr when the process is already gone; Windows PowerShell 5.1 turns that into an
  # error under "Stop", so judge by the exit code instead.
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & taskkill.exe /PID $Id /T /F 2>&1 | Out-Null } finally { $ErrorActionPreference = $old }
}

function Stop-Port([string]$Name, [int]$Port, [string]$PidFile) {
  $ids = @()
  if (Test-Path $PidFile) { $ids += [int](Get-Content $PidFile -Raw).Trim() }
  $lines = & netstat.exe -ano | Select-String -Pattern ("127\.0\.0\.1:" + $Port + "\s+\S+\s+LISTENING\s+(\d+)")
  foreach ($l in $lines) { $ids += [int]$l.Matches[0].Groups[1].Value }
  $ids = @($ids | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
  foreach ($id in $ids) { Stop-Tree $id }
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
  if ($ids.Count -gt 0) { Write-Host "$($Name): stopped (process $($ids -join ', '))" } else { Write-Host "$($Name): was not running" }
}

Stop-Port "Web app" 5173 (Join-Path $logs "web.pid")
Stop-Port "API" 8010 (Join-Path $logs "api.pid")

if ($AppOnly) {
  Write-Host "Collector and database left running."
  exit 0
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "collector-stop.ps1")

$pgBin = Join-Path $dataDir "pgsql\bin"
& (Join-Path $pgBin "pg_isready.exe") -h localhost -p 5433 | Out-Null
if ($LASTEXITCODE -eq 0) {
  & (Join-Path $pgBin "pg_ctl.exe") -D (Join-Path $dataDir "pgdata") -m fast -w stop | Out-Null
  Write-Host "Database: stopped"
} else {
  Write-Host "Database: was not running"
}
exit 0
