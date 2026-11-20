# Shared by start.ps1 and load.ps1: make sure demo\.venv exists and its packages match requirements.txt.
# Dot-source it, then call Initialize-DemoVenv. It returns the path to the venv's python.exe.

function Find-DemoPython {
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

function Initialize-DemoVenv {
  param([string]$Demo, [switch]$Reinstall)
  $venv = Join-Path $Demo ".venv"
  $py = Join-Path $venv "Scripts\python.exe"
  $req = Join-Path $Demo "requirements.txt"
  $stamp = Join-Path $venv "requirements.sha256"

  if ($Reinstall -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }
  if (-not (Test-Path $py)) {
    $p = Find-DemoPython
    Write-Host "Creating demo\.venv with $($p -join ' ')"
    $pre = @($p | Select-Object -Skip 1)
    & $p[0] @pre -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment." }
  }

  $hash = (Get-FileHash $req -Algorithm SHA256).Hash
  $old = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }
  if ($hash -ne $old) {
    Write-Host "Installing Python packages (first run, or requirements.txt changed)"
    & $py -m pip install --disable-pip-version-check -q --upgrade pip
    & $py -m pip install --disable-pip-version-check -q -r $req
    if ($LASTEXITCODE -ne 0) { throw "pip install failed." }
    Set-Content -Path $stamp -Value $hash -Encoding ascii
  }
  return $py
}

function Test-DemoDatabaseConfigured {
  param([string]$Demo)
  if ($env:HALIFAX_TWIN_DB_URL) { return $true }
  $local = Join-Path $Demo "config.local.json"
  if (-not (Test-Path $local)) { return $false }
  $cfg = Get-Content $local -Raw | ConvertFrom-Json
  return [bool]($cfg.database_url -and $cfg.database_url -notmatch "YOUR_PASSWORD")
}
