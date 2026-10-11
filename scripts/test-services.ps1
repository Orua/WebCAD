param([Parameter(Mandatory=$true)][string]$BuildRoot,[Parameter(Mandatory=$true)][string]$DataRoot,[string]$RealLogoPdf,[int]$Page=1,[string]$NativeWorker,[string]$NativeAcceptance,[switch]$InfrastructureOnly)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
if([IO.Path]::GetFullPath($DataRoot) -notmatch '^[FG]:[\\/]'){throw 'Services tests require an explicit F: or G: data root'}
$env:WEBCAD_SERVICES_TEST_ROOT=[IO.Path]::GetFullPath($DataRoot)
$env:WEBCAD_SERVICES_TEST_BUILD_ROOT=[IO.Path]::GetFullPath($BuildRoot)
$env:WEBCAD_SERVICES_TEST_HOST=Join-Path $BuildRoot 'bin/WebCADServices.Host/Release/net48/WebCADServices.Host.exe'
$env:WEBCAD_SERVICES_TEST_LOGO_WORKER=Join-Path $BuildRoot 'bin/LogoVector.Worker/Release/net48/LogoVector.Worker.exe'
if($RealLogoPdf){$env:WEBCAD_REAL_LOGO_PDF=[IO.Path]::GetFullPath($RealLogoPdf);$env:WEBCAD_REAL_LOGO_PAGE="$Page"}
$tests=if($InfrastructureOnly){@('services-infrastructure')}else{@('services-settings','project-container','services-runtime','services-store-faults','services-infrastructure')}
if($InfrastructureOnly -and ($NativeWorker -or $NativeAcceptance -or $RealLogoPdf)){throw 'InfrastructureOnly excludes native/Logo geometry acceptance'}
if($NativeWorker -or $NativeAcceptance){
 if(!(Test-Path -LiteralPath $NativeWorker) -or !(Test-Path -LiteralPath $NativeAcceptance)){throw 'Actual native binary and kernel-pair evidence are required'}
 $env:WEBCAD_NATIVE_WORKER=[IO.Path]::GetFullPath($NativeWorker)
 $env:WEBCAD_NATIVE_ACCEPTANCE=[IO.Path]::GetFullPath($NativeAcceptance)
 $env:WEBCAD_NATIVE_TEST_ROOT=Join-Path $DataRoot 'native'
 $tests+=@('services-native-bridge','services-boolean-native','services-round-native','services-compute','services-relief','services-support-intent')
}
& node --test --test-concurrency=1 ($tests | ForEach-Object {if($_ -eq "services-infrastructure"){Join-Path $repoRoot "tests/services-infrastructure.mjs"}else{Join-Path $repoRoot "tests/$_.test.mjs"}})
exit $LASTEXITCODE
