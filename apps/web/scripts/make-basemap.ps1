# Builds the local "harbour chart" basemap for the web app, free and offline after the first download:
#   - halifax.pmtiles: a Protomaps extract of the Halifax area (OpenStreetMap data, ODbL; about 16 MB)
#   - fonts/ and sprites/: the glyphs and icons the style needs, from protomaps/basemaps-assets
# Everything goes to the data root (outside the repository and OneDrive). Nothing here needs an account or key.
# Usage: powershell -File scripts\make-basemap.ps1 [-Build 20261120] [-TilesDir C:\halifax-twin-data\tiles]
param(
  [string]$Build = "20261120",
  [string]$TilesDir = "C:\halifax-twin-data\tiles",
  [string]$PmtilesExe = "C:\halifax-twin-data\downloads\pmtiles-cli\pmtiles.exe",
  [string]$BBox = "-63.85,44.55,-63.35,44.85",
  [int]$MaxZoom = 15
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $TilesDir | Out-Null

if (-not (Test-Path $PmtilesExe)) {
  # go-pmtiles is BSD-licensed; get it from https://github.com/protomaps/go-pmtiles/releases (Windows x86_64 zip)
  Write-Error "pmtiles.exe not found at $PmtilesExe. Download go-pmtiles for Windows and unzip it there."
}
# Daily builds are listed at https://build-metadata.protomaps.dev/builds.json; pick a recent date.
& $PmtilesExe extract "https://build.protomaps.com/$Build.pmtiles" (Join-Path $TilesDir "halifax.pmtiles") "--bbox=$BBox" "--maxzoom=$MaxZoom"
if ($LASTEXITCODE -ne 0) { throw "pmtiles extract failed" }

$assets = "https://protomaps.github.io/basemaps-assets"
foreach ($font in "Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic") {
  $dir = Join-Path $TilesDir "fonts\$font"
  New-Item -ItemType Directory -Force $dir | Out-Null
  foreach ($range in "0-255", "256-511", "8192-8447") {
    $enc = [uri]::EscapeDataString($font)
    Invoke-WebRequest -UseBasicParsing "$assets/fonts/$enc/$range.pbf" -OutFile (Join-Path $dir "$range.pbf")
  }
}
$sprites = Join-Path $TilesDir "sprites\v4"
New-Item -ItemType Directory -Force $sprites | Out-Null
foreach ($f in "light.json", "light.png", "light@2x.json", "light@2x.png", "dark.json", "dark.png", "dark@2x.json", "dark@2x.png") {
  Invoke-WebRequest -UseBasicParsing "$assets/sprites/v4/$f" -OutFile (Join-Path $sprites $f)
}
Write-Output "Basemap ready in $TilesDir"
