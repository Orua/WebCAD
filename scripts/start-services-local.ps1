param([string]$LocalRoot='F:/WebCADServices-local',[string]$Http='http://127.0.0.1:17869/',[string]$AllowedOrigin='http://127.0.0.1:17868')
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($LocalRoot) -notmatch '^F:[\\/]'){throw 'Services runtime must use fixed F: storage'}
if(!(Test-Path -LiteralPath $LocalRoot -PathType Container)){throw 'Build and migrate the local Services runtime first'}
if(!$env:WEBCAD_SERVICES_TOKEN){
 Add-Type -AssemblyName System.Security
 $credentialFile=Join-Path $LocalRoot 'configuration/credential.dpapi'
 if(!(Test-Path -LiteralPath $credentialFile)){throw 'Run initialize-services-local.ps1 or set a dedicated session token'}
 $env:WEBCAD_SERVICES_TOKEN=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($credentialFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
}
$hostPath=Join-Path $LocalRoot 'build/bin/WebCADServices.Host/Release/net48/WebCADServices.Host.exe'
$env:WEBCAD_SERVICES_LOGO_WORKER=Join-Path $LocalRoot 'build/bin/LogoVector.Worker/Release/net48/LogoVector.Worker.exe'
$env:WEBCAD_SERVICES_OCCT_WORKER=Join-Path $LocalRoot 'runtime/native-a06/bin/WebCADOcctWorker.exe'
$env:WEBCAD_SERVICES_NATIVE_ACCEPTANCE=Join-Path $LocalRoot 'proofs/kernel-pair-a06-local.json'
foreach($file in @($hostPath,$env:WEBCAD_SERVICES_LOGO_WORKER,$env:WEBCAD_SERVICES_OCCT_WORKER,$env:WEBCAD_SERVICES_NATIVE_ACCEPTANCE)){if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Required local file missing: $file"}}
$env:WEBCAD_SERVICES_DATA_ROOT=Join-Path $LocalRoot 'data'
$env:WEBCAD_SERVICES_DEV_HTTP=$Http
$env:WEBCAD_SERVICES_ALLOWED_ORIGIN=$AllowedOrigin
& $hostPath --console
exit $LASTEXITCODE
