<#
.SYNOPSIS
  Builds the web app for the public site and uploads it to Cloudflare Pages (project "hfxtwin").

.DESCRIPTION
  1. Builds apps\web with the public API address (VITE_API_BASE, default https://hfxtwin-api.profine.ca).
  2. Copies the basemap folder (<data>\tiles: halifax.pmtiles and fonts, not in the repository) into dist\tiles.
  3. Uploads dist with Wrangler. The first run asks you to sign in to Cloudflare in the browser.
  No key or token is read or written here: the 3D token reaches visitors only through the API.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy-public-site.ps1
#>
param(
  [string]$ApiBase = "https://hfxtwin-api.profine.ca",
  [string]$Project = "hfxtwin",
  [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
$web = Join-Path $repo "apps\web"
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$tiles = Join-Path $dataDir "tiles"
if (-not (Test-Path (Join-Path $tiles "halifax.pmtiles"))) { throw "The basemap is missing: $tiles\halifax.pmtiles" }

Push-Location $web
try {
  $env:VITE_API_BASE = $ApiBase
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "The build failed." }
  Copy-Item $tiles (Join-Path $web "dist\tiles") -Recurse -Force
  Write-Host "Built dist for $ApiBase, with the basemap."
  if (-not $BuildOnly) {
    npx --yes wrangler@4 pages deploy dist --project-name $Project --branch main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw "The upload failed." }
  }
} finally {
  Remove-Item Env:VITE_API_BASE -ErrorAction SilentlyContinue
  Pop-Location
}
