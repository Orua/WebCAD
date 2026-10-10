param([Parameter(Mandatory=$true)][string]$BuildRoot,[Parameter(Mandatory=$true)][string]$DataRoot,[string]$RealLogoPdf,[string]$NativeWorker,[string]$NativeAcceptance)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot
Push-Location $repoRoot
try {
  & node scripts/check-contracts.mjs
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  $plan=& node scripts/select-change-impacts.mjs | ConvertFrom-Json
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  if($plan.unitTests.Count){& node --test --test-concurrency=1 $plan.unitTests; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
  if($plan.nativeChanges -and (!$NativeWorker -or !$NativeAcceptance)){throw 'Native changes require the actual worker and kernel-pair proof; supply NativeWorker and NativeAcceptance.'}
  if($plan.servicesRequired -or $plan.nativeChanges){& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/test-services.ps1" -BuildRoot $BuildRoot -DataRoot $DataRoot -RealLogoPdf $RealLogoPdf -NativeWorker $NativeWorker -NativeAcceptance $NativeAcceptance; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}}
  exit 0
} finally {Pop-Location}
