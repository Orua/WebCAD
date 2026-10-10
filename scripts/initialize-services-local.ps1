param([string]$LocalRoot='F:/WebCADServices-local')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$root=[IO.Path]::GetFullPath($LocalRoot)
if($root -notmatch '^F:[\\/]' -or !(Test-Path -LiteralPath $root -PathType Container)){throw 'Use an existing fixed F: Services runtime'}
$directory=Join-Path $root 'configuration';[void][IO.Directory]::CreateDirectory($directory)
if(([IO.File]::GetAttributes($directory) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Private configuration cannot be a reparse point'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl -LiteralPath $directory -AclObject $acl
$credentialFile=Join-Path $directory 'credential.dpapi'
if(!(Test-Path -LiteralPath $credentialFile)){
 $random=[byte[]]::new(32);$generator=[Security.Cryptography.RandomNumberGenerator]::Create();try{$generator.GetBytes($random)}finally{$generator.Dispose()}
 $protected=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([Convert]::ToBase64String($random)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 [IO.File]::WriteAllBytes($credentialFile,$protected)
}
# Verify the stored credential belongs to this user without displaying it.
$checked=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($credentialFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
if($checked.Length -lt 32){throw 'Stored Services authorization is invalid'}
Write-Output 'Local Services authorization is ready (per-user DPAPI). No Windows Service or IIS change was made.'
