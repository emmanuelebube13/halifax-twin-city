<#
.SYNOPSIS
  Stops the Halifax Transit realtime collector.

.DESCRIPTION
  Stops every python.exe running "collector.transit_realtime" (the venv launcher and the interpreter it
  starts: both must go), then removes the pid file. A cycle cut short is rolled back by the database,
  so stopping at any moment is safe; the next start carries on.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\collector-stop.ps1
#>
$ErrorActionPreference = "Stop"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$pidFile = Join-Path $dataDir "logs\transit_realtime.pid"

$ids = @()
if (Test-Path $pidFile) { $ids += [int](Get-Content $pidFile -Raw).Trim() }
$ids += @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
  Where-Object { $_.CommandLine -match 'collector\.transit_realtime' } | ForEach-Object { [int]$_.ProcessId })
$ids = @($ids | Sort-Object -Unique)

$stopped = @()
foreach ($id in $ids) {
  try {
    Stop-Process -Id $id -Force -ErrorAction Stop
    $stopped += $id
  } catch { }       # already gone
}
if (Test-Path $pidFile) { Remove-Item $pidFile -Force }

if ($stopped.Count -gt 0) { Write-Host "Collector stopped (process $($stopped -join ', '))." }
else { Write-Host "The collector was not running." }
exit 0
