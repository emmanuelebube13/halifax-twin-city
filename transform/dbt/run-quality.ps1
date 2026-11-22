# Run the Halifax Digital Twin data quality checks (dbt test, then dbt source freshness).
# Read-only: the session is opened with default_transaction_read_only=on and the project has no models.
# The password is never in a file here: libpq reads %APPDATA%\postgresql\pgpass.conf on its own.
param(
    [string]$Select = "",
    [switch]$TestsOnly,
    [switch]$FreshnessOnly
)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
if (-not (Test-Path ".venv\Scripts\dbt.exe")) {
    Write-Host "No venv yet. Run: py -3.12 -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt"
    exit 1
}
if (-not $env:DBT_PROFILES_DIR) {
    if (-not (Test-Path "profiles.yml")) { Copy-Item "profiles.example.yml" "profiles.yml" }
    $env:DBT_PROFILES_DIR = $PSScriptRoot
}
$env:PGOPTIONS = "-c default_transaction_read_only=on"
$sel = @()
if ($Select) { $sel = @("--select", $Select) }
$code = 0
if (-not $FreshnessOnly) {
    & .venv\Scripts\dbt.exe test @sel
    if ($LASTEXITCODE -ne 0) { $code = $LASTEXITCODE }
}
if (-not $TestsOnly) {
    & .venv\Scripts\dbt.exe source freshness
    if ($LASTEXITCODE -ne 0) { $code = $LASTEXITCODE }
}
exit $code
