<#
.SYNOPSIS
  Loads the Halifax Transit GTFS schedule (SRC-004) into the database.

.DESCRIPTION
  Downloads the current schedule and loads it, or loads a file already on disk with -File.
  Loading a version already in the database refreshes routes and stops only. Run it again after
  Halifax Transit publishes the next file (the current period ends 29 Nov 2026).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1
  powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1 -File C:\path\google_transit.zip
  powershell -ExecutionPolicy Bypass -File scripts\collector-load-schedule.ps1 -GoldOnly   # reinstall database\gold only
#>
param([string]$File, [switch]$GoldOnly)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot "collector-venv.ps1")
$py = Initialize-CollectorVenv -Repo $repo

$arguments = @("-u", "-m", "collector.gtfs_schedule")
if ($File) { $arguments += @("--file", (Resolve-Path $File).Path) }
if ($GoldOnly) { $arguments += "--gold-only" }
Push-Location (Join-Path $repo "services")
try {
  & $py @arguments
  exit $LASTEXITCODE
}
finally { Pop-Location }
