# struct-pass-reference monorepo: build cache cleaner.
# Path allowlist — refuses to delete anything outside the repo root.
# Usage: pwsh -File .\scripts\clean-cache.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$targets = @(
    'packages/frontend/.next',
    'packages/frontend/.turbo',
    'packages/backend/dist',
    'packages/shared/dist'
)

Write-Host "repo root: $repoRoot"
foreach ($rel in $targets) {
    $abs = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $rel))
    if (-not $abs.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "refused (outside repo): $rel"
        continue
    }
    if (Test-Path -LiteralPath $abs) {
        Remove-Item -LiteralPath $abs -Recurse -Force
        Write-Host "  removed: $rel"
    } else {
        Write-Host "  skip (not present): $rel"
    }
}
Write-Host "done."
