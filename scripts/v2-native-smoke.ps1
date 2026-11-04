param([string] $BackendSmoke = (Join-Path $PSScriptRoot '../src-tauri/target/debug/v2_smoke.exe'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (!(Test-Path -LiteralPath $BackendSmoke -PathType Leaf)) {
    throw 'Missing v2_smoke.exe; run: cargo build --manifest-path src-tauri/Cargo.toml --no-default-features --bin v2_smoke'
}
$BackendSmoke = (Resolve-Path -LiteralPath $BackendSmoke).Path
$program = (Get-Command opencode -CommandType Application).Source
$sandboxParent = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'opencode'))
$root = Join-Path $sandboxParent ('v2-smoke-' + [Guid]::NewGuid().ToString('N'))
$password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$server = $null
$client = $null
$ownedPaths = @($root)
$isolated = @{}

function Assert-SandboxPath([string] $Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -ne $root -and !$full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Path escaped smoke sandbox'
    }
    if (Test-Path -LiteralPath $full) {
        $item = Get-Item -LiteralPath $full -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing sandbox reparse point' }
    }
}

function New-IsolatedProcess([string[]] $Arguments, [string] $Executable = $program) {
    foreach ($path in $ownedPaths) { Assert-SandboxPath $path }
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $root
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    foreach ($key in @($info.Environment.Keys)) {
        if ($key.StartsWith('OPENCODE', [StringComparison]::OrdinalIgnoreCase)) { $null = $info.Environment.Remove($key) }
    }
    foreach ($key in $isolated.Keys) { $info.Environment[$key] = $isolated[$key] }
    $info.Environment['OPENCODE_DB'] = Join-Path $root 'session.db'
    $info.Environment['OPENCODE_PASSWORD'] = $password
    $info.Environment['V2_SMOKE_ROOT'] = $root
    return [Diagnostics.Process]::Start($info)
}

function Stop-OwnedProcess($Process) {
    if (!$Process.HasExited) { $Process.Kill($true); $Process.WaitForExit() }
    $Process.Dispose()
}

function Read-IsolatedCommand([string[]] $Arguments, [string] $Executable = $program, [int] $Timeout = 30000) {
    $process = New-IsolatedProcess $Arguments $Executable
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit($Timeout)) { throw 'Isolated command timed out' }
        $text = $output.GetAwaiter().GetResult()
        $diagnostic = $errors.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "Isolated command failed ($($process.ExitCode)): $($diagnostic.Replace($password, '[redacted]'))" }
        return $text.Trim()
    } finally { Stop-OwnedProcess $process }
}

