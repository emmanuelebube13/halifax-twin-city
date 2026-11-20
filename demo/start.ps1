<#
.SYNOPSIS
  Starts the Halifax Digital Twin demo (API and web page, one process).

.DESCRIPTION
  The first run creates demo\.venv and installs demo\requirements.txt. The packages are
  installed again only when requirements.txt changes. Then the app starts at
  http://localhost:8000 and the browser opens. Stop with Ctrl+C.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File demo\start.ps1
  powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Port 8010 -NoBrowser
  powershell -ExecutionPolicy Bypass -File demo\start.ps1 -Test
#>
param(
  [int]$Port = 0,
  [switch]$NoBrowser,
  [switch]$Reinstall,
  [switch]$Test
)

$ErrorActionPreference = "Stop"
$demo = $PSScriptRoot
$venv = Join-Path $demo ".venv"
$py = Join-Path $venv "Scripts\python.exe"
$req = Join-Path $demo "requirements.txt"
$stamp = Join-Path $venv "requirements.sha256"

function Find-Python {
  # Python 3.12 or newer, from the py launcher first, then PATH.
  $candidates = @()
  if (Get-Command py -ErrorAction SilentlyContinue) { $candidates += , @("py", "-3") }
  if (Get-Command python -ErrorAction SilentlyContinue) { $candidates += , @("python") }
  foreach ($c in $candidates) {
    $exe = $c[0]; $pre = @($c | Select-Object -Skip 1)
    $v = & $exe @pre -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and [version]$v -ge [version]"3.12") { return , $c }
  }
  throw "Python 3.12 or newer was not found. Install it from python.org and tick 'Add python.exe to PATH'."
}

# 1. Virtual environment
if ($Reinstall -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }
if (-not (Test-Path $py)) {
  $p = Find-Python
  Write-Host "Creating demo\.venv with $($p -join ' ')"
  $pre = @($p | Select-Object -Skip 1)
  & $p[0] @pre -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment." }
}

# 2. Packages (only when requirements.txt changed)
$hash = (Get-FileHash $req -Algorithm SHA256).Hash
$old = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }
if ($hash -ne $old) {
  Write-Host "Installing Python packages (first run, or requirements.txt changed)"
  & $py -m pip install --disable-pip-version-check -q --upgrade pip
  & $py -m pip install --disable-pip-version-check -q -r $req
  if ($LASTEXITCODE -ne 0) { throw "pip install failed." }
  Set-Content -Path $stamp -Value $hash -Encoding ascii
}

Push-Location $demo
try {
  # Tests only
  if ($Test) {
    & $py -m pytest -q tests
    exit $LASTEXITCODE
  }

  # 3. Port: -Port, else config.local.json, else 8000
  if ($Port -eq 0) {
    $Port = 8000
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
    Write-Host "Stop that program, or start the demo on another port: demo\start.ps1 -Port 8010"
    exit 1
  }

  if (-not (Test-Path (Join-Path $demo "config.local.json"))) {
    Write-Host "No demo\config.local.json yet: the app starts without the database and without 3D."
    Write-Host "Copy demo\config.example.json to demo\config.local.json and fill it in."
  }

  # 4. Open the browser once the server answers
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
  Pop-Location
  Get-Job | Remove-Job -Force -ErrorAction SilentlyContinue
}
