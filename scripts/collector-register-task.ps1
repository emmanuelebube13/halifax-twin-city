<#
.SYNOPSIS
  Registers a Windows scheduled task that starts the transit realtime collector when you log on.

.DESCRIPTION
  Written for the architect to run by hand once; nothing runs it automatically. The task runs
  scripts\collector-start.ps1 at logon for the current user (no administrator rights, no stored password),
  and again every 15 minutes, so a collector that stopped is started again. collector-start.ps1 does
  nothing when the collector is already running, so the repeat is harmless.

  The task runs the copy of the repository this script is in. Register it from the main checkout,
  not from a worktree that will be deleted.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\collector-register-task.ps1
  powershell -ExecutionPolicy Bypass -File scripts\collector-register-task.ps1 -Unregister
#>
param(
  [string]$TaskName = "Halifax Twin transit collector",
  [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed the scheduled task '$TaskName'."
  exit 0
}

$start = Join-Path $PSScriptRoot "collector-start.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 15)).Repetition
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "Starts the Halifax Digital Twin transit realtime collector (scripts\collector-start.ps1)." `
  -Force | Out-Null
Write-Host "Registered '$TaskName': at logon, then every 15 minutes if it is not running."
Write-Host "Check it in Task Scheduler, or: Get-ScheduledTask -TaskName '$TaskName'"
