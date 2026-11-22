<#
.SYNOPSIS
  Starts the Halifax Transit realtime collector in the background, if it is not already running.

.DESCRIPTION
  Runs "python -m collector.transit_realtime" from services\ with no window, so it keeps running after
  this script and the terminal close. Only one copy runs: this script checks the pid file and the process
  list first, and the collector itself holds a PostgreSQL advisory lock, so a second copy exits at once.

  Database: HALIFAX_TWIN_DB_URL (default postgresql://postgres@localhost:5433/halifax_twin; the password
  comes from pgpass.conf). Data folder: HALIFAX_TWIN_DATA_DIR (default C:\halifax-twin-data).
  Logs: <data>\logs\transit_realtime_<date>.log (one per Halifax day), plus
        <data>\logs\transit_realtime.console.log and transit_realtime.error.log (start-up and crash output).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\collector-start.ps1
  powershell -ExecutionPolicy Bypass -File scripts\collector-start.ps1 -Interval 30
#>
param([int]$Interval = 30)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"
$pidFile = Join-Path $logs "transit_realtime.pid"
New-Item -ItemType Directory -Force $logs | Out-Null

function Get-CollectorProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
    Where-Object { $_.CommandLine -match 'collector\.transit_realtime' -and $_.CommandLine -notmatch '--once' }
}

$running = @(Get-CollectorProcess)
if ($running.Count -gt 0) {
  Write-Host "The collector is already running (process $(($running | ForEach-Object ProcessId) -join ', ')). Nothing to do."
  exit 0
}

. (Join-Path $PSScriptRoot "collector-venv.ps1")
$py = Initialize-CollectorVenv -Repo $repo

$p = Start-Process -FilePath $py `
  -ArgumentList @("-u", "-m", "collector.transit_realtime", "--interval", "$Interval") `
  -WorkingDirectory (Join-Path $repo "services") `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "transit_realtime.console.log") `
  -RedirectStandardError (Join-Path $logs "transit_realtime.error.log") `
  -PassThru

# The venv's python.exe is a launcher that starts the real interpreter as a child; the child writes the
# pid file once it holds the database lock. Wait for it.
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Test-Path $pidFile)) {
  if ($p.HasExited) { break }
  Start-Sleep -Milliseconds 500
}
if (Test-Path $pidFile) {
  $collectorPid = (Get-Content $pidFile -Raw).Trim()
  Write-Host "Collector started: process $collectorPid (launcher $($p.Id)). Stop it with scripts\collector-stop.ps1."
  Write-Host "Log: $logs\transit_realtime_$((Get-Date).ToString('yyyy-MM-dd')).log"
  exit 0
}
Write-Host "The collector did not start. See $logs\transit_realtime.error.log and transit_realtime.console.log."
exit 1