function Send-Api([string] $Method, [string] $Path, [object] $Body = $null) {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $base + $Path)
    try {
        if ($null -ne $Body) {
            $request.Content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Depth 8 -Compress), [Text.Encoding]::UTF8, 'application/json')
        }
        $response = $client.Send($request)
        try {
            if (!$response.IsSuccessStatusCode) {
                $diagnostic = ''
                if ($Path.EndsWith('/fork') -or $Path -eq '/api/experimental/session/import') {
                    $diagnostic = ': ' + $response.Content.ReadAsStringAsync().GetAwaiter().GetResult().Replace($password, '[redacted]')
                }
                throw "API $Method $Path failed with status $([int]$response.StatusCode)$diagnostic"
            }
            if ([int]$response.StatusCode -eq 204) { return $null }
            $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ([string]::IsNullOrWhiteSpace($text)) { return $null }
            return ($text | ConvertFrom-Json)
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

try {
    $null = [IO.Directory]::CreateDirectory($root)
    foreach ($key in @('HOME', 'USERPROFILE', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'APPDATA', 'LOCALAPPDATA')) {
        $isolated[$key] = Join-Path $root $key
        $ownedPaths += $isolated[$key]
        $null = [IO.Directory]::CreateDirectory($isolated[$key])
    }
    $workspace1 = Join-Path $root "workspace 中文's; one"
    $workspace2 = Join-Path $root 'workspace two'
    $ownedPaths += @($workspace1, $workspace2, (Join-Path $root 'session.db'))
    $null = [IO.Directory]::CreateDirectory($workspace1)
    $null = [IO.Directory]::CreateDirectory($workspace2)
    $version = Read-IsolatedCommand @('--version')
    if ($version -notmatch '^(?:opencode\s+)?v?2\.') { throw 'This smoke requires installed OpenCode V2' }
    $server = New-IsolatedProcess @('serve', '--hostname', '127.0.0.1', '--port', '0')
    $stderr = $server.StandardError.ReadToEndAsync()
    $line = $server.StandardOutput.ReadLineAsync().WaitAsync([TimeSpan]::FromSeconds(30)).GetAwaiter().GetResult()
    $stdout = $server.StandardOutput.ReadToEndAsync()
    if ($line -notmatch '^server listening on (http://127\.0\.0\.1:[0-9]+)$') { throw 'Unexpected V2 server startup line' }
    $base = $Matches[1]
    $uri = [Uri]::new($base)
    if ($uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or !$uri.IsLoopback -or $uri.Port -le 0 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/') { throw 'Unsafe server endpoint' }
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $unauthenticated = $client.GetAsync($base + '/api/session').GetAwaiter().GetResult()
    try {
        if ([int]$unauthenticated.StatusCode -ne 401) { throw 'Server did not require authentication' }
    } finally { $unauthenticated.Dispose() }
    $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('opencode:' + $password))
    $client.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Basic', $auth)
    $template = (Send-Api POST '/api/session' @{ title = 'Synthetic V2 fork template'; location = @{ directory = $workspace2 } }).data
    $info = $template | ConvertTo-Json -Depth 30 | ConvertFrom-Json -AsHashtable
    $info.id = 'ses_native' + [Guid]::NewGuid().ToString('N')
    $info.title = 'Synthetic V2 nonempty fork source'
    $source = (Send-Api POST '/api/experimental/session/import' @{
        info = $info
        messages = @(@{
            id = 'msg_native' + [Guid]::NewGuid().ToString('N')
            type = 'user'
            time = @{ created = $info.time.created }
            text = 'Synthetic fork contract probe'
        })
        location = @{ directory = $workspace2 }
    }).data
    $null = Send-Api DELETE ('/api/session/' + $template.id)
    $fork = (Send-Api POST ('/api/session/' + $source.id + '/fork') @{}).data
    if ($fork.id -eq $source.id) { throw 'Fork probe returned source ID' }
    $forkParent = $fork.PSObject.Properties['parentID']
    $parentPointsToSource = $null -ne $forkParent -and $forkParent.Value -eq $source.id
    $forkParentID = if ($null -ne $forkParent) { [string]$forkParent.Value } else { '<absent>' }
    $forkSourceID = '<absent>'
    $forkMetadata = $fork.PSObject.Properties['fork']
    if ($null -ne $forkMetadata -and $null -ne $forkMetadata.Value) {
        $forkSource = $forkMetadata.Value.PSObject.Properties['sessionID']
        if ($null -ne $forkSource) { $forkSourceID = [string]$forkSource.Value }
    }
    "Fork probe: source=$($source.id); fork=$($fork.id); fork.parentID=$forkParentID; parentID points to source=$parentPointsToSource; fork.sessionID=$forkSourceID"
    $null = Send-Api DELETE ('/api/session/' + $source.id)
    $afterSourceDelete = Send-Api GET '/api/session?limit=20'
    if ($null -eq $afterSourceDelete -or $null -eq $afterSourceDelete.data) { throw 'Fork probe list contract missing data' }
    if (@($afterSourceDelete.data | Where-Object { $_.id -eq $source.id }).Count) { throw 'Fork source deletion did not persist' }
    $forkSurvived = @($afterSourceDelete.data | Where-Object { $_.id -eq $fork.id }).Count -eq 1
    "Fork probe: fork survived source deletion=$forkSurvived; source deletion cascaded=$(!$forkSurvived)"
    if (!$parentPointsToSource -and !$forkSurvived) { throw 'Safety blocker: source deletion cascaded to fork without parentID dependency' }
    if ($forkSurvived) { $null = Send-Api DELETE ('/api/session/' + $fork.id) }
    $afterProbe = Send-Api GET '/api/session?limit=20'
    if ($null -eq $afterProbe -or $null -eq $afterProbe.data -or @($afterProbe.data).Count -ne 0) { throw 'Fork probe did not leave an empty synthetic catalog' }
    $parent = (Send-Api POST '/api/session' @{ title = 'Synthetic V2 parent'; location = @{ directory = $workspace1 } }).data
    $child = (Send-Api POST '/api/session' @{ title = 'Synthetic V2 child'; parentID = $parent.id; location = @{ directory = $workspace1 } }).data
    $independent = (Send-Api POST '/api/session' @{ title = 'Synthetic V2 independent'; location = @{ directory = $workspace2 } }).data
    $ids = @($parent.id, $child.id, $independent.id)
    if (@($ids | Select-Object -Unique).Count -ne 3 -or @($ids | Where-Object { $_ -notmatch '^ses_[A-Za-z0-9]+$' }).Count) { throw 'Invalid synthetic session IDs' }
    'Synthetic session IDs: ' + ($ids -join ', ')
    Read-IsolatedCommand $ids $BackendSmoke 120000
    $serviceRegistration = Join-Path $isolated['XDG_STATE_HOME'] 'opencode/service.json'
    Assert-SandboxPath $serviceRegistration
    if (Test-Path -LiteralPath $serviceRegistration) { throw 'Backend unexpectedly registered an isolated shared service' }
    'Standalone deletion verified: isolated XDG_STATE_HOME/opencode/service.json absent'
    $remaining = Send-Api GET '/api/session?limit=20'
    if ($null -eq $remaining -or $null -eq $remaining.data -or @($remaining.data).Count -ne 0) { throw 'API did not confirm empty synthetic catalog' }
    "Installed version: $version; supportsSession/project grouping/rename/delete passed (native backend + API)"
} finally {
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $server) { Stop-OwnedProcess $server }
    # CLI deletion may start a service; only this sandbox's environment may stop it.
    if ([IO.Directory]::Exists($root)) {
        $null = Read-IsolatedCommand @('service', 'stop')
        foreach ($path in $ownedPaths) { Assert-SandboxPath $path }
        foreach ($item in Get-ChildItem -LiteralPath $root -Force -Recurse) { Assert-SandboxPath $item.FullName }
        if ([IO.Path]::GetDirectoryName($root) -ne $sandboxParent -or [IO.Path]::GetFileName($root) -notmatch '^v2-smoke-[a-f0-9]{32}$') { throw 'Unsafe sandbox cleanup root' }
        [IO.Directory]::Delete($root, $true)
    }
}
