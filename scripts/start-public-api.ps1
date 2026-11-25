<#
.SYNOPSIS
  Runs the API for the public site and connects it to Cloudflare through the tunnel "hfxtwin".

.DESCRIPTION
  1. Starts a second copy of the serving API on 127.0.0.1:8020 (only this computer can reach it directly),
     with the public web address allowed and the public 3D token offered up to the daily limit.
  2. Starts the Cloudflare Tunnel, which carries https://hfxtwin-api.profine.ca to that port. No router port
     is opened.
  The public 3D token is read from the environment variable CESIUM_ION_TOKEN_PUBLIC (Windows User scope); it is
  never written to a file or printed. The local API on 8010 keeps running as before.
  Output goes to <data>\logs\public-api.*.log and tunnel.*.log; process ids to public-api.pid and tunnel.pid,
  which scripts\stop-public-api.ps1 reads.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-public-api.ps1
#>
param(
  [string]$Origin = "https://hfxtwin.profine.ca",
  [int]$Port = 8020,
  [int]$DailyLimit = 30,
  [string]$Tunnel = "hfxtwin",
  # Python of an existing API environment; default: services\api\.venv in this folder
  [string]$Python = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$api = Join-Path $repo "services\api"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

$python = if ($Python) { $Python } else { Join-Path $api ".venv\Scripts\python.exe" }
if (-not (Test-Path $python)) { throw "No API environment at $python. Run scripts\start-all.ps1 from this folder once, or make the .venv." }

$publicToken = [Environment]::GetEnvironmentVariable("CESIUM_ION_TOKEN_PUBLIC", "User")
if (-not $publicToken) { Write-Host "CESIUM_ION_TOKEN_PUBLIC is not set: the public site will offer 2D only." }

# the public copy never gets the local token: a tunnelled visitor must never be able to receive it
$env:CESIUM_ION_TOKEN = ""
$env:CESIUM_ION_TOKEN_PUBLIC = $publicToken
$env:HALIFAX_TWIN_PUBLIC_ORIGINS = $Origin
$env:HALIFAX_TWIN_3D_DAILY_LIMIT = "$DailyLimit"
$env:HALIFAX_TWIN_DATA_DIR = $dataDir
$publicToken = $null

# Safe to run again and again (scripts\always-on.ps1 runs it every few minutes): each part starts only if missing.
function Test-Health([int]$P) {
  try { (Invoke-WebRequest "http://127.0.0.1:$P/v1/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}
if (Test-Health $Port) {
  Write-Host "Public API: already answering on port $Port."
} else {
  $old = Join-Path $logs "public-api.pid"
  if (Test-Path $old) { Stop-Process -Id ([int](Get-Content $old)) -Force -ErrorAction SilentlyContinue }
  $a = Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "halifax_api.main:app", "--host", "127.0.0.1", "--port", "$Port", "--proxy-headers" `
    -WorkingDirectory $api -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logs "public-api.out.log") -RedirectStandardError (Join-Path $logs "public-api.err.log")
  $a.Id | Set-Content (Join-Path $logs "public-api.pid")
  Write-Host "Public API: started on http://127.0.0.1:$Port (pid $($a.Id))"
}
Remove-Item Env:CESIUM_ION_TOKEN_PUBLIC, Env:CESIUM_ION_TOKEN -ErrorAction SilentlyContinue

$tunnelRunning = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" | Where-Object { $_.CommandLine -match "tunnel" -and $_.CommandLine -match "\b$Tunnel\b" }
if ($tunnelRunning) {
  Write-Host "Tunnel '$Tunnel': already running (pid $(($tunnelRunning | ForEach-Object ProcessId) -join ', '))."
} else {
  $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cf) { $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
  $t = Start-Process -FilePath $cf -ArgumentList "tunnel", "--no-autoupdate", "run", "--url", "http://127.0.0.1:$Port", $Tunnel `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logs "tunnel.out.log") -RedirectStandardError (Join-Path $logs "tunnel.err.log")
  $t.Id | Set-Content (Join-Path $logs "tunnel.pid")
  Write-Host "Tunnel '$Tunnel': started (pid $($t.Id)). Logs: $logs\tunnel.err.log"
}
