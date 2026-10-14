param(
    [string]$SessionId,
    [ValidateSet('tab', 'window')][string]$Launch
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root 'src-tauri/Cargo.toml'
& cargo build --manifest-path $manifest --bin backend_smoke
if ($LASTEXITCODE -ne 0) { throw 'Backend smoke build failed.' }
$binary = Join-Path $root 'src-tauri/target/debug/backend_smoke.exe'
$arguments = @()
if ($SessionId) { $arguments += @('--session', $SessionId) }
if ($Launch) {
    if (-not $SessionId) { throw 'Explicit launch requires -SessionId; the default never launches.' }
    $arguments += @('--launch', $Launch)
}
$output = @(& $binary @arguments)
if ($LASTEXITCODE -ne 0) { throw 'Backend smoke failed. See the native error above.' }
$catalog = $output[0] | ConvertFrom-Json
$detail = if ($output.Count -gt 1) { $output[1] | ConvertFrom-Json } else { $null }
[pscustomobject]@{
    DatabasePath = $catalog.databasePath
    OpenCodeVersion = $catalog.opencodeVersion
    Projects = $catalog.projects.Count
    Sessions = $catalog.sessions.Count
    DetailSessionId = $detail.session.id
    PreviewMessages = $detail.preview.Count
    PreviewTruncated = $detail.previewTruncated
}
if ($Launch) { $output[2] }
