param(
    [Parameter(Mandatory = $true)][string]$Apk,
    [string]$Package = 'si.sotovor.app.qa'
)
$ErrorActionPreference = 'Stop'
if ($Package -notmatch '^si\.sotovor\.app(?:\.qa)?$') { throw 'Unexpected app package.' }
$sdk = $env:ANDROID_HOME
if (!$sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$adb = Join-Path $sdk 'platform-tools/adb.exe'
if (!(Test-Path -LiteralPath $adb)) { throw 'Set ANDROID_HOME to the Android SDK.' }
$asset = Get-Item -LiteralPath $Apk
& $adb install -r $asset.FullName
if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
$runs = 1..5 | ForEach-Object {
    & $adb shell am force-stop $Package
    $output = & $adb shell am start -W -n "$Package/si.sotovor.app.MainActivity"
    if ($LASTEXITCODE -ne 0) { throw 'Cold-start measurement failed.' }
    $report = $output -join "`n"
    if ($report -notmatch 'TotalTime:\s*(\d+)') { throw 'Android did not report TotalTime.' }
    $total = [int]$Matches[1]
    if ($report -notmatch 'WaitTime:\s*(\d+)') { throw 'Android did not report WaitTime.' }
    [ordered]@{ totalTimeMs = $total; waitTimeMs = [int]$Matches[1] }
}
$result = [ordered]@{
    package = $Package
    apkBytes = $asset.Length
    apkSha256 = (Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256).Hash
    device = (& $adb shell getprop ro.product.model).Trim()
    api = (& $adb shell getprop ro.build.version.sdk).Trim()
    runs = @($runs)
}
New-Item -ItemType Directory -Force quality-results | Out-Null
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 quality-results/android-startup.json
$result | ConvertTo-Json -Depth 5
