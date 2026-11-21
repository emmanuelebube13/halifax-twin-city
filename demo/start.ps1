<#
.SYNOPSIS
  Starts the Halifax Digital Twin demo: the app (API and web page) and the live transit collector.

.DESCRIPTION
  The first run creates demo\.venv and installs demo\requirements.txt. The packages are
  installed again only when requirements.txt changes. Then:
    - the live transit collector starts in the background (when the database is configured),
      writing to demo\data\logs\transit_realtime.log;
    - the app starts at http://localhost:8010 and the browser opens.
  Stop with Ctrl+C: the collector stops with the app.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File demo\start.ps1
  powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Port 8020 -NoBrowser
  powershell -ExecutionPolicy Bypass -File demo\start.ps1 -NoCollector
  powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Test
#>
param(
  [int]$Port = 0,
  [switch]$NoBrowser,
  [switch]$NoCollector,
  [switch]$Reinstall,
  [switch]$Test
)

$ErrorActionPreference = "Stop"
$demo = $PSScriptRoot
. (Join-Path $demo "scripts\venv.ps1")
$py = Initialize-DemoVenv -Demo $demo -Reinstall:$Reinstall

$dataDir = Join-Path $demo "data"
$logDir = Join-Path $dataDir "logs"
$pidFile = Join-Path $dataDir "transit_realtime.pid"
$collector = $null

function Stop-DemoCollector {
  # Stops the collector this script started, and any left over from a window that was closed.
  # A venv's python.exe on Windows starts a second python process, so stop every collector process.
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "-m loaders\.transit_realtime" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Push-Location $demo
try {
  if ($Test) {
    & $py -m pytest -q tests
    exit $LASTEXITCODE
  }

  # Port: -Port, else config.local.json, else 8010 (8000 was the old live-buses app)
  if ($Port -eq 0) {
    $Port = 8010
    $local = Join-Path $demo "config.local.json"
    if (Test-Path $local) {
      $cfg = Get-Content $local -Raw | ConvertFrom-Json
      if ($cfg.port) { $Port = [int]$cfg.port }
    }
  }
  $url = "http://localhost:$Port/"

  $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($busy) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($busy.OwningProcess)" -ErrorAction SilentlyContinue
    Write-Host "Port $Port is already in use by process $($busy.OwningProcess): $($proc.Name)"
    Write-Host "Stop that program, or start the demo on another port: demo\start.ps1 -Port 8020"
    exit 1
  }

  $dbReady = Test-DemoDatabaseConfigured -Demo $demo
  if (-not $dbReady) {
    Write-Host "No database configured: the app starts without data, and the collector does not start."
    Write-Host "Copy demo\config.example.json to demo\config.local.json and fill it in."
  }

  # Live transit collector, in the background
  if ($dbReady -and -not $NoCollector) {
    Stop-DemoCollector
    New-Item -ItemType Directory -Force $logDir | Out-Null
    $log = Join-Path $logDir "transit_realtime.log"
    $collector = Start-Process -FilePath $py -ArgumentList "-u", "-m", "loaders.transit_realtime" `
      -WorkingDirectory $demo -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $log -RedirectStandardError (Join-Path $logDir "transit_realtime.err.log")
    Set-Content -Path $pidFile -Value $collector.Id -Encoding ascii
    Write-Host "Live transit collector started (log: demo\data\logs\transit_realtime.log)"
  }

  # Open the browser once the server answers
  if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
      param($u)
      for ($i = 0; $i -lt 40; $i++) {
        try { Invoke-WebRequest "$($u)api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $u; return }
        catch { Start-Sleep -Milliseconds 500 }
      }
    } -ArgumentList $url | Out-Null
  }

  Write-Host "Halifax Twin demo: $url   (stop with Ctrl+C)"
  & $py -m uvicorn api.main:app --host 127.0.0.1 --port $Port
}
finally {
  Stop-DemoCollector
  Pop-Location
  Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
