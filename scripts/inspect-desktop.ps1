param(
    [string]$Title = 'OpenCode Session Manager',
    [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
)
$target = $null
foreach ($window in $windows) {
    if ($window.Current.Name -like "*$Title*") {
        $target = $window
        break
    }
}
if ($null -eq $target) {
    throw "No visible desktop window matching '$Title'."
}

"WINDOW: $($target.Current.Name)"
"PROCESS: $($target.Current.ProcessId)"
$bounds = $target.Current.BoundingRectangle
"BOUNDS: $bounds"
$elements = $target.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
)
foreach ($element in $elements) {
    $name = $element.Current.Name
    if (-not [string]::IsNullOrWhiteSpace($name)) {
        "$($element.Current.ControlType.ProgrammaticName): $name"
    }
}

if ($ScreenshotPath) {
    $parent = Split-Path -Parent $ScreenshotPath
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "Screenshot parent directory does not exist: $parent"
    }
    $bitmap = [System.Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen(
            [int]$bounds.Left,
            [int]$bounds.Top,
            0,
            0,
            $bitmap.Size
        )
        $bitmap.Save($ScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
        "SCREENSHOT: $ScreenshotPath"
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
