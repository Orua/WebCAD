param([string]$LocalRoot='F:/WebCADServices-local',[switch]$RebuildNative)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
if([IO.Path]::GetFullPath($LocalRoot) -notmatch '^F:[\\/]'){throw 'Required program outputs use fixed F: storage'}
Push-Location $repoRoot
try{
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/build-services.ps1" -BuildRoot "$LocalRoot/build"
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 if($RebuildNative){& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/build-native-worker.ps1" -BuildRoot "$LocalRoot/native-build" -InstallRoot "$LocalRoot/runtime/native-rebuilt";if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
 $env:WEBCAD_DIST_DIR=Join-Path $LocalRoot 'frontend-dist'
 & npm.cmd run build
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 & node scripts/check-contracts.mjs
 exit $LASTEXITCODE
}finally{Pop-Location}
