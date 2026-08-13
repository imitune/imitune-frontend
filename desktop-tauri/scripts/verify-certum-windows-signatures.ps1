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

foreach ($artifact in $artifacts) {
  $signature = Get-AuthenticodeSignature -FilePath $artifact
  if ($signature.Status -ne 'Valid') {
    throw "Authenticode verification failed for $artifact: $($signature.Status) $($signature.StatusMessage)"
  }
  if (-not $signature.TimeStamperCertificate) {
    throw "No trusted timestamp was found on $artifact."
  }
  if ($signature.SignerCertificate.Issuer -notmatch 'Certum') {
    throw "The signature on $artifact was not issued by Certum."
  }
  Write-Host "Valid Certum signature and timestamp: $artifact"
  Write-Host "  Subject: $($signature.SignerCertificate.Subject)"
}
