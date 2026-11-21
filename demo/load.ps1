<#
.SYNOPSIS
  Runs the demo's data loaders.

.DESCRIPTION
  One command for the loaders. "all" runs every one-off loader in order (core data first).
  A name runs one loader; extra arguments are passed to it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File demo\load.ps1 all
  powershell -ExecutionPolicy Bypass -File demo\load.ps1 list
  powershell -ExecutionPolicy Bypass -File demo\load.ps1 transit_realtime --once
#>
param(
  [Parameter(Position = 0)][string]$Name = "list",
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)

$ErrorActionPreference = "Stop"
$demo = $PSScriptRoot
. (Join-Path $demo "scripts\venv.ps1")
$py = Initialize-DemoVenv -Demo $demo

# One-off loaders, in the order "all" runs them. Each later task adds its loaders here.
$oneOff = @()

# Loaders that run continuously (start.ps1 starts these with the app).
$continuous = @("transit_realtime")

if (-not (Test-DemoDatabaseConfigured -Demo $demo)) {
  Write-Host "No database configured. Copy demo\config.example.json to demo\config.local.json and fill it in."
  exit 1
}

Push-Location $demo
try {
  switch ($Name) {
    "list" {
      Write-Host "One-off loaders (run by 'all', in order): $($oneOff -join ', ')"
      Write-Host "Continuous loaders (started by start.ps1): $($continuous -join ', ')"
      exit 0
    }
    "all" {
      $failed = @()
      foreach ($l in $oneOff) {
        Write-Host "=== $l"
        & $py -u -m "loaders.$l" @Rest
        if ($LASTEXITCODE -ne 0) { $failed += $l }
      }
      if ($failed) { Write-Host "Failed: $($failed -join ', ')"; exit 1 }
      Write-Host "All loaders finished."
      exit 0
    }
    default {
      if (-not (Test-Path (Join-Path $demo "loaders\$Name"))) { Write-Host "No loader named $Name. Try: load.ps1 list"; exit 1 }
      & $py -u -m "loaders.$Name" @Rest
      exit $LASTEXITCODE
    }
  }
}
finally { Pop-Location }
