param([Parameter(Mandatory=$true)][string]$OutputRoot,[string]$ReleaseId=('iis-dll-'+(Get-Date -Format 'yyyyMMdd-HHmmss')),[Parameter(Mandatory=$true)][string]$BuildRoot,[Parameter(Mandatory=$true)][string]$FrontendRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$NativeAcceptance,[string]$LogoWorkerRoot,[switch]$ParentApplication)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($OutputRoot) -notmatch '^G:[\\/]' -or $ReleaseId -notmatch '^[A-Za-z0-9_-]{1,80}$'){throw 'Use G: output and a valid release name'}
$root=Join-Path $OutputRoot $ReleaseId
if(Test-Path -LiteralPath $root){throw 'Choose a fresh immutable package name'}
if(!$LogoWorkerRoot){$LogoWorkerRoot=if($ParentApplication){Join-Path $BuildRoot 'worker/bin/LogoVector.Worker/Release/net48'}else{Join-Path $BuildRoot 'bin/LogoVector.Worker/Release/net48'}}
$proof=Get-Content -LiteralPath $NativeAcceptance -Raw|ConvertFrom-Json
$nativeHash=(Get-FileHash -LiteralPath $NativeWorker -Algorithm SHA256).Hash.ToLowerInvariant()
if($proof.status -ne 'passed' -or $proof.producerKernelBuildId -ne ('native-occt@7.8.1:sha256:'+$nativeHash)){throw 'Native binary lacks matching accepted evidence'}
$gatewayRoot=Join-Path $BuildRoot 'bin/WebCADServices.Gateway/Release/net48'
if($ParentApplication){
 foreach($required in @('WebCADServices.Contracts.dll','WebCADServices.Gateway.dll','WebCADServices.Logo.dll','WebCADServices.Runtime.dll','LogoVector.Contracts.dll','LogoVector.Geometry.dll','Newtonsoft.Json.dll','System.Data.SQLite.dll','x64/SQLite.Interop.dll','x86/SQLite.Interop.dll')){
  if(!(Test-Path -LiteralPath (Join-Path $gatewayRoot $required) -PathType Leaf)){throw "Parent application dependency is missing: $required"}
 }
}
function Copy-Programs([string]$Source,[string]$Target){
 if(!(Test-Path -LiteralPath $Source -PathType Container)){throw 'Required program folder is missing'}
 foreach($file in Get-ChildItem -LiteralPath $Source -Recurse -File){if($file.Extension -eq '.pdb'){continue};$relative=$file.FullName.Substring([IO.Path]::GetFullPath($Source).TrimEnd('\','/').Length+1);$destination=Join-Path $Target $relative;New-Item -ItemType Directory -Path (Split-Path $destination) -Force|Out-Null;Copy-Item -LiteralPath $file.FullName -Destination $destination}
}
Copy-Programs $FrontendRoot "$root/frontend"
if($ParentApplication){
 New-Item -ItemType Directory -Path "$root/bin" -Force|Out-Null
 $dependencies=@(foreach($file in Get-ChildItem -LiteralPath $gatewayRoot -File -Recurse){
  if($file.Extension -eq '.pdb'){continue}
  $relative=$file.FullName.Substring([IO.Path]::GetFullPath($gatewayRoot).TrimEnd('\','/').Length+1).Replace('\','/')
  $owned=$relative -match '^WebCADServices\.[A-Za-z]+\.dll$'
  $packagePath=if($owned){"bin/$relative"}else{"parent-dependencies/bin/$relative"}
  $destination=Join-Path $root $packagePath
  New-Item -ItemType Directory -Path (Split-Path $destination) -Force|Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $destination
  $assembly=$null
  try{$assembly=[Reflection.AssemblyName]::GetAssemblyName($file.FullName).FullName}catch [BadImageFormatException]{}
  @{packagePath=$packagePath;requiredDestination="bin/$relative";assemblyIdentity=$assembly;fileVersion=$file.VersionInfo.FileVersion;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();placement=if($owned){'application-bin'}else{'review-before-bin'}}
 })
 @{format='webcad-parent-application-dependencies-v1';automaticSharedDependencyOverwrite=$false;framework='net48';managedArchitecture='AnyCPU';requiredFiles=$dependencies}|ConvertTo-Json -Depth 6|Set-Content "$root/parent-application-dependencies.json" -Encoding UTF8
 Copy-Item -LiteralPath "$PSScriptRoot/../services/WebCADServices/deploy/PARENT-APPLICATION-INSTALL.md" -Destination "$root/PARENT-APPLICATION-INSTALL.md"
}else{Copy-Programs $gatewayRoot "$root/cadservices/bin"}
Copy-Programs $LogoWorkerRoot "$root/cadservices/runtime/logo"
Copy-Programs (Split-Path ([IO.Path]::GetFullPath($NativeWorker))) "$root/cadservices/runtime/occt"
Copy-Item -LiteralPath $NativeAcceptance -Destination "$root/cadservices/runtime/kernel-pair.json"
Copy-Item -LiteralPath "$PSScriptRoot/../services/WebCADServices/deploy/api.ashx" -Destination "$root/cadservices/api.ashx"
if(!$ParentApplication){Copy-Item -LiteralPath "$PSScriptRoot/../services/WebCADServices/deploy/web.config" -Destination "$root/cadservices/web.config"}
$runtimeDll=if($ParentApplication){"$root/bin/WebCADServices.Runtime.dll"}else{"$root/cadservices/bin/WebCADServices.Runtime.dll"}
if((Get-Content "$root/cadservices/api.ashx" -Raw) -notmatch 'Gateway.IisHandler' -or !(Test-Path $runtimeDll)){throw 'ASHX/DLL entry is missing'}
$index=Get-Content "$FrontendRoot/automation/index.json" -Raw|ConvertFrom-Json
@{format='webcad-ashx-dll-v1';releaseId=$ReleaseId;frontendBuildId=$index.metadata.buildId;pageApiVersion=$index.metadata.pageApiVersion;transport='iis-ashx-dll-v1';hostServiceRequired=$false;parentApplication=[bool]$ParentApplication;sharedDependencyReviewRequired=[bool]$ParentApplication;nativeBinarySha256=$nativeHash;dataIncluded=$false;credentialsIncluded=$false}|ConvertTo-Json|Set-Content "$root/release-manifest.json" -Encoding UTF8
$entries=@(Get-ChildItem -LiteralPath $root -Recurse -File|ForEach-Object {@{path=$_.FullName.Substring($root.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{format='webcad-package-hashes-v1';releaseId=$ReleaseId;files=$entries}|ConvertTo-Json -Depth 5|Set-Content "$root/package-hashes.json" -Encoding UTF8
Write-Output "ASHX + DLL package: $root; no Host service executable or installation is included"
