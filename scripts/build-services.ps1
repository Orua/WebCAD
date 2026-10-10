param([string]$BuildRoot='F:/WebCADServices-local/build')
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
$resolved=[IO.Path]::GetFullPath($BuildRoot)
if($resolved -notmatch '^F:[\\/]'){throw 'Services build output must be on a fixed local F: path'}
$env:WEBCAD_BUILD_ROOT=$resolved
& dotnet build (Join-Path $repoRoot 'services/WebCADServices/WebCADServices.sln') -c Release
exit $LASTEXITCODE
