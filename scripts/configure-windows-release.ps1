$ErrorActionPreference = 'Stop'
$thumbprint = $null
if ($env:WINDOWS_SIGNING_PFX_BASE64 -or $env:WINDOWS_SIGNING_PFX_PASSWORD) {
  if (!$env:WINDOWS_SIGNING_PFX_BASE64 -or !$env:WINDOWS_SIGNING_PFX_PASSWORD) {
    throw 'Configure both Windows Authenticode secrets.'
  }
  $pfx = Join-Path ([IO.Path]::GetTempPath()) ("sotovor-" + [Guid]::NewGuid() + ".pfx")
  try {
    [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_SIGNING_PFX_BASE64))
    $password = ConvertTo-SecureString $env:WINDOWS_SIGNING_PFX_PASSWORD -AsPlainText -Force
    $cert = Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\My -Password $password |
      Where-Object HasPrivateKey | Select-Object -First 1
    if (!$cert) { throw 'The PFX did not contain a signing certificate with a private key.' }
    $thumbprint = $cert.Thumbprint
  } finally {
    Remove-Item -LiteralPath $pfx -Force -ErrorAction SilentlyContinue
  }
}
$bundle = @{ createUpdaterArtifacts = [bool]$env:TAURI_SIGNING_PRIVATE_KEY }
if ($thumbprint) {
  $bundle.windows = @{
    certificateThumbprint = $thumbprint
    digestAlgorithm = 'sha256'
    timestampUrl = 'http://timestamp.digicert.com'
    tsp = $true
  }
} else {
  Write-Output 'Windows Authenticode signing is disabled. This installer can trigger SmartScreen.'
}
if ($env:GITHUB_ENV) {
  $authenticode = ([bool]$thumbprint).ToString().ToLowerInvariant()
  "WINDOWS_AUTHENTICODE=$authenticode" >> $env:GITHUB_ENV
}
$config = @{ bundle = $bundle }
if ($bundle.createUpdaterArtifacts) {
  $publicKey = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '../apps/desktop/src-tauri/updater.pub')).Trim()
  $config.plugins = @{ updater = @{ pubkey = $publicKey } }
}
$configPath = Join-Path $PSScriptRoot '../apps/desktop/src-tauri/tauri.release.json'
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5))
