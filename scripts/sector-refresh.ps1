<#
.SYNOPSIS
  Refreshes the Public Works and Housing data (street and sidewalk closures SRC-015, building permits
  SRC-066) by running the hrm_arcgis loader once for every layer.

.DESCRIPTION
  Creates or reuses services\collector\hrm_arcgis\.venv (Python 3.12) and installs its requirements.txt
  when that file changes, then runs "python -m hrm_arcgis" from services\collector.

  Each layer is its own run inside the loader, so one failing layer is logged and the others still load.
  The exit code is 0 when every layer loaded and 1 (or the loader's own code) when any failed, so Task
  Scheduler shows the failure in "Last Run Result". Two copies never run at once: a second copy exits.

  Paths are relative to this script, so it works from any checkout of the repository.
  Database: HALIFAX_TWIN_DB_URL (default postgresql://postgres@localhost:5433/halifax_twin; the password
  comes from pgpass.conf). Data folder: HALIFAX_TWIN_DATA_DIR (default C:\halifax-twin-data).
  Log: <data>\logs\sector_refresh_<yyyy-MM-dd>.log (Halifax date), appended on each run.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\sector-refresh.ps1
  powershell -ExecutionPolicy Bypass -File scripts\sector-refresh.ps1 -Layers street_closures,sidewalk_closures
#>
param(
  [string[]]$Layers = @(),
  [switch]$Reinstall
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$collector = Join-Path $repo "services\collector"
$pkg = Join-Path $collector "hrm_arcgis"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null

$halifaxZone = [System.TimeZoneInfo]::FindSystemTimeZoneById("Atlantic Standard Time")
function Get-HalifaxNow { [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $halifaxZone) }
$log = Join-Path $logs ("sector_refresh_{0}.log" -f (Get-HalifaxNow).ToString("yyyy-MM-dd"))

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-HalifaxNow).ToString("HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

function Initialize-SectorVenv {
  param([string]$Dir, [switch]$Reinstall)
  $venv = Join-Path $Dir ".venv"
  $py = Join-Path $venv "Scripts\python.exe"
  $req = Join-Path $Dir "requirements.txt"
  $stamp = Join-Path $venv "requirements.sha256"
  if ($Reinstall -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }
  if (-not (Test-Path $py)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw "The py launcher was not found. Install Python 3.12." }
    Write-Log "Creating services\collector\hrm_arcgis\.venv with Python 3.12"
    & py -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment (is Python 3.12 installed?)." }
  }
  $hash = (Get-FileHash $req -Algorithm SHA256).Hash
  $old = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }
  if ($hash -ne $old) {
    Write-Log "Installing Python packages (first run, or requirements.txt changed)"
    & $py -m pip install --disable-pip-version-check -q --upgrade pip
    & $py -m pip install --disable-pip-version-check -q -r $req
    if ($LASTEXITCODE -ne 0) { throw "pip install failed." }
    Set-Content -Path $stamp -Value $hash -Encoding ascii
  }
  return $py
}

# One copy at a time, across every checkout (the database and HRM's servers are shared).
$mutex = New-Object System.Threading.Mutex($false, "Global\HalifaxTwinSectorRefresh")
if (-not $mutex.WaitOne(0)) {
  Write-Log "Another sector refresh is running. Nothing to do."
  exit 0
}

$exitCode = 1
try {
  Write-Log "Sector refresh started from $repo"
  $py = Initialize-SectorVenv -Dir $pkg -Reinstall:$Reinstall
  $env:PYTHONUNBUFFERED = "1"
  $env:PYTHONIOENCODING = "utf-8"
  $loaderArgs = @("-m", "hrm_arcgis") + $Layers

  # Windows PowerShell 5.1 wraps a native program's stderr lines as errors; collect them as plain text
  # and judge success by the exit code only.
  Push-Location $collector
  $ErrorActionPreference = "Continue"
  try {
    & $py @loaderArgs 2>&1 | ForEach-Object {
      $text = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
      Write-Host $text
      Add-Content -Path $log -Value $text -Encoding utf8
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = "Stop"
    Pop-Location
  }
  if ($exitCode -eq 0) { Write-Log "Sector refresh finished: every layer loaded" }
  else { Write-Log "Sector refresh finished with failures (exit code $exitCode); see the lines above" }
} catch {
  Write-Log "Sector refresh could not run: $($_.Exception.Message)"
  $exitCode = 1
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
exit $exitCode
