$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Run this script on the Windows release machine.'
}

$releaseRoot = Join-Path $PSScriptRoot '..\src-tauri\target\x86_64-pc-windows-msvc\release'
$appExecutable = Join-Path $releaseRoot 'thatsoundslikeme-tauri.exe'
$installers = @(Get-ChildItem (Join-Path $releaseRoot 'bundle\nsis\*.exe'))
$artifacts = @($appExecutable) + @($installers.FullName)

if (-not (Test-Path $appExecutable)) {
  throw "Application executable not found: $appExecutable"
}
if ($installers.Count -eq 0) {
  throw 'No NSIS installer was found to verify.'
}

$windowsKitsBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -LiteralPath $windowsKitsBin -Filter signtool.exe -Recurse |
  Where-Object { $_.Directory.Name -eq 'x64' } |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $signTool) {
  throw 'signtool.exe was not found in the Windows 10 SDK.'
}

foreach ($artifact in $artifacts) {
  $verificationOutput = (& $signTool verify /pa /all /v /tw $artifact 2>&1) | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticode verification failed for ${artifact}:`n$verificationOutput"
  }
  if ($verificationOutput -notmatch 'The signature is timestamped:') {
    throw "No trusted timestamp was found on $artifact."
  }
  if ($verificationOutput -notmatch 'Certum Code Signing') {
    throw "The signature on $artifact was not issued by Certum."
  }
  Write-Host "Valid Certum signature and timestamp: $artifact"
}
