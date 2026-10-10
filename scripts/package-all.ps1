param([string]$LocalRoot='F:/WebCADServices-local',[Parameter(Mandatory=$true)][string]$OutputRoot,[string]$ReleaseId=('local-'+(Get-Date -Format 'yyyyMMdd-HHmmss')),[string]$BuildRoot,[string]$FrontendRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$NativeAcceptance)
$ErrorActionPreference='Stop'
if($ReleaseId -notmatch '^[a-zA-Z0-9_-]{1,80}$'){throw 'Invalid release name'}
if([IO.Path]::GetFullPath($OutputRoot) -notmatch '^G:[\\/]'){throw 'Generated packages belong on G:'}
$packageRoot=Join-Path $OutputRoot $ReleaseId
if(Test-Path -LiteralPath $packageRoot){throw 'Package already exists; choose a fresh release name'}
if(!$BuildRoot){$BuildRoot=Join-Path $LocalRoot 'build'}
if(!$FrontendRoot){$FrontendRoot=Join-Path $LocalRoot 'frontend-dist'}
if(!(Test-Path -LiteralPath $NativeWorker -PathType Leaf) -or !(Test-Path -LiteralPath $NativeAcceptance -PathType Leaf)){throw 'Supply an actual Native worker and its matching acceptance proof'}
$nativeRoot=Split-Path ([IO.Path]::GetFullPath($NativeWorker))
& node "$PSScriptRoot/write-services-manifest.mjs" $BuildRoot $FrontendRoot "$OutputRoot/$ReleaseId-manifest.json" $NativeWorker $NativeAcceptance
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
[void][IO.Directory]::CreateDirectory($packageRoot)
function Copy-ProgramTree([string]$Source,[string]$Destination){
 if(!(Test-Path -LiteralPath $Source -PathType Container)){throw "Required program folder missing: $Source"}
 foreach($file in (Get-ChildItem -LiteralPath $Source -Recurse -File)){
  $relative=$file.FullName.Substring([IO.Path]::GetFullPath($Source).TrimEnd('\','/').Length+1)
  if($relative -match '(^|[\\/])acceptance([\\/]|$)' -or $file.Extension -eq '.pdb'){continue}
  $target=Join-Path $Destination $relative;[void][IO.Directory]::CreateDirectory((Split-Path $target));Copy-Item -LiteralPath $file.FullName -Destination $target
 }
}
Copy-ProgramTree $FrontendRoot "$packageRoot/frontend"
Copy-ProgramTree "$BuildRoot/bin/WebCADServices.Host/Release/net48" "$packageRoot/host"
Copy-ProgramTree "$BuildRoot/bin/LogoVector.Worker/Release/net48" "$packageRoot/workers/logo"
Copy-ProgramTree $nativeRoot "$packageRoot/workers/occt"
Copy-ProgramTree "$BuildRoot/bin/WebCADServices.Gateway/Release/net48" "$packageRoot/gateway/bin"
[void][IO.Directory]::CreateDirectory("$packageRoot/configuration")
Copy-Item -LiteralPath $NativeAcceptance -Destination "$packageRoot/configuration/kernel-pair.json"
Copy-Item -LiteralPath "$OutputRoot/$ReleaseId-manifest.json" -Destination "$packageRoot/release-manifest.json"
foreach($file in @('api.ashx','web.config')){Copy-Item -LiteralPath "$PSScriptRoot/../services/WebCADServices/deploy/$file" -Destination "$packageRoot/gateway/$file"}
[void][IO.Directory]::CreateDirectory("$packageRoot/node")
Copy-Item -LiteralPath (Get-Command node).Source -Destination "$packageRoot/node/node.exe"
$nodeLicense=Join-Path (Split-Path (Get-Command node).Source) 'LICENSE';if(Test-Path -LiteralPath $nodeLicense){Copy-Item -LiteralPath $nodeLicense -Destination "$packageRoot/node/LICENSE"}
[void][IO.Directory]::CreateDirectory("$packageRoot/scripts")
foreach($file in @('serve-static.mjs','verify-package.mjs','start-package.ps1','install-services.ps1','rollback-all.ps1')){Copy-Item -LiteralPath "$PSScriptRoot/$file" -Destination "$packageRoot/scripts/$file"}
$entries=@(Get-ChildItem -LiteralPath $packageRoot -Recurse -File | ForEach-Object {@{path=$_.FullName.Substring($packageRoot.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
@{format='webcad-package-hashes-v1';releaseId=$ReleaseId;files=$entries} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$packageRoot/package-hashes.json" -Encoding UTF8
& node "$PSScriptRoot/verify-package.mjs" $packageRoot
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Output "Local package: $packageRoot (deploymentReady=false; no installation or deployment performed)"
