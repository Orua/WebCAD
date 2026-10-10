param([string]$LocalRoot='F:/WebCADServices-local')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if([IO.Path]::GetFullPath($LocalRoot) -notmatch '^F:[\\/]'){throw 'Use fixed F: local storage'}
$path=Join-Path $LocalRoot 'configuration/credential.dpapi'
$bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString($bytes))
Write-Output 'Copied dedicated local Services authorization. Paste it in the single Services settings dialog; it is not printed or stored in source.'
