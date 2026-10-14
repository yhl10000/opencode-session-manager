param([string] $BackendSmoke = '')
$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('opencode-rename-' + [Guid]::NewGuid().ToString('N'))
$program = (Get-Command opencode -CommandType Application).Source
$password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$username = 'rename-' + [Guid]::NewGuid().ToString('N')
$server = $null
$client = $null

function New-IsolatedProcess([string[]] $Arguments, [string] $Executable = $program) {
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $root
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    foreach ($key in @($info.Environment.Keys)) {
        if ($key.StartsWith('OPENCODE_')) { $null = $info.Environment.Remove($key) }
    }
    foreach ($key in @('HOME', 'USERPROFILE', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'APPDATA', 'LOCALAPPDATA')) {
        $value = Join-Path $root $key
        $null = [IO.Directory]::CreateDirectory($value)
        $info.Environment[$key] = $value
    }
    $info.Environment['OPENCODE_SERVER_PASSWORD'] = $password
    $info.Environment['OPENCODE_SERVER_USERNAME'] = $username
    $info.Environment['RENAME_SMOKE_ROOT'] = $root
    return [Diagnostics.Process]::Start($info)
}

function Read-IsolatedCommand([string[]] $Arguments) {
    $process = New-IsolatedProcess $Arguments
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(20000)) { throw 'Isolated command timed out' }
        if ($process.ExitCode -ne 0) { throw 'Isolated command failed' }
        $null = $errors.GetAwaiter().GetResult()
        return $output.GetAwaiter().GetResult().Trim()
    } finally {
        if (!$process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
    }
}

function Send-Api([string] $Method, [string] $Path, [object] $Body = $null) {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $base + $Path)
    try {
        if ($null -ne $Body) {
            $request.Content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
        }
        $response = $client.Send($request)
        try {
            if (!$response.IsSuccessStatusCode) { throw "API $Method failed with status $([int]$response.StatusCode)" }
            return ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

try {
    $null = [IO.Directory]::CreateDirectory($root)
    $version = Read-IsolatedCommand @('--version')
    $database = Read-IsolatedCommand @('--pure', 'db', 'path')
    if (![IO.Path]::GetFullPath($database).StartsWith($root + [IO.Path]::DirectorySeparatorChar)) { throw 'Isolation failed: database outside sandbox' }
    $server = New-IsolatedProcess @('--pure', 'serve', '--hostname', '127.0.0.1', '--port', '0', '--mdns=false')
    $stderr = $server.StandardError.ReadToEndAsync()
    $line = $server.StandardOutput.ReadLineAsync().WaitAsync([TimeSpan]::FromSeconds(30)).GetAwaiter().GetResult()
    if ($line -notmatch '^opencode server listening on (http://127\.0\.0\.1:\d+)$') { throw "Unexpected server startup line: $line" }
    $base = $Matches[1]
    $stdout = $server.StandardOutput.ReadToEndAsync()
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $unauthenticated = $client.GetAsync($base + '/doc').GetAwaiter().GetResult()
    if ([int]$unauthenticated.StatusCode -ne 401) { throw 'Server did not require authentication' }
    $unauthenticated.Dispose()
    $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($username + ':' + $password))
    $client.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Basic', $auth)
    $doc = Send-Api GET '/doc'
    $patch = $doc.paths.'/session/{sessionID}'.patch
    if ($null -eq $patch) { throw 'Installed API does not advertise session PATCH' }
    $context = '?directory=' + [Uri]::EscapeDataString($root)
    $paths = Send-Api GET ('/path' + $context)
    "Server path contract: $($paths | ConvertTo-Json -Compress)"
    if ($paths.directory -ne $root) { throw 'Unexpected server directory context' }
    $session = Send-Api POST ('/session' + $context) @{ title = 'Synthetic before rename' }
    "Synthetic session contract: $($session | ConvertTo-Json -Depth 8 -Compress)"
    $title = 'Persistent renamed session 中文 "quotes"'
    $renamed = Send-Api PATCH ('/session/' + $session.id + $context) @{ title = $title }
    $read = Send-Api GET ('/session/' + $session.id + $context)
    if ($renamed.title -ne $title -or $read.title -ne $title) { throw 'Rename did not persist' }
    "Installed version: $version"
    "Isolated database: $database"
    "Server path contract: $($paths | ConvertTo-Json -Compress)"
    "PATCH operation: $($patch.operationId)"
    "PATCH request schema: $($patch.requestBody | ConvertTo-Json -Depth 20 -Compress)"
    "Authenticated synthetic rename persisted: $($session.id)"
    if ($BackendSmoke) {
        $backend = New-IsolatedProcess @($session.id) ([IO.Path]::GetFullPath($BackendSmoke))
        try {
            $backendOutput = $backend.StandardOutput.ReadToEndAsync()
            $backendErrors = $backend.StandardError.ReadToEndAsync()
            if (!$backend.WaitForExit(90000)) { throw 'Backend smoke timed out' }
            $backendOutput.GetAwaiter().GetResult()
            if ($backend.ExitCode -ne 0) { throw $backendErrors.GetAwaiter().GetResult() }
        } finally {
            if (!$backend.HasExited) { $backend.Kill($true); $backend.WaitForExit() }
            $backend.Dispose()
        }
        $persisted = Send-Api GET ('/session/' + $session.id + $context)
        if ($persisted.title -ne 'Backend renamed 中文 "quotes"') { throw 'Backend rename was not persisted in API' }
    }
} finally {
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $server) {
        if (!$server.HasExited) { $server.Kill($true); $server.WaitForExit() }
        $server.Dispose()
        'Owned server terminated'
    }
    if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
