<#
.SYNOPSIS
  Starts the whole Halifax Digital Twin on this machine: database, transit collector, serving API and web app.

.DESCRIPTION
  Each part is started only if it is not already running, so the script is safe to run twice.
    1. Database: the portable PostgreSQL 16 on localhost:5433 (pg_ctl), if pg_isready says it is down.
    2. Collector: scripts\collector-start.ps1 (one copy only; it holds a database lock).
    3. API: uvicorn on 127.0.0.1:8010 from services\api, in services\api\.venv (Python 3.12, made on first run).
    4. Web app: the Vite dev server on 127.0.0.1:5173 from apps\web (npm install on first run).
  The API and web app run hidden. Their output goes to <data>\logs\api.*.log and web.*.log, and their
  process ids to <data>\logs\api.pid and web.pid, which scripts\stop-all.ps1 reads.
  No password is read or written: psql and psycopg take it from pgpass.conf on their own.

.PARAMETER Mock
  Start the web app on the contract example files instead of the API (npm run dev:mock).

.PARAMETER NoBrowser
  Do not open the browser at the end.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
#>
param([switch]$Mock, [switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$pgBin = Join-Path $dataDir "pgsql\bin"
$logs = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Port([int]$Port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect("127.0.0.1", $Port); return $true } catch { return $false } finally { $c.Close() }
}

function Wait-Url([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

# 1. Database
& (Join-Path $pgBin "pg_isready.exe") -h localhost -p 5433 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Starting the database"
  Start-Process -FilePath (Join-Path $pgBin "pg_ctl.exe") -ArgumentList @("-D", (Join-Path $dataDir "pgdata"), "-l", (Join-Path $logs "postgres.log"), "-w", "start") -WindowStyle Hidden -Wait
  & (Join-Path $pgBin "pg_isready.exe") -h localhost -p 5433 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "The database did not start. See $logs\postgres.log."; exit 1 }
}
Write-Host "Database: accepting connections on localhost:5433"

# 2. Collector
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "collector-start.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "The collector did not start; carrying on with the API and web app." }

# 3. API
$apiDir = Join-Path $repo "services\api"
if (Test-Port 8010) {
  Write-Host "API: port 8010 is already in use; assuming the API is running."
} else {
  $venv = Join-Path $apiDir ".venv"
  $py = Join-Path $venv "Scripts\python.exe"
  $req = Join-Path $apiDir "requirements.txt"
  $stamp = Join-Path $venv "requirements.sha256"
  if (-not (Test-Path $py)) {
    Write-Host "Creating services\api\.venv with Python 3.12"
    & py -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the API virtual environment (is Python 3.12 installed?)." }
  }
  $hash = (Get-FileHash $req -Algorithm SHA256).Hash
  $old = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }
  if ($hash -ne $old) {
    Write-Host "Installing API packages (first run, or requirements.txt changed)"
    & $py -m pip install --disable-pip-version-check -q -r $req
    if ($LASTEXITCODE -ne 0) { throw "pip install failed for the API." }
    Set-Content -Path $stamp -Value $hash -Encoding ascii
  }
  $p = Start-Process -FilePath $py `
    -ArgumentList @("-m", "uvicorn", "halifax_api.main:app", "--host", "127.0.0.1", "--port", "8010") `
    -WorkingDirectory $apiDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "api.console.log") `
    -RedirectStandardError (Join-Path $logs "api.error.log") -PassThru
  Set-Content -Path (Join-Path $logs "api.pid") -Value $p.Id -Encoding ascii
  if (Wait-Url "http://127.0.0.1:8010/v1/health" 40) { Write-Host "API: http://127.0.0.1:8010/v1/docs (process $($p.Id))" }
  else { Write-Host "API: did not answer /v1/health within 40 s. See $logs\api.error.log." }
}

# 4. Web app
$webDir = Join-Path $repo "apps\web"
if (Test-Port 5173) {
  Write-Host "Web app: port 5173 is already in use; assuming it is running."
} else {
  if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
    Write-Host "Installing web packages (first run; this takes a few minutes)"
    Push-Location $webDir
    try { & npm.cmd install --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw "npm install failed." } }
    finally { Pop-Location }
  }
  $node = (Get-Command node).Source
  $viteJs = Join-Path $webDir "node_modules\vite\bin\vite.js"
  $viteArgs = if ($Mock) { @($viteJs, "--mode", "mock", "--host", "0.0.0.0", "--port", "5173", "--strictPort") } else { @($viteJs, "--host", "0.0.0.0", "--port", "5173", "--strictPort") }
  $p = Start-Process -FilePath $node `
    -ArgumentList $viteArgs `
    -WorkingDirectory $webDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "web.console.log") `
    -RedirectStandardError (Join-Path $logs "web.error.log") -PassThru
  Set-Content -Path (Join-Path $logs "web.pid") -Value $p.Id -Encoding ascii
  if (Wait-Url "http://127.0.0.1:5173/" 60) { Write-Host "Web app: http://127.0.0.1:5173/ (process $($p.Id))" }
  else { Write-Host "Web app: did not answer within 60 s. See $logs\web.console.log." }
}

Write-Host "Open http://127.0.0.1:5173/ . Stop with scripts\stop-all.ps1."
$tsIp = (Get-NetIPAddress -InterfaceAlias 'Tailscale' -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress
if ($tsIp) { Write-Host "Remote access via Tailscale: http://${tsIp}:5173/ (Database: ${tsIp}:5433)" }
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:5173/" }
exit 0
