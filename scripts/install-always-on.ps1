<#
.SYNOPSIS
  Registers the scheduled task "Halifax Twin always on", which runs scripts\always-on.ps1 at every start-up
  (no sign-in needed) and every 5 minutes after. Run once, as administrator.

.DESCRIPTION
  The task runs as you, with "Run whether user is logged on or not" and "Do not store password" (Windows
  calls this S4U): Windows keeps no password, and the task can still reach this computer's files, the
  database and the internet. It does not wake a sleeping computer; keep sleep off while plugged in.
  Remove it with: Unregister-ScheduledTask -TaskName "Halifax Twin always on"

.EXAMPLE
  Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File "C:\halifax-twin-data\worktrees\perf3d\scripts\install-always-on.ps1"'
#>
param(
  [string]$Repo = "C:\halifax-twin-data\worktrees\release",
  [string]$ApiRepo = (Split-Path $PSScriptRoot -Parent),
  [string]$Python = "",
  [string]$User = "$env:USERDOMAIN\$env:USERNAME"
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "always-on.ps1"
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Repo `"$Repo`" -ApiRepo `"$ApiRepo`""
if ($Python) { $arg += " -Python `"$Python`"" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $PSScriptRoot
$atStartup = New-ScheduledTaskTrigger -AtStartup
$atStartup.Delay = "PT1M"   # give the network a minute after boot
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "Halifax Twin always on" -Description "Starts the Halifax Twin database, collector, public API and Cloudflare Tunnel if they are not running." `
  -Action $action -Trigger @($atStartup, $every5) -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Registered 'Halifax Twin always on' for ${User}: at start-up and every 5 minutes."
Write-Host "Log: C:\halifax-twin-data\logs\always-on.log"
Read-Host "Press Enter to close"
