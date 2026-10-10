param([string]$BuildRoot='F:/WebCADServices-local/build',[switch]$ParentApplication)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
$resolved=[IO.Path]::GetFullPath($BuildRoot)
if($resolved -notmatch '^F:[\\/]'){throw 'Services build output must be on a fixed local F: path'}
$env:WEBCAD_BUILD_ROOT=$resolved
# Parent IIS applications can be either 32-bit or 64-bit. Native workers stay
# separate executables; the managed gateway must not force an ERP pool change.
if($ParentApplication){
 & dotnet build (Join-Path $repoRoot 'services/WebCADServices/src/WebCADServices.Gateway/WebCADServices.Gateway.csproj') -c Release -p:PlatformTarget=AnyCPU
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 $env:WEBCAD_BUILD_ROOT=Join-Path $resolved 'worker'
 & dotnet build (Join-Path $repoRoot 'services/WebCADServices/modules/LogoVector/src/LogoVector.Worker/LogoVector.Worker.csproj') -c Release
}else{& dotnet build (Join-Path $repoRoot 'services/WebCADServices/WebCADServices.sln') -c Release}
exit $LASTEXITCODE
