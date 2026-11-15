<#
  Sync the "Halifax Twin City" Google Drive folder into this repo, then
  commit and push anything that changed.

    drive/  exact copies: Docs as .docx, Sheets as .xlsx, draw.io and images as-is
    docs/   readable on GitHub: Docs as Markdown, Sheets as CSV (first tab only)

  Files listed in $Exclude stay on Drive and never reach the repo.

  Usage:  .\scripts\sync-drive.ps1            # sync, commit, push
          .\scripts\sync-drive.ps1 -NoPush    # sync and commit only
#>
param([switch]$NoPush)

# rclone and git write notices to stderr, which Windows PowerShell 5.1 would
# treat as fatal under "Stop". Success is judged by exit codes instead.
$ErrorActionPreference = "Continue"

$Source  = "gdrive:Halifax Twin City"
$Exclude = @("*Project Tracker*")   # private planning notes

$repo = Split-Path $PSScriptRoot -Parent

$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone) {
  $rclone = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $rclone) { throw "rclone not found. Install it with: winget install Rclone.Rclone" }

$excludeArgs = $Exclude | ForEach-Object { "--filter"; "- $_" }

# 1. Exact copies
& $rclone sync $Source (Join-Path $repo "drive") --drive-export-formats "docx,xlsx" @excludeArgs
if ($LASTEXITCODE -ne 0) { throw "rclone sync of drive/ failed ($LASTEXITCODE)" }

# 2. Readable copies (Markdown and CSV only)
& $rclone sync $Source (Join-Path $repo "docs") --drive-export-formats "md,csv" @excludeArgs `
  --filter "+ *.md" --filter "+ *.csv" --filter "- *"
if ($LASTEXITCODE -ne 0) { throw "rclone sync of docs/ failed ($LASTEXITCODE)" }

# 3. Commit and push if anything changed
Set-Location $repo
git add -A drive docs
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No changes on Drive since the last sync."
  exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -q -m "Sync from Google Drive ($stamp)"
Write-Host "Committed: Sync from Google Drive ($stamp)"

if (-not $NoPush) {
  git push -q
  Write-Host "Pushed to GitHub."
}
