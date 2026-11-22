# Shared by the collector-*.ps1 scripts: make sure services\collector\.venv exists (Python 3.12) and its
# packages match requirements.txt. Dot-source it, then call Initialize-CollectorVenv; it returns python.exe.

function Initialize-CollectorVenv {
  param([string]$Repo, [switch]$Reinstall)
  $dir = Join-Path $Repo "services\collector"
  $venv = Join-Path $dir ".venv"
  $py = Join-Path $venv "Scripts\python.exe"
  $req = Join-Path $dir "requirements.txt"
  $stamp = Join-Path $venv "requirements.sha256"

  if ($Reinstall -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }
  if (-not (Test-Path $py)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw "The py launcher was not found. Install Python 3.12." }
    Write-Host "Creating services\collector\.venv with Python 3.12"
    & py -3.12 -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the virtual environment (is Python 3.12 installed?)." }
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
