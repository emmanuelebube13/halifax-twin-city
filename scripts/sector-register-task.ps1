<#
.SYNOPSIS
  Registers a Windows scheduled task that refreshes the closures and building permits every 6 hours.

.DESCRIPTION
  Written for the architect to run by hand once; nothing runs it automatically.

  Cadence: the whole refresh (all three layers) every 6 hours, at 01:15, 07:15, 13:15 and 19:15 local
  time. Why:
  - Closures drive the "now" stories (PWK-Q13, PWK-Q16, TRN-Q25). HRM adds and edits closures during the
    working day, and most start at 07:00, so a run at 07:15 and 13:15 catches the day's changes. Four runs
    a day keep the data well inside the 72-hour dbt freshness limit for SRC-015, even if a run or two fail.
  - Polite to HRM's servers: one refresh is about 21 small requests (closures 3 pages, sidewalk
    closures 1, permits 17) one second apart, so about 84 requests a day, at quarter past the hour,
    away from the top-of-hour rush.
  - Permits change daily at most; refreshing them with the closures costs about 25 seconds and keeps
    one simple task.

  The task runs as the current user while that user is logged on (no administrator rights, no stored
  password), with a 30-minute limit, and is not started again while a run is still going. A missed run
  (computer asleep) starts when the computer is next available.

  The task runs the copy of the repository this script is in. Register it from the main checkout,
  not from a worktree that will be deleted.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\sector-register-task.ps1
  powershell -ExecutionPolicy Bypass -File scripts\sector-register-task.ps1 -Unregister
#>
param(
  [string]$TaskName = "Halifax Twin sector refresh",
  [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed the scheduled task '$TaskName'."
  exit 0
}

$refresh = Join-Path $PSScriptRoot "sector-refresh.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$refresh`""
$first = (Get-Date).Date.AddHours(1).AddMinutes(15)
$trigger = New-ScheduledTaskTrigger -Once -At $first -RepetitionInterval (New-TimeSpan -Hours 6)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "Refreshes Halifax Digital Twin closures and building permits (scripts\sector-refresh.ps1)." `
  -Force | Out-Null
Write-Host "Registered '$TaskName': every 6 hours at 01:15, 07:15, 13:15 and 19:15."
Write-Host "Check it in Task Scheduler, or: Get-ScheduledTask -TaskName '$TaskName'"
