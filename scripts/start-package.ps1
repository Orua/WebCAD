param([string]$LocalRoot='F:/WebCADServices-local',[switch]$DevelopmentConsole,[int]$PagePort=17780,[int]$ServicesPort=17781)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($LocalRoot) -notmatch '^F:[\\/]'){throw 'Runtime and data must be on fixed F: storage'}
$pointer=Get-Content -LiteralPath "$LocalRoot/active-release.json" -Encoding UTF8 -Raw | ConvertFrom-Json
if($pointer.format -ne 'webcad-local-release-v1' -or $pointer.releaseId -notmatch '^[a-zA-Z0-9_-]{1,80}$'){throw 'Invalid local release pointer'}
$release=Join-Path $LocalRoot "releases/$($pointer.releaseId)"
& "$release/node/node.exe" "$release/scripts/verify-package.mjs" $release;if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
if(!$DevelopmentConsole){
 if(!$pointer.serviceName -or !$pointer.servicesUrl -or !$pointer.hostConfig){throw 'No independent Host/IIS installation is recorded. Native installer must verify and apply the actual site first. Development console requires explicit -DevelopmentConsole.'}
 $service=Get-Service -Name $pointer.serviceName
 if($service.Status -ne 'Running'){throw 'Installed Host is not running. Native acceptance must start the named product service.'}
 @{status='service-running';releaseId=$pointer.releaseId;servicesUrl=$pointer.servicesUrl;serviceName=$pointer.serviceName;urlAcceptance='not checked by this status command'}|ConvertTo-Json
 return
}
Add-Type -AssemblyName System.Security
$env:WEBCAD_SERVICES_TOKEN=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes("$LocalRoot/configuration/credential.dpapi"),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
$env:WEBCAD_SERVICES_DATA_ROOT=Join-Path $LocalRoot 'data';[void][IO.Directory]::CreateDirectory($env:WEBCAD_SERVICES_DATA_ROOT)
$env:WEBCAD_SERVICES_LOGO_WORKER="$release/workers/logo/LogoVector.Worker.exe";$env:WEBCAD_SERVICES_OCCT_WORKER="$release/workers/occt/WebCADOcctWorker.exe";$env:WEBCAD_SERVICES_NATIVE_ACCEPTANCE="$release/configuration/kernel-pair.json"
$env:WEBCAD_SERVICES_PIPE_NAME='WebCADServices-local';$env:WEBCAD_SERVICES_DEV_HTTP="http://127.0.0.1:$ServicesPort/";$env:WEBCAD_SERVICES_ALLOWED_ORIGIN="http://127.0.0.1:$PagePort"
$env:WEBCAD_STATIC_ROOT="$release/frontend";$env:WEBCAD_STATIC_PORT="$PagePort"
$started=@()
try{
 $hostProcess=Start-Process -FilePath "$release/host/WebCADServices.Host.exe" -ArgumentList '--console' -WindowStyle Hidden -PassThru;$started+=$hostProcess
 $pageProcess=Start-Process -FilePath "$release/node/node.exe" -ArgumentList @("$release/scripts/serve-static.mjs") -WindowStyle Hidden -PassThru;$started+=$pageProcess
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do{
  if($hostProcess.HasExited -or $pageProcess.HasExited){throw 'Local package process exited before readiness'}
  try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$ServicesPort/v1/health" -Headers @{Authorization="Bearer $env:WEBCAD_SERVICES_TOKEN"} -TimeoutSec 1;$page=Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$PagePort/" -TimeoutSec 1;if($health.status -eq 'healthy' -and $page.StatusCode -eq 200){break}}catch{if([DateTime]::UtcNow -ge $deadline){throw};Start-Sleep -Milliseconds 100}
 }while([DateTime]::UtcNow -lt $deadline)
 $caps=Invoke-RestMethod -Uri "http://127.0.0.1:$ServicesPort/v1/capabilities" -Headers @{Authorization="Bearer $env:WEBCAD_SERVICES_TOKEN"} -TimeoutSec 2
 $proof=Get-Content -LiteralPath "$release/configuration/kernel-pair.json" -Encoding UTF8 -Raw | ConvertFrom-Json
 if($caps.protocolVersion -ne '1.0' -or ($caps.operations | Where-Object {$_.kernelBuildId -eq $proof.producerKernelBuildId}).Count -lt 1){throw 'Running Services protocol/kernel differs from installed package'}
 @{status='development-only';releaseId=$pointer.releaseId;pageUrl="http://127.0.0.1:$PagePort/";debugHttpUrl="http://127.0.0.1:$ServicesPort/api.ashx";hostPid=$hostProcess.Id;pagePid=$pageProcess.Id;productionDeployment=$false;iisAccepted=$false} | ConvertTo-Json
}catch{foreach($process in $started){if(!$process.HasExited){Stop-Process -Id $process.Id -Force}};throw}
finally{Remove-Item Env:WEBCAD_SERVICES_TOKEN -ErrorAction SilentlyContinue}
