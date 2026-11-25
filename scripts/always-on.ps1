<#
.SYNOPSIS
  Keeps the public Halifax Twin running: starts whatever is missing, and does nothing when all is up.

.DESCRIPTION
  Windows runs this at every start-up, before anyone signs in, and every 5 minutes after that, through the
  scheduled task "Halifax Twin always on" (scripts\install-always-on.ps1 registers it). Each run checks, in order:
    1. Database: the portable PostgreSQL 16 on localhost:5433. Started with pg_ctl if pg_isready says it is down.
    2. Collector: scripts\collector-start.ps1 from -Repo (it exits at once if a collector already runs).
    3. Public API on 127.0.0.1:8020 and the Cloudflare Tunnel: scripts\start-public-api.ps1 from -ApiRepo.
  Every run is logged to <data>\logs\always-on.log (the last 2,000 lines are kept).
  No password or key is read or written here; the public 3D token is read from the user's environment by
  start-public-api.ps1 and never logged.

.PARAMETER Repo
  Checkout the collector runs from. Default: the release worktree, which follows main.
.PARAMETER ApiRepo
  Checkout the public API runs from. Default: the folder this script is in.
.PARAMETER Python
  Python of an existing API environment, passed to start-public-api.ps1.
#>
param(
  [string]$Repo = "C:\halifax-twin-data\worktrees\release",
  [string]$ApiRepo = (Split-Path $PSScriptRoot -Parent),
  [string]$Python = ""
)

$ErrorActionPreference = "Continue"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs "always-on.log"
function Write-Log([string]$m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $log -Encoding utf8 }

# Runs another script and waits for that script only. Capturing its output through a pipe would wait for the
# programs it starts too (they inherit the pipe and run for days), so its output goes to a file instead.
function Invoke-Step([string]$Name, [string[]]$ArgList) {
  $tmp = Join-Path $logs "always-on.$Name.out"
  $p = Start-Process -FilePath "powershell.exe" -ArgumentList (@("-NoProfile", "-ExecutionPolicy", "Bypass") + $ArgList) `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $tmp -RedirectStandardError "$tmp.err"
  if (-not $p.WaitForExit(300000)) { Write-Log "${Name}: still running after 5 minutes"; return }
  $text = ((Get-Content $tmp, "$tmp.err" -ErrorAction SilentlyContinue) -join " ") -replace "\s+", " "
  Write-Log "${Name}: $($text.Trim())"
}

Write-Log "check started (user $env:USERNAME)"

# 1. Database
$pgBin = Join-Path $dataDir "pgsql\bin"
& (Join-Path $pgBin "pg_isready.exe") -h localhost -p 5433 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Log "database down: starting"
  # not through a pipe: the database server would inherit it and this script would wait for it forever
  $pg = Start-Process -FilePath (Join-Path $pgBin "pg_ctl.exe") -WindowStyle Hidden -PassThru `
    -ArgumentList @("-D", "`"$(Join-Path $dataDir "pgdata")`"", "-l", "`"$(Join-Path $logs "postgres.log")`"", "-w", "-t", "120", "start")
  [void]$pg.WaitForExit(150000)
  & (Join-Path $pgBin "pg_isready.exe") -h localhost -p 5433 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log "database did not start; see postgres.log"; exit 1 }
  Write-Log "database started"
}

# 2. Collector
Invoke-Step "collector" @("-File", "`"$(Join-Path $Repo "scripts\collector-start.ps1")`"")

# 3. Public API and tunnel
$args3 = @("-File", "`"$(Join-Path $ApiRepo "scripts\start-public-api.ps1")`"")
if ($Python) { $args3 += @("-Python", "`"$Python`"") }
Invoke-Step "public" $args3

# keep the log short
$lines = Get-Content $log -ErrorAction SilentlyContinue
if ($lines.Count -gt 2000) { $lines | Select-Object -Last 2000 | Set-Content $log -Encoding utf8 }
