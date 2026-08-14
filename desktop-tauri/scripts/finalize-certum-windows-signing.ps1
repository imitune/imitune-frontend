$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Run this script on the Windows release machine.'
}

$tauriRoot = Join-Path $PSScriptRoot '..\src-tauri'
$releaseRoot = Join-Path $tauriRoot 'target\x86_64-pc-windows-msvc\release'
$appExecutable = Join-Path $releaseRoot 'thatsoundslikeme-tauri.exe'
$nsisStagingRoot = Join-Path $releaseRoot 'nsis\x64'
$nsisScript = Join-Path $nsisStagingRoot 'installer.nsi'
$nsisOutput = Join-Path $nsisStagingRoot 'nsis-output.exe'
$signingConfigPath = Join-Path $tauriRoot 'tauri.windows.release.conf.json'
$tauriConfigPath = Join-Path $tauriRoot 'tauri.conf.json'

foreach ($requiredPath in @($appExecutable, $nsisScript, $signingConfigPath, $tauriConfigPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required release file not found: $requiredPath"
  }
}

$signingConfig = Get-Content -LiteralPath $signingConfigPath -Raw | ConvertFrom-Json
$thumbprint = $signingConfig.bundle.windows.certificateThumbprint
$digestAlgorithm = $signingConfig.bundle.windows.digestAlgorithm
$timestampUrl = $signingConfig.bundle.windows.timestampUrl
$version = (Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json).version

if (-not $thumbprint -or -not $digestAlgorithm -or -not $timestampUrl) {
  throw 'The local Tauri signing configuration is incomplete.'
}

$windowsKitsBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$signTool = Get-ChildItem -LiteralPath $windowsKitsBin -Filter signtool.exe -Recurse |
  Where-Object { $_.Directory.Name -eq 'x64' } |
  Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $signTool) {
  throw 'signtool.exe was not found in the Windows 10 SDK.'
}

$makeNsisCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'tauri\NSIS\makensis.exe'),
  (Join-Path $env:LOCALAPPDATA 'tauri\NSIS\Bin\makensis.exe')
)
$makeNsis = $makeNsisCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $makeNsis) {
  throw 'The Tauri-managed makensis.exe was not found.'
}

function Invoke-CertumSign {
  param([Parameter(Mandatory)][string]$Artifact)

  & $signTool sign /fd $digestAlgorithm /sha1 $thumbprint /d 'ThatSoundsLikeMe' /t $timestampUrl $Artifact
  if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe failed for $Artifact with exit code $LASTEXITCODE."
  }
}

Invoke-CertumSign -Artifact $appExecutable

if (Test-Path -LiteralPath $nsisOutput) {
  Remove-Item -LiteralPath $nsisOutput -Force
}

Push-Location $nsisStagingRoot
try {
  & $makeNsis $nsisScript
  if ($LASTEXITCODE -ne 0) {
    throw "makensis.exe failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $nsisOutput)) {
  throw "NSIS did not create the expected installer: $nsisOutput"
}

Invoke-CertumSign -Artifact $nsisOutput

$installerPath = Join-Path $releaseRoot "bundle\nsis\ThatSoundsLikeMe_${version}_x64-setup.exe"

if (-not (Test-Path -LiteralPath $installerPath)) {
  throw "The NSIS installer destination was not found: $installerPath"
}

Copy-Item -LiteralPath $nsisOutput -Destination $installerPath -Force
Write-Host "Signed application and installer: $installerPath"
