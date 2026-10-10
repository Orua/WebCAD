[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$PackageRoot,
 [string]$LocalRoot='F:/WebCADServices-local',
 [ValidateSet('Preflight','LocalIntegration','Production')][string]$Mode='Preflight',
 [switch]$Apply,
 [switch]$ApplyLocal,
 [switch]$VerifiedSiteInputs,
 [switch]$ProductionAuthorized,
 [switch]$VerifiedDataBackup,
 [string]$SiteName,
 [string]$GoldenluckWebRoot,
 [string]$SiteBaseUrl,
 [string]$AllowedOrigin,
 [string]$AppPoolName='WebCADServicesGateway',
 [string]$ServiceName='WebCADServices',
 [string]$PipeName,
 [ValidateSet('CurrentUserDpapi','SecurePrompt')][string]$CredentialSource='CurrentUserDpapi',
 [int]$ConnectTimeoutMs=2000,[int]$ReadTimeoutMs=5000,[int]$WriteTimeoutMs=5000,
 [int]$AuthenticationTimeoutMs=3000,[int]$OverallTimeoutMs=30000
)
$ErrorActionPreference='Stop'
# ApplyLocal used to copy files only. Fail closed instead of silently changing its meaning.
if($ApplyLocal){throw 'ApplyLocal is retired. Use an explicit Mode, verified site inputs and -Apply.'}
function Absolute([string]$Path){if(!$Path -or ![IO.Path]::IsPathRooted($Path)){throw 'An absolute path is required'};[IO.Path]::GetFullPath($Path).TrimEnd('\','/')}
function Assert-NoReparse([string]$Path){
 $cursor=Absolute $Path
 while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Deployment paths cannot contain reparse points'};$parent=Split-Path $cursor;if($parent -eq $cursor){break};$cursor=$parent}
}
function PrivateAcl([string]$Path,[string[]]$ReadSids,[string[]]$WriteSids){
 $directory=Test-Path -LiteralPath $Path -PathType Container
 $acl=if($directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
 $acl.SetAccessRuleProtection($true,$false)
 $inherit=if($directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
 foreach($sid in @('S-1-5-18','S-1-5-32-544')+$WriteSids){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl',$inherit,'None','Allow'))}
 foreach($sid in $ReadSids){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'ReadAndExecute',$inherit,'None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
function Write-Json([string]$Path,$Object){
 $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
 try{[IO.File]::WriteAllText($temporary,($Object|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false));if(Test-Path -LiteralPath $Path){$backup=Join-Path (Split-Path $Path) ([IO.Path]::GetFileNameWithoutExtension($Path)+'.previous.json');[IO.File]::Replace($temporary,$Path,$backup)}else{[IO.File]::Move($temporary,$Path)}}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
function Invoke-Sc([string[]]$Arguments){& sc.exe @Arguments | Out-Null;if($LASTEXITCODE -ne 0){throw 'Product service configuration failed'}}
function Set-GatewayAnonymousIdentity([string]$Identity){
 [void][Reflection.Assembly]::LoadFrom((Join-Path $env:windir 'System32/inetsrv/Microsoft.Web.Administration.dll'))
 $manager=[Microsoft.Web.Administration.ServerManager]::new()
 try{$section=$manager.GetApplicationHostConfiguration().GetSection('system.webServer/security/authentication/anonymousAuthentication',"$SiteName/cadservices");$section['userName']=[string]$Identity;$manager.CommitChanges()}finally{$manager.Dispose()}
}
function VirtualSid([string]$Name,[int]$Authority){
 $sha=[Security.Cryptography.SHA1]::Create()
 try{$bytes=$sha.ComputeHash([Text.Encoding]::Unicode.GetBytes($Name.ToUpperInvariant()))}finally{$sha.Dispose()}
 $parts=for($index=0;$index -lt 5;$index++){[BitConverter]::ToUInt32($bytes,$index*4)}
 return 'S-1-5-'+$Authority+'-'+($parts -join '-')
}
function Snapshot-Acls([string]$Root){
 if(!(Test-Path -LiteralPath $Root)){return @()}
 $items=@(Get-Item -LiteralPath $Root)+@(Get-ChildItem -LiteralPath $Root -Recurse -Force | Select-Object -First 50001)
 if($items.Count -gt 50000){throw 'Permission migration exceeds the bounded installer size; use a separately reviewed data migration'}
 foreach($item in $items){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Permission migration cannot follow reparse points'}
  @{path=$item.FullName;directory=[bool]$item.PSIsContainer;sddl=(Get-Acl -LiteralPath $item.FullName).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)}
 }
}
function Restore-Acls($Rows){
 foreach($row in $Rows){Assert-RollbackTime;if(Test-Path -LiteralPath $row.path){$acl=if($row.directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()};$acl.SetSecurityDescriptorSddlForm($row.sddl,[Security.AccessControl.AccessControlSections]::Access);Set-Acl -LiteralPath $row.path -AclObject $acl}}
}
function Assert-RollbackTime{if($script:rollbackDeadline -and [DateTime]::UtcNow -ge $script:rollbackDeadline){throw 'Product rollback exceeded its 45-second budget; retain artifacts for native recovery'}}
function Assert-DataIdle([string]$Data){
 $lock=Join-Path $Data '.host.lock'
 if(Test-Path -LiteralPath $lock){try{$lease=[IO.File]::Open($lock,'Open','ReadWrite','None');$lease.Dispose()}catch{throw 'A Host still owns the SQLite root; stop only that product Host and make a consistent backup before applying'}}
}
function ChildPath([string]$Path){$target=Absolute $Path;if($target -ne $gatewayRoot){throw 'Rollback path escaped the verified cadservices directory'};Assert-NoReparse $target;return $target}
function Stop-Candidate{
 $service=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
 if($service -and $service.Status -ne 'Stopped'){Stop-Service -Name $ServiceName;$service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))}
}
$LocalRoot=Absolute $LocalRoot;$PackageRoot=Absolute $PackageRoot
if($LocalRoot -notmatch '^F:[\\/]' -or $LocalRoot -eq 'F:'){throw 'Services runtime must use a dedicated fixed F: directory'}
Assert-NoReparse $LocalRoot;Assert-NoReparse $PackageRoot
& node "$PSScriptRoot/verify-package.mjs" $PackageRoot
if($LASTEXITCODE -ne 0){throw 'Package integrity verification failed'}
$hashes=Get-Content -LiteralPath "$PackageRoot/package-hashes.json" -Encoding UTF8 -Raw | ConvertFrom-Json
$releaseId=$hashes.releaseId
if($releaseId -notmatch '^[a-zA-Z0-9_-]{1,80}$'){throw 'Invalid releaseId'}
$release=Join-Path $LocalRoot "releases/$releaseId"
$framework=Get-ItemProperty -LiteralPath 'HKLM:/SOFTWARE/Microsoft/NET Framework Setup/NDP/v4/Full' -Name Release
if($framework.Release -lt 528040 -or ![Environment]::Is64BitOperatingSystem){throw '.NET Framework 4.8 and x64 Windows are required'}
if(!$VerifiedSiteInputs -or !$SiteName -or !$GoldenluckWebRoot -or !$SiteBaseUrl -or !$AllowedOrigin){throw 'Preflight requires -VerifiedSiteInputs and explicit SiteName, GoldenluckWebRoot, SiteBaseUrl, AllowedOrigin'}
if($ServiceName -notmatch '^[A-Za-z0-9_-]{1,80}$' -or $AppPoolName -notmatch '^[A-Za-z0-9_-]{1,80}$'){throw 'Dedicated service and pool names are required'}
if(!$PipeName){$PipeName="WebCADServices-$ServiceName"}
if($PipeName -notmatch '^[A-Za-z0-9_-]{1,120}$'){throw 'Invalid pipeName'}
foreach($value in @($ConnectTimeoutMs,$ReadTimeoutMs,$WriteTimeoutMs,$AuthenticationTimeoutMs,$OverallTimeoutMs)){if($value -lt 100 -or $value -gt 60000){throw 'Deadlines must be 100..60000 ms'}}
if(($ConnectTimeoutMs,$ReadTimeoutMs,$WriteTimeoutMs,$AuthenticationTimeoutMs|Measure-Object -Maximum).Maximum -gt $OverallTimeoutMs){throw 'Phase deadline exceeds overall deadline'}
$origin=[Uri]$AllowedOrigin;$base=[Uri]$SiteBaseUrl
if(!$origin.IsAbsoluteUri -or $origin.Scheme -notin @('http','https') -or $origin.GetLeftPart([UriPartial]::Authority) -cne $AllowedOrigin -or $origin.UserInfo){throw 'AllowedOrigin must be one exact HTTP(S) origin'}
if(!$base.IsAbsoluteUri -or $base.Scheme -notin @('http','https') -or $base.AbsolutePath -ne '/' -or $base.Query -or $base.Fragment -or $base.UserInfo){throw 'SiteBaseUrl must identify the verified root site binding'}
if($base.Scheme -ne 'https' -and !$base.IsLoopback){throw 'Non-loopback Services requires HTTPS'}
if($Mode -eq 'Production' -and (($Apply -and !$ProductionAuthorized) -or $base.Scheme -ne 'https')){throw 'Production Apply requires explicit ProductionAuthorized and HTTPS'}
if($Mode -eq 'LocalIntegration' -and !$base.IsLoopback){throw 'LocalIntegration requires a loopback site URL'}
if($Apply -and $Mode -eq 'Preflight'){throw 'Preflight never applies; select LocalIntegration or Production'}
Import-Module WebAdministration
$handlers=Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/handlers' -Name collection
if(!@($handlers | Where-Object {$_.name -like 'SimpleHandlerFactory-Integrated-4.0*'}).Count){throw 'IIS ASP.NET v4 Integrated ASHX handler is missing; native installer must verify the Windows ASP.NET 4.8 feature before Apply'}
$site=Get-Item -LiteralPath "IIS:/Sites/$SiteName"
$GoldenluckWebRoot=Absolute $GoldenluckWebRoot
$actualRoot=Absolute ([Environment]::ExpandEnvironmentVariables($site.physicalPath))
if($GoldenluckWebRoot -ine $actualRoot){throw 'Supplied web root differs from the actual IIS site root'}
Assert-NoReparse $GoldenluckWebRoot
if($LocalRoot.StartsWith($GoldenluckWebRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $GoldenluckWebRoot.StartsWith($LocalRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $LocalRoot -ieq $GoldenluckWebRoot){throw 'Private Services runtime and ERP web root must not overlap'}
$matches=@(Get-WebBinding -Name $SiteName | Where-Object {
 $parts=$_.bindingInformation -split ':'
 $_.protocol -eq $base.Scheme -and [int]$parts[$parts.Length-2] -eq $base.Port -and ($parts[-1] -eq '' -or $parts[-1] -ieq $base.Host)
})
if($matches.Count -ne 1){throw 'Site URL does not resolve to one verified IIS binding'}
if($site.applicationPool -eq $AppPoolName){throw 'Gateway must use a separate pool from ERP'}
$poolUses=@(foreach($candidateSite in Get-Website){
 if($candidateSite.applicationPool -eq $AppPoolName){$candidateSite.Name}
 foreach($candidateApp in Get-WebApplication -Site $candidateSite.Name){if($candidateApp.applicationPool -eq $AppPoolName -and !($candidateSite.Name -eq $SiteName -and $candidateApp.Path -eq '/cadservices')){$candidateApp.Path}}
})
if($poolUses.Count -gt 0){throw 'The selected pool is already shared by another application'}
$gatewayRoot=Absolute (Join-Path $GoldenluckWebRoot 'cadservices');Assert-NoReparse $gatewayRoot
$oldApp=Get-WebApplication -Site $SiteName -Name 'cadservices' -ErrorAction SilentlyContinue
 $oldAnonymousUser=if($oldApp){[string](Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location "$SiteName/cadservices" -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name userName).Value}else{'IUSR'}
if((Test-Path -LiteralPath $gatewayRoot) -and !$oldApp){throw 'Unregistered cadservices directory exists; refusing to overwrite unrelated files'}
if($oldApp -and ((Absolute $oldApp.physicalPath) -ine $gatewayRoot -or $oldApp.applicationPool -ne $AppPoolName)){throw 'Existing child application differs from the explicitly verified target'}
$oldService=Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if($oldService -and ($oldService.State -ne 'Stopped' -or $oldService.StartName -ine "NT SERVICE\$ServiceName")){throw 'Existing product service must already be stopped and use its dedicated virtual account'}
if($oldService){
 if($oldService.PathName -notmatch '^"(?<program>[^"]+WebCADServices\.Host\.exe)" --service --config "(?<config>[^"]+)"$'){throw 'Existing service is not an installed persistent-config product Host'}
 if(!(Absolute $Matches.program).StartsWith($LocalRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or !(Absolute $Matches.config).StartsWith($LocalRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Existing Host service does not belong to this verified private runtime'}
}
$dataRoot=Join-Path $LocalRoot 'data';Assert-DataIdle $dataRoot
if($Apply -and (Test-Path -LiteralPath (Join-Path $dataRoot 'jobs.db')) -and !$VerifiedDataBackup){throw 'Existing SQLite requires an explicitly verified consistent backup before account/release migration; use VerifiedDataBackup only after native acceptance'}
$hostSid=VirtualSid $ServiceName 80
$poolSid=$null
if(Test-Path -LiteralPath "IIS:/AppPools/$AppPoolName"){$poolSid=([Security.Principal.NTAccount]::new('IIS APPPOOL',$AppPoolName)).Translate([Security.Principal.SecurityIdentifier]).Value}
$provisionerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$transport=[ordered]@{pipeName=$PipeName;allowedOrigin=$AllowedOrigin;connectTimeoutMs=$ConnectTimeoutMs;readTimeoutMs=$ReadTimeoutMs;writeTimeoutMs=$WriteTimeoutMs;authenticationTimeoutMs=$AuthenticationTimeoutMs;overallTimeoutMs=$OverallTimeoutMs}
$servicesUrl=$SiteBaseUrl.TrimEnd('/')+'/cadservices/api.ashx'
$plan=[ordered]@{format='webcad-r1-integration-plan-v1';mode=$Mode;apply=[bool]$Apply;releaseId=$releaseId;site=$SiteName;webRoot=$GoldenluckWebRoot;childApplication='/cadservices';pool=$AppPoolName;poolSid=$poolSid;hostIdentity="NT SERVICE\$ServiceName";hostSid=$hostSid;servicesUrl=$servicesUrl;transport=$transport;maxResourceBytes=20971520;dataRoot=$dataRoot;productionInstalled=$false}
if(!$Apply){$plan|ConvertTo-Json -Depth 5;Write-Output 'Preflight passed. No files, credentials, IIS, services or processes were changed.';return}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Apply requires an elevated installer identity'}
if(Test-Path -LiteralPath $release){throw 'Immutable release already exists; use a fresh releaseId'}
$configRoot=Join-Path $LocalRoot "configuration/$releaseId";$hostConfig=Join-Path $configRoot 'host.json';$credentialFile=Join-Path $configRoot 'credential.dpapi'
$gatewayConfigRoot=Join-Path $LocalRoot "gateway-configuration/$releaseId";$gatewayConfig=Join-Path $gatewayConfigRoot 'appSettings.config'
$rollbackRoot=Join-Path $LocalRoot ('rollbacks/'+$releaseId+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
$oldPool=Get-Item -LiteralPath "IIS:/AppPools/$AppPoolName" -ErrorAction SilentlyContinue
if($oldPool -and ($oldPool.managedRuntimeVersion -ne 'v4.0' -or [string]$oldPool.managedPipelineMode -notin @('Integrated','0') -or $oldPool.enable32BitAppOnWin64 -or [string]$oldPool.processModel.identityType -notin @('ApplicationPoolIdentity','4'))){throw 'Existing pool differs from the required dedicated net48 x64 Integrated pool'}
$createdService=$false;$createdPool=$false;$changedApp=$false;$startedCandidate=$false;$token=$null;$oldActive=$null
$active=Join-Path $LocalRoot 'active-release.json'
$dataAcls=@();$gatewayAcls=@()
if(Test-Path -LiteralPath $active){$oldActive=[IO.File]::ReadAllBytes($active)}
try{
 if(!$oldPool){New-WebAppPool -Name $AppPoolName|Out-Null;$createdPool=$true}
 $poolSid=([Security.Principal.NTAccount]::new('IIS APPPOOL',$AppPoolName)).Translate([Security.Principal.SecurityIdentifier]).Value
 if($poolSid -notmatch '^S-1-5-82-'){throw 'Registered pool has no exact application pool SID'}
 $plan.poolSid=$poolSid
 [void][IO.Directory]::CreateDirectory($rollbackRoot);PrivateAcl $rollbackRoot @() @($provisionerSid)
 $dataAcls=@(Snapshot-Acls $dataRoot)
 if($oldApp){$gatewayAcls=@(Snapshot-Acls $gatewayRoot);Copy-Item -LiteralPath $gatewayRoot -Destination (Join-Path $rollbackRoot 'gateway') -Recurse}
 Write-Json (Join-Path $rollbackRoot 'original-acls.json') @{data=$dataAcls;gateway=$gatewayAcls}
 if($oldActive){[IO.File]::WriteAllBytes((Join-Path $rollbackRoot 'original-active-release.json'),$oldActive)}
 [void][IO.Directory]::CreateDirectory((Split-Path $release));Copy-Item -LiteralPath $PackageRoot -Destination $release -Recurse
 & "$release/node/node.exe" "$release/scripts/verify-package.mjs" $release;if($LASTEXITCODE -ne 0){throw 'Installed release integrity verification failed'}
 PrivateAcl $release @($hostSid) @($provisionerSid)
 foreach($folder in @($configRoot,$gatewayConfigRoot,$dataRoot)){Assert-NoReparse $folder;[void][IO.Directory]::CreateDirectory($folder)}
 PrivateAcl $configRoot @() @($hostSid,$provisionerSid)
 PrivateAcl $gatewayConfigRoot @($poolSid) @($provisionerSid)
 PrivateAcl $dataRoot @() @($hostSid,$provisionerSid)
 foreach($row in $dataAcls){PrivateAcl $row.path @() @($hostSid,$provisionerSid)}
 $config=[ordered]@{serviceName=$ServiceName;hostSid=$hostSid;gatewaySid=$poolSid;provisionerSid=$provisionerSid;dataRoot=$dataRoot;logoWorker="$release/workers/logo/LogoVector.Worker.exe";nativeWorker="$release/workers/occt/WebCADOcctWorker.exe";nativeAcceptance="$release/configuration/kernel-pair.json";credentialFile=$credentialFile;credentialFormat='service-current-user-dpapi';provisioningPipeName=('WebCADServices-provision-'+[Guid]::NewGuid().ToString('N'));transport=$transport}
 Write-Json $hostConfig $config;PrivateAcl $hostConfig @($hostSid) @($provisionerSid)
 $xml=[xml]'<appSettings><clear /></appSettings>'
 foreach($item in $transport.GetEnumerator()){$element=$xml.CreateElement('add');$element.SetAttribute('key','WebCAD.'+$item.Key.Substring(0,1).ToUpperInvariant()+$item.Key.Substring(1));$element.SetAttribute('value',[string]$item.Value);[void]$xml.DocumentElement.AppendChild($element)}
 $xml.Save($gatewayConfig);PrivateAcl $gatewayConfig @($poolSid) @($provisionerSid)
 Add-Type -AssemblyName System.Security
 if($CredentialSource -eq 'CurrentUserDpapi'){
  $source=Join-Path $LocalRoot 'configuration/credential.dpapi';Assert-NoReparse $source
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($source),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try{$token=[Text.Encoding]::UTF8.GetString($plain)}finally{[Array]::Clear($plain,0,$plain.Length)}
 }else{
  $secure=Read-Host 'Existing Services authorization (input hidden; never saved as plaintext)' -AsSecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}
 }
 if(!$token -or $token.Length -lt 32 -or $token.Length -gt 4096 -or $token.Contains("`r") -or $token.Contains("`n")){throw 'Services authorization is invalid'}

 Set-ItemProperty -LiteralPath "IIS:/AppPools/$AppPoolName" -Name managedRuntimeVersion -Value 'v4.0'
 Set-ItemProperty -LiteralPath "IIS:/AppPools/$AppPoolName" -Name managedPipelineMode -Value 'Integrated'
 Set-ItemProperty -LiteralPath "IIS:/AppPools/$AppPoolName" -Name enable32BitAppOnWin64 -Value $false
 Set-ItemProperty -LiteralPath "IIS:/AppPools/$AppPoolName" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
 $changedApp=$true
 if(Test-Path -LiteralPath $gatewayRoot){Remove-Item -LiteralPath (ChildPath $gatewayRoot) -Recurse -Force}
 Copy-Item -LiteralPath "$release/gateway" -Destination $gatewayRoot -Recurse
 PrivateAcl $gatewayRoot @($poolSid) @($provisionerSid)
 $webConfig=Join-Path $gatewayRoot 'web.config';$web=[xml](Get-Content -LiteralPath $webConfig -Encoding UTF8 -Raw)
 # appSettings file accepts an absolute path; configSource does not permit a path outside the web directory.
 $web.SelectSingleNode('/configuration/appSettings').SetAttribute('file',$gatewayConfig);$web.Save($webConfig)
 if(!$oldApp){New-WebApplication -Site $SiteName -Name 'cadservices' -PhysicalPath $gatewayRoot -ApplicationPool $AppPoolName|Out-Null}
 # Use the dedicated pool for anonymous file access; shared IUSR cannot read the scoped Gateway ACL.
 Set-GatewayAnonymousIdentity ''
 $binary='"'+$release+'/host/WebCADServices.Host.exe" --service --config "'+$hostConfig+'"'
 if($oldService){$result=Invoke-CimMethod -InputObject $oldService -MethodName Change -Arguments @{PathName=$binary;StartMode='Automatic'};if($result.ReturnValue -ne 0){throw 'Service update failed'}}
 else{
  $result=Invoke-CimMethod -ClassName Win32_Service -MethodName Create -Arguments @{Name=$ServiceName;DisplayName=$ServiceName;PathName=$binary;ServiceType=[byte]16;ErrorControl=[byte]1;StartMode='Automatic';DesktopInteract=$false;StartName="NT SERVICE\$ServiceName"}
  if($result.ReturnValue -ne 0){throw 'Dedicated virtual-account service creation failed'}
  $createdService=$true;Invoke-Sc -Arguments @('sidtype',$ServiceName,'unrestricted')
 }
 if(([Security.Principal.NTAccount]::new('NT SERVICE',$ServiceName)).Translate([Security.Principal.SecurityIdentifier]).Value -ne $hostSid){throw 'Registered Host SID differs from the planned exact SID'}
 Assert-DataIdle $dataRoot
 $startedCandidate=$true;Invoke-Sc -Arguments @('start',$ServiceName)
 # Only an anonymous stdin pipe transports plaintext to the local provisioner process.
 $process=[Diagnostics.Process]::new();$process.StartInfo=[Diagnostics.ProcessStartInfo]::new("$release/host/WebCADServices.Host.exe",('--provision-credential --config "'+$hostConfig+'"'))
 $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true;$process.StartInfo.RedirectStandardInput=$true;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
 [void]$process.Start();$process.StandardInput.WriteLine($token);$process.StandardInput.Close()
 if(!$process.WaitForExit(16000)){throw 'Credential provisioning exceeded its deadline; candidate service requires bounded rollback'}
 if($process.ExitCode -ne 0){$detail=$process.StandardError.ReadToEnd().Replace($token,'[redacted]');if($detail.Length -gt 600){$detail=$detail.Substring(0,600)};throw ('Final-context credential provisioning failed: '+$detail)}
 $process.Dispose()
 (Get-Service $ServiceName).WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
 $gatewayBuild='sha256:'+(Get-FileHash -LiteralPath "$release/gateway/bin/WebCADServices.Gateway.dll" -Algorithm SHA256).Hash.ToLowerInvariant()
 $hostBuild='sha256:'+(Get-FileHash -LiteralPath "$release/host/WebCADServices.Host.exe" -Algorithm SHA256).Hash.ToLowerInvariant()
 $deadline=[DateTime]::UtcNow.AddSeconds(20);$verified=$false
 do{
  try{
   $response=Invoke-WebRequest -UseBasicParsing -Uri ($servicesUrl+'?route=/v1/health') -Headers @{Authorization="Bearer $token";Origin=$AllowedOrigin} -TimeoutSec 3
   $body=$response.Content|ConvertFrom-Json
   if($response.StatusCode -eq 200 -and $body.status -eq 'healthy' -and $body.hostMode -eq 'service' -and $response.Headers['X-WebCAD-Transport'] -eq 'iis-ashx-pipe-v1' -and $response.Headers['X-WebCAD-Gateway-Build'] -eq $gatewayBuild){$verified=$true;break}
  }catch{Start-Sleep -Milliseconds 200}
 }while([DateTime]::UtcNow -lt $deadline)
 if(!$verified){throw 'Actual IIS health URL failed bounded acceptance; inspect HTTP substatus and Gateway marker locally'}
 $caps=Invoke-RestMethod -Uri ($servicesUrl+'?route=/v1/capabilities') -Headers @{Authorization="Bearer $token";Origin=$AllowedOrigin} -TimeoutSec 3
 if($caps.protocolVersion -ne '1.0' -or @($caps.operations).Count -eq 0 -or $caps.hostBuildId -ne $hostBuild){throw 'Actual IIS capabilities lacks the candidate Host build or accepted native operations'}
 $plan.productionInstalled=($Mode -eq 'Production');Write-Json (Join-Path $configRoot 'local-integration-plan.json') $plan
 Write-Json $active @{format='webcad-local-release-v1';releaseId=$releaseId;previousReleaseId=$(if($oldActive){([Text.Encoding]::UTF8.GetString($oldActive)|ConvertFrom-Json).releaseId}else{$null});serviceName=$ServiceName;servicesUrl=$servicesUrl;hostConfig=$hostConfig;productionInstalled=$plan.productionInstalled;dataSchema='services-v1'}
 Write-Output "Installed $releaseId; independent service $ServiceName; verified IIS URL $servicesUrl. Geometry and page acceptance remain separate."
}catch{
 $failure=$_.Exception.Message+'; '+$_.ScriptStackTrace
 $script:rollbackDeadline=[DateTime]::UtcNow.AddSeconds(45)
 try{
  if($startedCandidate){Stop-Candidate};Assert-DataIdle $dataRoot
  Assert-RollbackTime
  if($createdService){Invoke-Sc -Arguments @('delete',$ServiceName)}elseif($oldService){$restoreMode=if($oldService.StartMode -eq 'Auto'){'Automatic'}else{$oldService.StartMode};$restored=Invoke-CimMethod -InputObject $oldService -MethodName Change -Arguments @{PathName=$oldService.PathName;StartMode=$restoreMode};if($restored.ReturnValue -ne 0){throw 'Previous service command restoration failed'}}
  if($changedApp){
   Assert-RollbackTime
   if(!$oldApp){Remove-WebApplication -Site $SiteName -Name 'cadservices' -ErrorAction SilentlyContinue}
   if(Test-Path -LiteralPath $gatewayRoot){Remove-Item -LiteralPath (ChildPath $gatewayRoot) -Recurse -Force}
   if($oldApp){Copy-Item -LiteralPath (Join-Path $rollbackRoot 'gateway') -Destination $gatewayRoot -Recurse;Restore-Acls $gatewayAcls}
   Set-GatewayAnonymousIdentity $oldAnonymousUser
  }
  if($createdPool){Remove-WebAppPool -Name $AppPoolName}
  Restore-Acls $dataAcls
  Assert-RollbackTime
  if($oldActive){[IO.File]::WriteAllBytes($active,$oldActive)}elseif(Test-Path -LiteralPath $active){Remove-Item -LiteralPath $active}
 }catch{$rollbackFailure=$_.Exception.Message;if($token){$failure=$failure.Replace($token,'[redacted]');$rollbackFailure=$rollbackFailure.Replace($token,'[redacted]')};throw ('Installation error: '+$failure+'; rollback error: '+$rollbackFailure)}
 throw ('Installation failed; product gateway/service command/pointer restored. SQLite and releases were retained. '+$failure)
}finally{$token=$null}
