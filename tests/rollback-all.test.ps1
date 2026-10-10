param([string]$ScratchRoot='G:/CAD-Workspace/WebCAD/temp/r0-rollback',[string]$PythonExe='C:/Program Files/Python312/python.exe')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 3
$repo=Split-Path $PSScriptRoot;$source=Join-Path $repo 'scripts/rollback-all.ps1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors.Message -join '; ')}
# Load only parsed functions. Never execute the script entry point or native Apply.
$functions=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)
foreach($function in $functions){Invoke-Expression $function.Extent.Text}
$script:checks=0
function Check([bool]$Condition,[string]$Name){if(!$Condition){throw ('FAIL: '+$Name)};$script:checks++;Write-Output ('PASS fixture: '+$Name)}
function Reject([scriptblock]$Action,[string]$Name){$rejected=$false;try{& $Action|Out-Null}catch{$rejected=$true};Check $rejected $Name}
Check ($errors.Count -eq 0) 'PowerShell parser'
Reject {Absolute 'F:relative'} 'drive-relative path refused'
Reject {Absolute '\\server\share'} 'UNC path refused'
Reject {Absolute 'F:/file:stream'} 'alternate data stream refused'
Reject {Assert-LocalStorage 'G:/fixture' 'F:/Project/Goldenluck/Web'} 'runtime scope refused outside authorized F path'
Reject {Assert-Time ([DateTime]::UtcNow.AddSeconds(-1))} 'expired deadline refused'
Reject {New-RollbackPlan @{ApplyLocal=$true;DevelopmentConsole=$false}} 'legacy ApplyLocal explicitly refused'
Reject {New-RollbackPlan @{ApplyLocal=$false;DevelopmentConsole=$true}} 'legacy console explicitly refused'
if((Absolute $ScratchRoot) -notlike 'G:\CAD-Workspace\WebCAD\temp\r0-rollback*'){throw 'Fixtures must stay in the named G scratch tree'}
Assert-NoReparse $ScratchRoot
$fixture=Join-Path $ScratchRoot ('TEST-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($fixture)
function WriteFixture([string]$Path,[string]$Value){[void][IO.Directory]::CreateDirectory((Split-Path $Path));[IO.File]::WriteAllText($Path,$Value,[Text.UTF8Encoding]::new($false))}
function WriteFixtureJson([string]$Path,$Value){WriteFixture $Path ($Value|ConvertTo-Json -Depth 12)}
function SharedFixtureHash([string]$Path){
 $s=[IO.File]::Open($Path,'Open','Read','ReadWrite');$sha=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($sha.ComputeHash($s))).Replace('-','').ToLowerInvariant()}finally{$s.Dispose();$sha.Dispose()}
}
function NewPackage([string]$Id){
 $root=Join-Path $fixture "runtime/releases/$Id"
 foreach($row in @(@('host/WebCADServices.Host.exe','TEST host'),@('host/WebCADServices.Runtime.dll','TEST identical runtime'),@('gateway/bin/WebCADServices.Gateway.dll','TEST gateway '+$Id),@('workers/logo/LogoVector.Worker.exe','TEST logo'),@('workers/occt/WebCADOcctWorker.exe','TEST native'),@('workers/occt/libc++.dll','TEST dependency'),@('gateway/api.ashx','TEST handler'),@('gateway/web.config','<configuration><appSettings/><system.web><authentication mode="None"/></system.web></configuration>'),@('scripts/placeholder.txt','TEST not executable'),@('node/placeholder.txt','TEST not executable'))){WriteFixture (Join-Path $root $row[0]) $row[1]}
 $hashes=@{host=(FileHash "$root/host/WebCADServices.Host.exe");runtime=(FileHash "$root/host/WebCADServices.Runtime.dll");gateway=(FileHash "$root/gateway/bin/WebCADServices.Gateway.dll");logo=(FileHash "$root/workers/logo/LogoVector.Worker.exe");native=(FileHash "$root/workers/occt/WebCADOcctWorker.exe")}
 WriteFixtureJson "$root/configuration/kernel-pair.json" @{producerKernelBuildId=('native-occt@7.8.1:sha256:'+$hashes.native);codec='occt-text-brep-v1';brepVersion=3}
 WriteFixtureJson "$root/frontend/automation/index.json" @{metadata=@{buildId='TEST';pageApiVersion='1.0'}}
 WriteFixtureJson "$root/release-manifest.json" @{format='webcad-joint-build-v1';protocolVersion='1.0';frontendBuildId='TEST';pageApiVersion='1.0';binarySha256=$hashes;native=@{};documentVersions=@(1,2,3)}
 $rows=@(Tree $root|Where-Object{!$_.directory}|ForEach-Object{@{path=$_.relative;bytes=(Get-Item -LiteralPath $_.path).Length;sha256=(FileHash $_.path)}})
 WriteFixtureJson "$root/package-hashes.json" @{format='webcad-package-hashes-v1';releaseId=$Id;files=$rows}
 return Verify-Package $root $Id (FileHash "$root/package-hashes.json")
}
$current=NewPackage 'TEST-current';$target=NewPackage 'TEST-previous'
Check ($current.files.Count -eq 13) 'real hash inventory and joint package validation (including libc++.dll)'
Reject {Verify-Package $current.root 'TEST-other' $current.inventoryHash} 'package selected identity mismatch refused'
Reject {Verify-Package $current.root $current.id ('0'*64)} 'pinned inventory hash mismatch refused'
$native=Join-Path $target.root 'workers/occt/WebCADOcctWorker.exe';$bytes=[IO.File]::ReadAllBytes($native)
WriteFixture $native 'TEST tamper';Reject {Verify-Package $target.root $target.id $target.inventoryHash} 'binary tamper refused';[IO.File]::WriteAllBytes($native,$bytes)
WriteFixture "$($target.root)/unlisted.txt" 'TEST extra';Reject {Verify-Package $target.root $target.id $target.inventoryHash} 'unlisted package file refused';Remove-Item -LiteralPath "$($target.root)/unlisted.txt"
$link=Join-Path $fixture 'TEST-junction';New-Item -ItemType Junction -Path $link -Target $current.root|Out-Null
Reject {Assert-NoReparse "$link/host/WebCADServices.Host.exe"} 'ancestor reparse point refused'
# Keep the isolated junction for evidence; no recursive cleanup follows it.
$options=@{LocalRoot=(Join-Path $fixture 'runtime');GoldenluckWebRoot=(Join-Path $fixture 'site');Apply=$false;ApplyLocal=$false;DevelopmentConsole=$false;VerifiedLocalInputs=$true;SiteName='Default Web Site';SiteBaseUrl='http://localhost';AppPoolName='WebCADServices';ServiceName='WebCADServices';AllowedOrigin='http://127.0.0.1:17674';PipeName='WebCADServices-local';ExpectedCurrentReleaseId=$current.id;ExpectedPreviousReleaseId=$target.id;CurrentPackageInventorySha256=$current.inventoryHash;PreviousPackageInventorySha256=$target.inventoryHash;PythonExe=$PythonExe;ApplyTimeoutSeconds=120;RecoveryTimeoutSeconds=90}
$data=Join-Path $options.LocalRoot 'data';[void][IO.Directory]::CreateDirectory($data)
function NewConfig($Package){
 $dir=Join-Path $options.LocalRoot "configuration/$($Package.id)";$path=Join-Path $dir 'host.json'
 $transport=@{pipeName=$options.PipeName;allowedOrigin=$options.AllowedOrigin;connectTimeoutMs=2000;readTimeoutMs=5000;writeTimeoutMs=5000;authenticationTimeoutMs=3000;overallTimeoutMs=30000}
 WriteFixtureJson $path @{serviceName=$options.ServiceName;hostSid=(VirtualSid $options.ServiceName 80);gatewaySid=(VirtualSid $options.AppPoolName 82);provisionerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;dataRoot=$data;logoWorker="$($Package.root)/workers/logo/LogoVector.Worker.exe";nativeWorker="$($Package.root)/workers/occt/WebCADOcctWorker.exe";nativeAcceptance="$($Package.root)/configuration/kernel-pair.json";credentialFile="$dir/credential.dpapi";credentialFormat='service-current-user-dpapi';provisioningPipeName=('WebCADServices-provision-'+('0'*32));transport=$transport}
 WriteFixture "$dir/credential.dpapi" 'TEST dummy never read by rollback'
 $gateway=Join-Path $options.LocalRoot "gateway-configuration/$($Package.id)/appSettings.config";$xml=[xml]'<appSettings><clear/></appSettings>'
 foreach($entry in $transport.GetEnumerator()){$n=$xml.CreateElement('add');$n.SetAttribute('key','WebCAD.'+$entry.Key.Substring(0,1).ToUpperInvariant()+$entry.Key.Substring(1));$n.SetAttribute('value',[string]$entry.Value);[void]$xml.DocumentElement.AppendChild($n)}
 WriteFixture $gateway $xml.OuterXml
 # Fixture private ACLs use the actual test runner SID plus SYSTEM/admins only.
 foreach($folder in @($dir,(Split-Path $gateway))){Protect-Backup $folder}
 foreach($file in @($path,"$dir/credential.dpapi",$gateway)){
  $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','Allow'))};Set-Acl -LiteralPath $file -AclObject $acl
 }
 return Read-HostConfig $Package $options
}
$currentConfig=NewConfig $current;$targetConfig=NewConfig $target
Check ($targetConfig.config.credentialFormat -eq 'service-current-user-dpapi') 'existing Host metadata/private ACL/external settings validated without credential read'
Reject {Assert-ServiceCommand ((Service-Command $current $currentConfig).Replace('--service','--console')) $current $currentConfig} 'console service command refused'
Reject {Assert-ServiceCommand (Service-Command $current $currentConfig) $target $targetConfig} 'cross-release service command refused'
$cfgBytes=[IO.File]::ReadAllBytes($targetConfig.path);$bad=Read-Json $targetConfig.path;$bad.nativeWorker=$currentConfig.config.nativeWorker;WriteFixtureJson $targetConfig.path $bad
Reject {Read-HostConfig $target $options} 'cross-release worker path refused';[IO.File]::WriteAllBytes($targetConfig.path,$cfgBytes)
$xml=Read-Xml $targetConfig.gatewayPath;$xml.SelectSingleNode('/appSettings/add[@key="WebCAD.PipeName"]').SetAttribute('value','TEST-wrong');$xml.Save($targetConfig.gatewayPath)
Reject {Read-HostConfig $target $options} 'Gateway/Host transport drift refused'
$targetConfig=NewConfig $target
$gatewayRoot=Join-Path $options.GoldenluckWebRoot 'cadservices';[void][IO.Directory]::CreateDirectory($options.GoldenluckWebRoot)
Copy-Item -LiteralPath (Join-Path $current.root 'gateway') -Destination $gatewayRoot -Recurse
(Render-WebConfig $current $currentConfig.gatewayPath).Save((Join-Path $gatewayRoot 'web.config'))
$active=Join-Path $options.LocalRoot 'active-release.json'
WriteFixtureJson $active @{format='webcad-local-release-v1';releaseId=$current.id;previousReleaseId=$target.id;serviceName=$options.ServiceName;servicesUrl='http://localhost/cadservices/api.ashx';hostConfig=$currentConfig.path;productionInstalled=$false;dataSchema='services-v1'}
# Existing native pointer has an auto-inherited DACL. Prepare that same stable
# control flag in the TEST fixture before any rollback snapshot is taken.
Set-ExactAcl $active $false (Get-ExactAcl $active)
Reject {Assert-AtomicAcl 'O:SYG:SYD:(A;;FA;;;SY)'} 'unstable pointer ACL refused before publication'
# Real SQLite schema and job-state fixtures, never product/geometry/business data.
$dbScript=Join-Path $fixture 'TEST-store.py'
WriteFixture $dbScript @'
import sqlite3, sys
d=sqlite3.connect(sys.argv[1])
if sys.argv[2]=='wal-queued': d.execute('PRAGMA journal_mode=WAL')
schema={'assets':'id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL,kind TEXT NOT NULL', 'artifacts':'id TEXT PRIMARY KEY,owner TEXT NOT NULL,sha TEXT NOT NULL,bytes INTEGER NOT NULL', 'jobs':'id TEXT PRIMARY KEY,owner TEXT NOT NULL,idem TEXT NOT NULL,fingerprint TEXT NOT NULL,request TEXT NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL,result TEXT,error TEXT,cancel INTEGER NOT NULL DEFAULT 0,payload_hash TEXT,engine TEXT NOT NULL', 'job_events':'job TEXT NOT NULL,state TEXT NOT NULL,time TEXT NOT NULL','attempts':'job TEXT NOT NULL,pid INTEGER,started TEXT NOT NULL,finished TEXT,exit_code INTEGER','client_keys':'owner TEXT NOT NULL,idem TEXT NOT NULL,payload_hash TEXT NOT NULL,job TEXT NOT NULL,binding_json TEXT,PRIMARY KEY(owner,idem)'}
for t,cols in schema.items(): d.execute('CREATE TABLE IF NOT EXISTS '+t+'('+cols+')')
d.execute('DELETE FROM jobs')
if sys.argv[2]!='idle': d.execute("INSERT INTO jobs(id,owner,idem,fingerprint,request,state,created,engine) VALUES('TEST','TEST','TEST','TEST','{}',?,'TEST','logo')",('queued' if sys.argv[2]=='wal-queued' else sys.argv[2],))
d.commit()
if sys.argv[2]=='wal-queued': print('TEST WAL ready',flush=True);sys.stdin.readline()
d.close()
'@
function StoreState([string]$State){& $PythonExe -I $dbScript (Join-Path $data 'jobs.db') $State;if($LASTEXITCODE -ne 0){throw 'TEST fixture SQLite setup failed'}}
StoreState 'idle';$dbHash=FileHash (Join-Path $data 'jobs.db');Assert-StoreIdle $PythonExe $data
Check ((FileHash (Join-Path $data 'jobs.db')) -eq $dbHash) 'bounded SQLite idle read leaves database bytes unchanged'
foreach($state in @('queued','running','unknown')){StoreState $state;Reject {Assert-StoreIdle $PythonExe $data} ('job state '+$state+' refused')}
StoreState 'succeeded';Assert-StoreIdle $PythonExe $data;Check $true 'terminal jobs permitted'
StoreState 'idle'
$writer=[Diagnostics.Process]::new();$writer.StartInfo=[Diagnostics.ProcessStartInfo]::new($PythonExe,('-I "'+$dbScript+'" "'+(Join-Path $data 'jobs.db')+'" wal-queued'))
$writer.StartInfo.UseShellExecute=$false;$writer.StartInfo.CreateNoWindow=$true;$writer.StartInfo.RedirectStandardInput=$true;$writer.StartInfo.RedirectStandardOutput=$true
try{
 [void]$writer.Start();$ready=$writer.StandardOutput.ReadLineAsync();if(!$ready.Wait(3000) -or $ready.Result -ne 'TEST WAL ready'){throw 'TEST WAL writer readiness failed'}
 $walHash=SharedFixtureHash (Join-Path $data 'jobs.db-wal');$mainHash=SharedFixtureHash (Join-Path $data 'jobs.db')
 Reject {Assert-StoreIdle $PythonExe $data} 'committed queued job in live WAL refused by real mode=ro reader'
 Check ((SharedFixtureHash (Join-Path $data 'jobs.db-wal')) -ceq $walHash -and (SharedFixtureHash (Join-Path $data 'jobs.db')) -ceq $mainHash) 'read-only WAL check leaves database and WAL bytes unchanged'
}finally{$writer.StandardInput.Close();if(!$writer.WaitForExit(3000)){$writer.Kill()};$writer.Dispose()}
StoreState 'idle'
# Only the native read adapters and fixed-disk policy are replaced for this G
# fixture. Native services/IIS are never contacted. Validation stays real.
function Assert-LocalStorage([string]$Root,[string]$WebRoot){if(!(SamePath $Root (Join-Path $fixture 'runtime')) -or !(SamePath $WebRoot (Join-Path $fixture 'site'))){throw 'TEST fixture scope escaped'};Assert-NoReparse $Root;Assert-NoReparse $WebRoot}
function Read-IisSnapshot($Options){return [pscustomobject]@{site='TEST simulated IIS read';pool='TEST simulated pool read';anonymousUser='';gatewayRoot=$gatewayRoot}}
function Read-ServiceSnapshot($Options,$Package,$Config){return [pscustomobject]@{path=(Service-Command $Package $Config);startMode='Auto';state='TEST simulated read';pid=0}}
function Stop-SelectedService{throw 'TEST forbids any native service mutation'}
function Start-SelectedService{throw 'TEST forbids any native service mutation'}
function Change-SelectedService{throw 'TEST forbids any native service mutation'}
function Assert-GatewayPipe{throw 'TEST forbids any live IIS probe'}
$before=FileHash $active;$gatewayBefore=FileHash (Join-Path $gatewayRoot 'bin/WebCADServices.Gateway.dll')
$result=Invoke-Rollback $options|Out-String
Check ($result.Contains('Dry-run passed') -and (FileHash $active) -eq $before -and (FileHash (Join-Path $gatewayRoot 'bin/WebCADServices.Gateway.dll')) -eq $gatewayBefore) 'full dry-run fixture does not switch files/pointer or invoke mutation/probe adapters'
$options.ExpectedPreviousReleaseId='TEST-wrong';Reject {New-RollbackPlan $options} 'dry-run selected pointer mismatch refused';$options.ExpectedPreviousReleaseId=$target.id
$pointerBytes=[IO.File]::ReadAllBytes($active);$bad=Read-Json $active;$bad.dataSchema='TEST-next';WriteFixtureJson $active $bad
Reject {New-RollbackPlan $options} 'state schema mismatch refused';[IO.File]::WriteAllBytes($active,$pointerBytes)
$plan=New-RollbackPlan $options;$snapshot=@(Snapshot-Gateway $gatewayRoot)
$backup=Join-Path $fixture 'TEST-original-gateway';Copy-Item -LiteralPath $gatewayRoot -Destination $backup -Recurse
WriteFixture (Join-Path $gatewayRoot 'app_offline.htm') 'TEST gate'
$deadline=[DateTime]::UtcNow.AddSeconds(15)
Replace-Gateway $plan (Join-Path $target.root 'gateway') (Render-WebConfig $target $targetConfig.gatewayPath) $deadline
Assert-GatewayMatches $target $targetConfig $gatewayRoot $true
Check ((Test-Path -LiteralPath (Join-Path $gatewayRoot 'app_offline.htm')) -and (FileHash (Join-Path $gatewayRoot 'bin/WebCADServices.Gateway.dll')) -eq $target.manifest.binarySha256.gateway) 'fixture gateway replacement preserves gate and selects target bytes'
Replace-Gateway $plan $backup $null $deadline;Remove-Item -LiteralPath (Join-Path $gatewayRoot 'app_offline.htm')
Assert-GatewayMatches $current $currentConfig $gatewayRoot
$after=@(Snapshot-Gateway $gatewayRoot)
Check (($snapshot|ConvertTo-Json -Depth 8 -Compress) -ceq ($after|ConvertTo-Json -Depth 8 -Compress)) 'fixture gateway restoration preserves bytes and exact owner/group/DACL/SACL'
$acl=Get-ExactAcl $active;Write-Atomic $active ([Text.Encoding]::UTF8.GetBytes('{"TEST":"atomic"}')) $acl $deadline
Write-Atomic $active $pointerBytes $acl $deadline
Check ((FileHash $active) -eq $before -and (Get-ExactAcl $active) -ceq $acl) 'atomic pointer fixture restores original bytes and exact ACL'
Reject {Replace-Gateway $plan $backup $null ([DateTime]::UtcNow.AddSeconds(-1))} 'expired deadline blocks gateway mutation'
Write-Output "PASS: $script:checks targeted parser/dry-run/file-contract fixture checks. Real IIS/service rollback NOT executed. Fixture evidence: $fixture"
