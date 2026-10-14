<#
.SYNOPSIS
Verify a caller-selected resume command or Windows Terminal window locally.
.PARAMETER Mode
Tab/Window resume a session; ReceiptTab/ReceiptWindow only print a directory receipt.
Inspect/Screenshot inspect only the explicitly selected Windows Terminal window.
.PARAMETER SessionId
Required for Tab/Window. Supply a session ID consisting of ses_ and alphanumeric characters.
.PARAMETER Directory
Required for Tab/Window/ReceiptTab/ReceiptWindow. Supply an existing working directory.
.PARAMETER WindowHandle
Required for Inspect/Screenshot. Supply the positive handle of your chosen terminal window.
.PARAMETER OutputPath
Required for Screenshot. Supply a PNG path with an existing parent directory.
.NOTES
Output can contain the requested session ID, directory, and selected window's text.
Keep receipts and screenshots local; review them before sharing.
#>
param(
    [ValidateSet('Tab', 'Window', 'Inspect', 'Screenshot', 'ReceiptTab', 'ReceiptWindow')]
    [string]$Mode = 'Inspect',
    [string]$SessionId,
    [string]$Directory,
    [int]$WindowHandle,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if ($Mode -in 'Tab', 'Window', 'ReceiptTab', 'ReceiptWindow') {
    if (-not $PSBoundParameters.ContainsKey('Directory') -or [string]::IsNullOrWhiteSpace($Directory)) {
        throw "$Mode requires an explicit -Directory."
    }
    if ($Mode -in 'Tab', 'Window') {
        if (-not $PSBoundParameters.ContainsKey('SessionId') -or [string]::IsNullOrWhiteSpace($SessionId)) {
            throw "$Mode requires an explicit -SessionId."
        }
        if ($SessionId -cnotmatch '\Ases_[A-Za-z0-9]+\z') { throw 'Invalid session ID' }
    }
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        throw "Directory does not exist: $Directory"
    }
    $pwsh = (Get-Command pwsh -CommandType Application).Source
    if ($pwsh.Contains(';')) { throw 'Use a PowerShell installation path without semicolons.' }
    $wt = (Get-Command wt -CommandType Application).Source
    $quotedDirectory = $Directory.Replace("'", "''")
    $script = "Set-Location -LiteralPath '$quotedDirectory'; "
    if ($Mode -like 'Receipt*') {
        $script += "Write-Host ('RESUME-ENCODING-RECEIPT|' + (Get-Location).Path)"
    } else {
        $opencode = (Get-Command opencode -CommandType Application).Source
        $quotedExecutable = $opencode.Replace("'", "''")
        $script += "& '$quotedExecutable' --session '$SessionId'"
    }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $target = if ($Mode -in 'Window', 'ReceiptWindow') { 'new' } else { '0' }
    [pscustomobject]@{ Mode = $Mode; Script = $script; Executable = $wt; PowerShell = $pwsh; EncodedCommand = $encoded } | Format-List
    & $wt -w $target new-tab $pwsh -NoLogo -NoExit -EncodedCommand $encoded
    if ($LASTEXITCODE -ne 0) { throw "Windows Terminal launch failed with exit code $LASTEXITCODE." }
    "WT_EXIT=$LASTEXITCODE"
    return
}

if (-not $PSBoundParameters.ContainsKey('WindowHandle') -or $WindowHandle -le 0) {
    throw "$Mode requires an explicit positive -WindowHandle."
}
if ($Mode -eq 'Screenshot') {
    if ([string]::IsNullOrWhiteSpace($OutputPath) -or
        -not (Test-Path -LiteralPath (Split-Path -Parent $OutputPath) -PathType Container)) {
        throw 'OutputPath requires an existing parent directory'
    }
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.AndCondition]::new(
    [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ClassNameProperty, 'CASCADIA_HOSTING_WINDOW_CLASS'),
    [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty, $WindowHandle)
)
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
if ($null -eq $window) { throw "No Windows Terminal window found for handle $WindowHandle." }
"WINDOW|$($window.Current.NativeWindowHandle)|$($window.Current.Name)|$($window.Current.BoundingRectangle)"
$elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($element in $elements) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
        "TEXT|$($element.Current.ControlType.ProgrammaticName)|$($element.Current.Name)"
        $pattern.DocumentRange.GetText(16000)
    } elseif ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem) {
        "TAB|$($element.Current.Name)"
    }
}
if ($Mode -eq 'Screenshot') {
    Add-Type -AssemblyName System.Drawing
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ResumeCapture { [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr device, uint flags); }'
    $rectangle = $window.Current.BoundingRectangle
    $bitmap = [System.Drawing.Bitmap]::new([int]$rectangle.Width, [int]$rectangle.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $device = $graphics.GetHdc()
    try {
        $captured = [ResumeCapture]::PrintWindow([intptr]$window.Current.NativeWindowHandle, $device, 2)
    } finally {
        $graphics.ReleaseHdc($device)
    }
    if (-not $captured) { throw 'PrintWindow failed' }
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    "SCREENSHOT|$OutputPath"
}
