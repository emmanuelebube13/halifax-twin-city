<#
.SYNOPSIS
  Runs the collector tests against a scratch database, never halifax_twin.

.DESCRIPTION
  Creates the scratch database (default halifax_twin_test_collector) with database/sql/run_all.sql
  the first time, makes sure services\collector\.venv exists, then runs pytest.
  The password comes from pgpass.conf, which psql and psycopg read by themselves.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\collector-test.ps1
  powershell -ExecutionPolicy Bypass -File scripts\collector-test.ps1 -Rebuild
#>
param(
  [string]$Database = "halifax_twin_test_collector",
  [string]$Psql = "C:\halifax-twin-data\pgsql\bin\psql.exe",
  [int]$Port = 5433,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
if ($Database -eq "halifax_twin") { throw "Tests never run against halifax_twin." }

$repo = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot "collector-venv.ps1")
$py = Initialize-CollectorVenv -Repo $repo

$exists = & $Psql -h localhost -p $Port -U postgres -w -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($LASTEXITCODE -ne 0) { throw "Cannot reach PostgreSQL on port $Port." }
if ($Rebuild -and $exists) {
  & $Psql -h localhost -p $Port -U postgres -w -d postgres -c "DROP DATABASE $Database WITH (FORCE)" | Out-Null
  $exists = $null
}
if (-not $exists) {
  Write-Host "Creating scratch database $Database"
  & $Psql -h localhost -p $Port -U postgres -w -d postgres -c "CREATE DATABASE $Database ENCODING 'UTF8' TEMPLATE template0" | Out-Null
  & $Psql -h localhost -p $Port -U postgres -w -d $Database -q -f (Join-Path $repo "database\sql\run_all.sql") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "run_all.sql failed on $Database." }
}

$env:HALIFAX_TWIN_TEST_DB_URL = "postgresql://postgres@localhost:$Port/$Database"
Push-Location (Join-Path $repo "services\collector")
try {
  # The default temporary folder under AppData may not be listable; keep test files under the data root.
  New-Item -ItemType Directory -Force "C:\halifax-twin-data\tmp" | Out-Null
  & $py -m pytest -q --basetemp "C:\halifax-twin-data\tmp\pytest-collector" @args
  exit $LASTEXITCODE
}
finally { Pop-Location }
