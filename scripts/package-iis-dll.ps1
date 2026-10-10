param([Parameter(Mandatory=$true)][string]$OutputRoot,[string]$ReleaseId=('iis-dll-'+(Get-Date -Format 'yyyyMMdd-HHmmss')),[Parameter(Mandatory=$true)][string]$BuildRoot,[Parameter(Mandatory=$true)][string]$FrontendRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$NativeAcceptance,[string]$LogoWorkerRoot)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($OutputRoot) -notmatch '^G:[\\/]' -or $ReleaseId -notmatch '^[A-Za-z0-9_-]{1,80}$'){throw 'Use G: output and a valid release name'}
$root=Join-Path $OutputRoot $ReleaseId
if(Test-Path -LiteralPath $root){throw 'Choose a fresh immutable package name'}
if(!$LogoWorkerRoot){$LogoWorkerRoot=Join-Path $BuildRoot 'bin/LogoVector.Worker/Release/net48'}
$proof=Get-Content -LiteralPath $NativeAcceptance -Raw|ConvertFrom-Json
$nativeHash=(Get-FileHash -LiteralPath $NativeWorker -Algorithm SHA256).Hash.ToLowerInvariant()
if($proof.status -ne 'passed' -or $proof.producerKernelBuildId -ne ('native-occt@7.8.1:sha256:'+$nativeHash)){throw 'Native binary lacks matching accepted evidence'}
function Copy-Programs([string]$Source,[string]$Target){
 if(!(Test-Path -LiteralPath $Source -PathType Container)){throw 'Required program folder is missing'}
 foreach($file in Get-ChildItem -LiteralPath $Source -Recurse -File){if($file.Extension -eq '.pdb'){continue};$relative=$file.FullName.Substring([IO.Path]::GetFullPath($Source).TrimEnd('\','/').Length+1);$destination=Join-Path $Target $relative;New-Item -ItemType Directory -Path (Split-Path $destination) -Force|Out-Null;Copy-Item -LiteralPath $file.FullName -Destination $destination}
}
Copy-Programs $FrontendRoot "$root/frontend"
Copy-Programs "$BuildRoot/bin/WebCADServices.Gateway/Release/net48" "$root/cadservices/bin"
Copy-Programs $LogoWorkerRoot "$root/cadservices/runtime/logo"
Copy-Programs (Split-Path ([IO.Path]::GetFullPath($NativeWorker))) "$root/cadservices/runtime/occt"
Copy-Item -LiteralPath $NativeAcceptance -Destination "$root/cadservices/runtime/kernel-pair.json"
foreach($name in @('api.ashx','web.config')){Copy-Item -LiteralPath "$PSScriptRoot/../services/WebCADServices/deploy/$name" -Destination "$root/cadservices/$name"}
if((Get-Content "$root/cadservices/api.ashx" -Raw) -notmatch 'Gateway.IisHandler' -or !(Test-Path "$root/cadservices/bin/WebCADServices.Runtime.dll")){throw 'ASHX/DLL entry is missing'}
$index=Get-Content "$FrontendRoot/automation/index.json" -Raw|ConvertFrom-Json
@{format='webcad-ashx-dll-v1';releaseId=$ReleaseId;frontendBuildId=$index.metadata.buildId;pageApiVersion=$index.metadata.pageApiVersion;transport='iis-ashx-dll-v1';hostServiceRequired=$false;nativeBinarySha256=$nativeHash;dataIncluded=$false;credentialsIncluded=$false}|ConvertTo-Json|Set-Content "$root/release-manifest.json" -Encoding UTF8
$entries=@(Get-ChildItem -LiteralPath $root -Recurse -File|ForEach-Object {@{path=$_.FullName.Substring($root.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{format='webcad-package-hashes-v1';releaseId=$ReleaseId;files=$entries}|ConvertTo-Json -Depth 5|Set-Content "$root/package-hashes.json" -Encoding UTF8
Write-Output "ASHX + DLL package: $root; no Host service executable or installation is included"
