<#
.SYNOPSIS
  Takes the public site's data offline: stops the tunnel and the public API copy (port 8020).
  The website on Cloudflare Pages stays up and shows its "data service is not answering" note.
#>
$dataDir = if ($env:HALIFAX_TWIN_DATA_DIR) { $env:HALIFAX_TWIN_DATA_DIR } else { "C:\halifax-twin-data" }
$logs = Join-Path $dataDir "logs"
foreach ($name in "tunnel", "public-api") {
  $pidFile = Join-Path $logs "$name.pid"
  if (Test-Path $pidFile) {
    $id = [int](Get-Content $pidFile)
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    Remove-Item $pidFile
    Write-Host "Stopped $name (pid $id)"
  }
}
