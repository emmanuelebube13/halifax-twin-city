<#
.SYNOPSIS
  Builds the web app for the public site and uploads it to Cloudflare Pages (project "hfxtwin").

.DESCRIPTION
  1. Builds apps\web with the public API address (VITE_API_BASE, default https://hfxtwin-api.profine.ca).
  2. Unpacks the basemap (<data>\tiles\halifax.pmtiles, not in the repository) into one file per map tile in
     dist\tiles\v, because Pages ignores the range requests PMTiles needs, and copies the fonts and sprites.
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
  $env:VITE_BASEMAP_TILE_FOLDER = "1"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "The build failed." }
  # Pages ignores range requests, which halifax.pmtiles needs: publish its tiles as plain files instead,
  # with the fonts and sprites beside them.
  $distTiles = Join-Path $web "dist\tiles"
  New-Item -ItemType Directory -Force $distTiles | Out-Null
  Get-ChildItem $tiles -Directory | ForEach-Object { Copy-Item $_.FullName $distTiles -Recurse -Force }
  python (Join-Path $repo "scripts\export_basemap_tiles.py") (Join-Path $tiles "halifax.pmtiles") (Join-Path $distTiles "v")
  if ($LASTEXITCODE -ne 0) { throw "Unpacking the basemap failed." }
  # a missing file must be a 404, not the app's page: a map tile outside the extract would otherwise be HTML
  Set-Content -Path (Join-Path $web "dist\404.html") -Value "<!doctype html><title>Not found</title><p>Not found. <a href=`"/`">Open the Halifax twin</a></p>" -Encoding utf8
  Write-Host "Built dist for $ApiBase, with the basemap as tile files."
  if (-not $BuildOnly) {
    npx --yes wrangler@4 pages deploy dist --project-name $Project --branch main --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw "The upload failed." }
  }
} finally {
  Remove-Item Env:VITE_API_BASE, Env:VITE_BASEMAP_TILE_FOLDER -ErrorAction SilentlyContinue
  Pop-Location
}
