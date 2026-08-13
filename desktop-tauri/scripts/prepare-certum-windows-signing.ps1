param(
  [string]$CertificateThumbprint
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Run this script on the Windows release machine.'
}

$codeSigningOid = '1.3.6.1.5.5.7.3.3'
$now = Get-Date
$candidates = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
  $_.HasPrivateKey -and
  $_.NotBefore -le $now -and
  $_.NotAfter -gt $now -and
  $_.Issuer -match 'Certum' -and
  ($_.EnhancedKeyUsageList.ObjectId.Value -contains $codeSigningOid)
}

if ($CertificateThumbprint) {
  $normalizedThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
  $candidates = @($candidates | Where-Object { $_.Thumbprint -eq $normalizedThumbprint })
} else {
  $candidates = @($candidates)
}

if ($candidates.Count -eq 0) {
  throw 'No usable Certum code-signing certificate was found in Cert:\CurrentUser\My. Activate the certificate, install and sign in to SimplySign Desktop, then try again.'
}

if ($candidates.Count -gt 1) {
  $descriptions = $candidates | ForEach-Object { "  $($_.Thumbprint)  $($_.Subject)  expires $($_.NotAfter.ToString('yyyy-MM-dd'))" }
  throw "More than one usable Certum code-signing certificate was found. Run npm run prepare:win-signing -- -CertificateThumbprint THUMBPRINT with one of:`n$($descriptions -join "`n")"
}

$certificate = $candidates[0]
$config = [ordered]@{
  bundle = [ordered]@{
    windows = [ordered]@{
      certificateThumbprint = $certificate.Thumbprint
      digestAlgorithm = 'sha256'
      timestampUrl = 'http://time.certum.pl'
    }
  }
}

$configPath = Join-Path $PSScriptRoot '..\src-tauri\tauri.windows.release.conf.json'
$config | ConvertTo-Json -Depth 4 | Set-Content -Path $configPath -Encoding UTF8

Write-Host "Prepared the ignored Tauri signing configuration for:"
Write-Host "  $($certificate.Subject)"
Write-Host "  Thumbprint: $($certificate.Thumbprint)"
Write-Host "  Expires: $($certificate.NotAfter.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host 'Keep SimplySign Desktop signed in while running npm run dist:win.'
