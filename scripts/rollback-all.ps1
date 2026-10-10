[CmdletBinding()]
param(
 [string]$LocalRoot='F:/WebCADServices-local',
 [switch]$Apply,[switch]$ApplyLocal,[switch]$DevelopmentConsole,[switch]$VerifiedLocalInputs,
 [string]$SiteName,[string]$GoldenluckWebRoot,[string]$SiteBaseUrl,[string]$AppPoolName,
 [string]$ServiceName,[string]$AllowedOrigin,[string]$PipeName,
 [string]$ExpectedCurrentReleaseId,[string]$ExpectedPreviousReleaseId,
 [string]$CurrentPackageInventorySha256,[string]$PreviousPackageInventorySha256,[string]$PythonExe,[string]$RuntimeCompatibilityProofSha256,
 [ValidateRange(90,180)][int]$ApplyTimeoutSeconds=120,
 [ValidateRange(45,120)][int]$RecoveryTimeoutSeconds=90
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 3
# R0 changes no credentials, immutable packages, database, ERP root configuration,
# pool lifecycle, workers or geometry. Missing legacy inputs fail closed.
function Absolute([string]$Path){
 if(!$Path -or $Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.Substring(2).Contains(':') -or $Path -match '["\x00-\x1f]'){throw 'A local absolute path without streams is required'}
 return [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
}
function SamePath([string]$Left,[string]$Right){return (Absolute $Left) -ieq (Absolute $Right)}
function Assert-NoReparse([string]$Path){
 $cursor=Absolute $Path
 while($cursor){
  if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Rollback paths cannot contain reparse points'}
  $parent=Split-Path $cursor;if($parent -eq $cursor){break};$cursor=$parent
 }
}
function Assert-LocalStorage([string]$Root,[string]$WebRoot){
 if(!(SamePath $Root 'F:/WebCADServices-local') -or !(SamePath $WebRoot 'F:/Project/Goldenluck/Web')){throw 'R0 permits only the explicitly authorized fixed local runtime and site root'}
 Assert-NoReparse $Root;Assert-NoReparse $WebRoot
}
function Read-Json([string]$Path,[long]$Limit=65536){
 Assert-NoReparse $Path;$item=Get-Item -LiteralPath $Path -Force
 if($item.PSIsContainer -or $item.Length -gt $Limit){throw 'JSON input exceeds its bounded file contract'}
 return Get-Content -LiteralPath $Path -Encoding UTF8 -Raw | ConvertFrom-Json
}
function Property($Object,[string]$Name){if($Object -and $Object.PSObject.Properties[$Name]){return $Object.$Name};return $null}
function Assert-Time($Deadline){if($Deadline -and [DateTime]::UtcNow -ge $Deadline){throw 'R0 deadline exceeded; retain the backup for native recovery'}}
function RemainingMs($Deadline,[int]$Maximum){Assert-Time $Deadline;return [int][Math]::Max(1,[Math]::Min($Maximum,[Math]::Floor(($Deadline-[DateTime]::UtcNow).TotalMilliseconds)))}
function Tree([string]$Root,[int]$MaxFiles=20000,[long]$MaxBytes=2147483648){
 Assert-NoReparse $Root
 $queue=[Collections.Generic.Queue[string]]::new();$queue.Enqueue((Absolute $Root));$rows=[Collections.Generic.List[object]]::new();$bytes=0L
 while($queue.Count){foreach($item in Get-ChildItem -LiteralPath $queue.Dequeue() -Force){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'A bounded tree contains a reparse point'}
  $relative=$item.FullName.Substring((Absolute $Root).Length+1).Replace('\','/')
  $rows.Add([pscustomobject]@{path=$item.FullName;relative=$relative;directory=[bool]$item.PSIsContainer})
  if($rows.Count -gt $MaxFiles){throw 'Tree exceeds its bounded entry limit'}
  if($item.PSIsContainer){$queue.Enqueue($item.FullName)}else{$bytes+=$item.Length;if($bytes -gt $MaxBytes){throw 'Tree exceeds its bounded byte limit'}}
 }}
 return $rows.ToArray()
}
function FileHash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Verify-Package([string]$Root,[string]$Id,[string]$InventoryHash){
 Assert-NoReparse $Root
 if($Id -notmatch '^[A-Za-z0-9_-]{1,80}$' -or $InventoryHash -cnotmatch '^[a-f0-9]{64}$'){throw 'Explicit selected identity and trusted SHA-256 inventory are required'}
 $inventory=Join-Path $Root 'package-hashes.json';Assert-NoReparse $inventory
 if((FileHash $inventory) -cne $InventoryHash){throw 'Pinned package inventory hash mismatch'}
 $list=Read-Json $inventory 8388608
 if($list.format -ne 'webcad-package-hashes-v1' -or $list.releaseId -cne $Id -or @($list.files).Count -lt 10 -or @($list.files).Count -gt 20000){throw 'Selected package identity/inventory mismatch'}
 $names=@{};$totalBytes=0L
 foreach($row in $list.files){
  if(($row.bytes -isnot [int] -and $row.bytes -isnot [long]) -or $row.bytes -lt 0 -or $row.bytes -gt 1073741824){throw 'Package entry exceeds its integer/byte bound'}
  $totalBytes+=$row.bytes;if($totalBytes -gt 2147483648){throw 'Package inventory exceeds its aggregate byte bound'}
  if($row.path -notmatch '^[A-Za-z0-9_./@+-]+$' -or $row.path.StartsWith('/') -or @($row.path.Split('/')|Where-Object{$_ -in @('','.','..') -or $_.EndsWith('.')}).Count -or $names.ContainsKey($row.path) -or $row.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $row.bytes -lt 0){throw 'Invalid package hash entry'}
  $file=Join-Path $Root $row.path;Assert-NoReparse $file;$item=Get-Item -LiteralPath $file -Force
  if($item.PSIsContainer -or $item.Length -ne $row.bytes -or (FileHash $file) -cne $row.sha256){throw 'Immutable package file verification failed'}
  $names[$row.path]=$row
 }
 foreach($row in @(Tree $Root)){if(!$row.directory -and $row.relative -ne 'package-hashes.json' -and !$names.ContainsKey($row.relative)){throw 'Package contains an unlisted file'}}
 $joint=Read-Json (Join-Path $Root 'release-manifest.json') 1048576
 if($joint.format -ne 'webcad-joint-build-v1' -or $joint.protocolVersion -ne '1.0'){throw 'Unsupported joint package protocol'}
 foreach($entry in @(@('host','host/WebCADServices.Host.exe'),@('runtime','host/WebCADServices.Runtime.dll'),@('gateway','gateway/bin/WebCADServices.Gateway.dll'),@('logo','workers/logo/LogoVector.Worker.exe'),@('native','workers/occt/WebCADOcctWorker.exe'))){
  if(!$names.ContainsKey($entry[1]) -or $joint.binarySha256.($entry[0]) -cne $names[$entry[1]].sha256){throw 'Joint binary identity mismatch'}
 }
 $proof=Read-Json (Join-Path $Root 'configuration/kernel-pair.json') 1048576;$index=Read-Json (Join-Path $Root 'frontend/automation/index.json') 8388608
 if($proof.producerKernelBuildId -cne ('native-occt@7.8.1:sha256:'+$joint.binarySha256.native) -or $proof.codec -ne 'occt-text-brep-v1' -or $proof.brepVersion -ne 3 -or $joint.frontendBuildId -cne $index.metadata.buildId -or $joint.pageApiVersion -cne $index.metadata.pageApiVersion){throw 'Joint frontend/kernel identity mismatch'}
 if((Property $joint.native 'proofSha256') -and $joint.native.proofSha256 -cne $names['configuration/kernel-pair.json'].sha256){throw 'Joint native proof identity mismatch'}
 return [pscustomobject]@{root=(Absolute $Root);id=$Id;inventoryHash=$InventoryHash;files=$names;manifest=$joint}
}
function VirtualSid([string]$Name,[int]$Authority){
 if($Authority -eq 82){
  $sid=([Security.Principal.NTAccount]::new('IIS APPPOOL',$Name)).Translate([Security.Principal.SecurityIdentifier]).Value
  if($sid -notmatch '^S-1-5-82-'){throw 'Registered pool has no exact application pool SID'}
  return $sid
 }
 $sha=[Security.Cryptography.SHA1]::Create();try{$bytes=$sha.ComputeHash([Text.Encoding]::Unicode.GetBytes($Name.ToUpperInvariant()))}finally{$sha.Dispose()}
 $parts=for($i=0;$i -lt 5;$i++){[BitConverter]::ToUInt32($bytes,$i*4)};return 'S-1-5-'+$Authority+'-'+($parts -join '-')
}
function Assert-PrivateAcl([string]$Path,[string[]]$Allowed){
 Assert-NoReparse $Path;$acl=Get-Acl -LiteralPath $Path
 if(!$acl.AreAccessRulesProtected){throw 'Existing private configuration must have protected ACLs'}
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $Allowed){throw 'Existing private configuration grants an unrelated identity access'}}
}
function Read-Xml([string]$Path){
 Assert-NoReparse $Path;if((Get-Item -LiteralPath $Path).Length -gt 65536){throw 'XML configuration exceeds its bound'}
 $settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing='Prohibit';$settings.XmlResolver=$null
 $reader=[Xml.XmlReader]::Create($Path,$settings);$xml=[Xml.XmlDocument]::new();$xml.XmlResolver=$null
 try{$xml.Load($reader)}finally{$reader.Dispose()};return ,$xml
}
function Read-HostConfig($Package,$Options){
 $path=Join-Path $Options.LocalRoot "configuration/$($Package.id)/host.json";$c=Read-Json $path 16384
 $expected=@{dataRoot=(Join-Path $Options.LocalRoot 'data');logoWorker=(Join-Path $Package.root 'workers/logo/LogoVector.Worker.exe');nativeWorker=(Join-Path $Package.root 'workers/occt/WebCADOcctWorker.exe');nativeAcceptance=(Join-Path $Package.root 'configuration/kernel-pair.json');credentialFile=(Join-Path (Split-Path $path) 'credential.dpapi')}
 if($c.serviceName -cne $Options.ServiceName -or $c.hostSid -ne (VirtualSid $Options.ServiceName 80) -or $c.gatewaySid -ne (VirtualSid $Options.AppPoolName 82) -or $c.credentialFormat -ne 'service-current-user-dpapi' -or $c.provisioningPipeName -notmatch '^WebCADServices-provision-[a-fA-F0-9]{32}$' -or $c.provisionerSid -notmatch '^S-1-5-'){throw 'Host selected service/pool/credential identity mismatch'}
 foreach($entry in $expected.GetEnumerator()){if(!(SamePath $c.($entry.Key) $entry.Value)){throw 'Host configuration escaped the selected immutable release/private paths'};Assert-NoReparse $entry.Value;if(!(Test-Path -LiteralPath $entry.Value)){throw 'Required existing private configuration/program/data is missing'}}
 # Encrypted credential: existence and ACL only. Never open, hash, or reprovision it.
 $allow=@($c.hostSid,$c.provisionerSid,'S-1-5-18','S-1-5-32-544')
 foreach($private in @((Split-Path $path),$path,$expected.credentialFile)){Assert-PrivateAcl $private $allow}
 $t=$c.transport
 if($t.pipeName -cne $Options.PipeName -or $t.allowedOrigin -cne $Options.AllowedOrigin){throw 'Existing Host transport differs from verified local inputs'}
 foreach($name in @('connectTimeoutMs','readTimeoutMs','writeTimeoutMs','authenticationTimeoutMs','overallTimeoutMs')){if($t.$name -lt 100 -or $t.$name -gt 60000 -or $t.$name -gt $t.overallTimeoutMs){throw 'Invalid existing transport deadline'}}
 $gatewayPath=Join-Path $Options.LocalRoot "gateway-configuration/$($Package.id)/appSettings.config";Assert-NoReparse $gatewayPath
 foreach($private in @((Split-Path $gatewayPath),$gatewayPath)){Assert-PrivateAcl $private @($c.gatewaySid,$c.provisionerSid,'S-1-5-18','S-1-5-32-544')}
 $xml=Read-Xml $gatewayPath
 if($xml.DocumentElement.Name -ne 'appSettings' -or $xml.DocumentElement.Attributes.Count -or @($xml.SelectNodes('/appSettings/*')).Count -ne 8 -or @($xml.SelectNodes('/appSettings/clear')).Count -ne 1 -or @($xml.SelectNodes('/appSettings/add')).Count -ne 7){throw 'Gateway settings must contain only the seven token-free transport fields'}
 $seen=@{}
 foreach($node in $xml.SelectNodes('/appSettings/add')){
  $name=$node.GetAttribute('key');$key=$name.Substring([Math]::Min(7,$name.Length));if($key){$key=$key.Substring(0,1).ToLowerInvariant()+$key.Substring(1)}
  if($node.Attributes.Count -ne 2 -or !$name.StartsWith('WebCAD.') -or $key -notin @('pipeName','allowedOrigin','connectTimeoutMs','readTimeoutMs','writeTimeoutMs','authenticationTimeoutMs','overallTimeoutMs') -or $seen.ContainsKey($key) -or $node.GetAttribute('value') -cne [string]$t.$key){throw 'External Gateway/Host transport mismatch'};$seen[$key]=$true
 }
 return [pscustomobject]@{path=(Absolute $path);gatewayPath=(Absolute $gatewayPath);config=$c}
}
function Render-WebConfig($Package,[string]$ExternalPath){
 $web=Read-Xml (Join-Path $Package.root 'gateway/web.config');$settings=$web.SelectSingleNode('/configuration/appSettings')
 if(!$settings -or $settings.HasChildNodes -or $settings.Attributes.Count){throw 'Package web.config must have an empty appSettings element'}
 $settings.SetAttribute('file',$ExternalPath);return ,$web
}
function Read-IisSnapshot($Options){
 [void][Reflection.Assembly]::LoadFrom((Join-Path $env:windir 'System32/inetsrv/Microsoft.Web.Administration.dll'))
 $m=[Microsoft.Web.Administration.ServerManager]::new()
 try{
  $site=$m.Sites[$Options.SiteName];$pool=$m.ApplicationPools[$Options.AppPoolName]
  if(!$site -or !$pool -or [string]$site.State -ne 'Started' -or [string]$pool.State -ne 'Started'){throw 'Verified local site and dedicated pool must already be started'}
  if(!(SamePath ([Environment]::ExpandEnvironmentVariables($site.Applications['/'].VirtualDirectories['/'].PhysicalPath)) $Options.GoldenluckWebRoot) -or $site.Applications['/'].ApplicationPoolName -eq $Options.AppPoolName){throw 'Actual root site or dedicated pool differs from verified inputs'}
  $uri=[Uri]$Options.SiteBaseUrl
  $bindings=@($site.Bindings|Where-Object{$_.Protocol -eq $uri.Scheme -and $_.EndPoint.Port -eq $uri.Port -and ($_.Host -eq '' -or $_.Host -ieq $uri.Host) -and $_.EndPoint.Address.ToString() -in @('0.0.0.0','127.0.0.1','::','::1')})
  if($bindings.Count -ne 1){throw 'Loopback URL does not match exactly one verified site binding'}
  foreach($s in $m.Sites){foreach($a in $s.Applications){if($a.ApplicationPoolName -eq $Options.AppPoolName -and !($s.Name -eq $Options.SiteName -and $a.Path -eq '/cadservices')){throw 'Selected pool is shared by another application'}}}
  $app=$site.Applications['/cadservices']
  if(!$app -or $app.ApplicationPoolName -ne $Options.AppPoolName -or !(SamePath $app.VirtualDirectories['/'].PhysicalPath (Join-Path $Options.GoldenluckWebRoot 'cadservices')) -or $app.VirtualDirectories.Count -ne 1){throw 'Actual child application differs from the selected cadservices target'}
  if($pool.ManagedRuntimeVersion -ne 'v4.0' -or [string]$pool.ManagedPipelineMode -ne 'Integrated' -or $pool.Enable32BitAppOnWin64 -or [string]$pool.ProcessModel.IdentityType -ne 'ApplicationPoolIdentity'){throw 'Dedicated pool must be net48/x64/Integrated with its pool identity'}
  $anonymous=$m.GetApplicationHostConfiguration().GetSection('system.webServer/security/authentication/anonymousAuthentication',($Options.SiteName+'/cadservices'))
  if(!$anonymous['enabled'] -or [string]$anonymous['userName'] -ne ''){throw 'cadservices anonymous access must already use the exact pool identity'}
  return [pscustomobject]@{site=$site.Name;pool=$pool.Name;anonymousUser='';gatewayRoot=(Absolute $app.VirtualDirectories['/'].PhysicalPath)}
 }finally{$m.Dispose()}
}
function Service-Command($Package,$Config){return '"'+(Join-Path $Package.root 'host/WebCADServices.Host.exe')+'" --service --config "'+$Config.path+'"'}
function Assert-ServiceCommand([string]$Command,$Package,$Config){
 if($Command -notmatch '^"(?<program>[^"]+)" --service --config "(?<config>[^"]+)"$'){throw 'Installed service is not the selected persistent-config Host'}
 if(!(SamePath $Matches.program (Join-Path $Package.root 'host/WebCADServices.Host.exe')) -or !(SamePath $Matches.config $Config.path)){throw 'Installed service path/config does not match the selected release'}
}
function Read-ServiceSnapshot($Options,$Package,$Config){
 $s=Get-CimInstance Win32_Service -Filter ("Name='"+$Options.ServiceName+"'") -OperationTimeoutSec 5
 if(!$s -or $s.StartName -ine ('NT SERVICE\'+$Options.ServiceName) -or $s.State -ne 'Running' -or $s.ServiceType -ne 'Own Process' -or $s.StartMode -ne 'Auto'){throw 'Selected service must be running as its dedicated automatic own-process virtual account'}
 Assert-ServiceCommand $s.PathName $Package $Config
 $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$s.ProcessId) -OperationTimeoutSec 5
 if(!$p -or !(SamePath $p.ExecutablePath (Join-Path $Package.root 'host/WebCADServices.Host.exe'))){throw 'Running Host process differs from the selected service executable'}
 Assert-ServiceCommand $p.CommandLine $Package $Config
 return [pscustomobject]@{path=$s.PathName;startMode=$s.StartMode;state=$s.State;pid=[int]$s.ProcessId}
}
function Assert-StoreIdle([string]$PythonExe,[string]$DataRoot,$Deadline=$null){
 Assert-NoReparse $PythonExe;Assert-NoReparse $DataRoot
 foreach($name in @('jobs.db','jobs.db-wal','jobs.db-shm','.host.lock')){Assert-NoReparse (Join-Path $DataRoot $name)}
 if(!(Test-Path -LiteralPath (Join-Path $DataRoot 'jobs.db') -PathType Leaf)){throw 'Existing services-v1 database is required; R0 never creates one'}
 # mode=ro (NOT immutable=1) observes committed WAL. Deny writes/DDL/attach;
 # query_only, one snapshot, progress deadline, busy timeout and process timeout.
 $code=@'
import json, sqlite3, sys, pathlib, time
try:
 deadline=time.monotonic()+3
 db=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True,timeout=0.25)
 db.execute('PRAGMA query_only=ON')
 db.set_authorizer(lambda op,a,b,c,d: sqlite3.SQLITE_OK if op in (sqlite3.SQLITE_SELECT,sqlite3.SQLITE_READ,sqlite3.SQLITE_FUNCTION,sqlite3.SQLITE_TRANSACTION) or op==sqlite3.SQLITE_PRAGMA and a=='table_info' else sqlite3.SQLITE_DENY)
 db.set_progress_handler(lambda: int(time.monotonic()>=deadline),1000)
 db.execute('BEGIN')
 required={'assets':'id owner name sha bytes kind','artifacts':'id owner sha bytes','jobs':'id owner idem fingerprint request state created result error cancel payload_hash engine','job_events':'job state time','attempts':'job pid started finished exit_code','client_keys':'owner idem payload_hash job binding_json'}
 integers={'assets':{'bytes'},'artifacts':{'bytes'},'jobs':{'cancel'},'attempts':{'pid','exit_code'}}
 nullable={'assets':{'id'},'artifacts':{'id'},'jobs':{'id','result','error','payload_hash'},'attempts':{'pid','finished','exit_code'},'client_keys':{'binding_json'}}
 primary={'assets':{'id':1},'artifacts':{'id':1},'jobs':{'id':1},'client_keys':{'owner':1,'idem':2}}
 for table,cols in required.items():
  rows=list(db.execute('PRAGMA table_info('+table+')'))
  if {r[1] for r in rows}!=set(cols.split()): raise ValueError('schema')
  for r in rows:
   if r[2].upper()!=('INTEGER' if r[1] in integers.get(table,set()) else 'TEXT') or r[3]!=int(r[1] not in nullable.get(table,set())) or r[5]!=primary.get(table,{}).get(r[1],0): raise ValueError('schema')
 if db.execute("SELECT 1 FROM sqlite_master WHERE type='trigger' LIMIT 1").fetchone(): raise ValueError('trigger')
 busy=db.execute("SELECT 1 FROM jobs WHERE state IN ('queued','running') LIMIT 1").fetchone() is not None
 unknown=db.execute("SELECT 1 FROM jobs WHERE state IS NULL OR state NOT IN ('queued','running','succeeded','failed','terminated','interrupted','cancelled') OR engine NOT IN ('logo','occt') LIMIT 1").fetchone() is not None
 db.rollback();db.close()
 print(json.dumps({'schema':'services-v1','busy':busy,'unknown':unknown}))
except Exception:
 print('{"error":"bounded read-only store check failed"}');sys.exit(2)
'@
 $process=[Diagnostics.Process]::new();$process.StartInfo=[Diagnostics.ProcessStartInfo]::new((Absolute $PythonExe))
 $process.StartInfo.Arguments='-I -c "'+$code.Replace('"','\"')+'" "'+(Join-Path (Absolute $DataRoot) 'jobs.db')+'"'
 $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
 try{
  Assert-Time $Deadline;[void]$process.Start();$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
  $wait=if($Deadline){RemainingMs $Deadline 5000}else{5000}
  if(!$process.WaitForExit($wait)){$process.Kill();throw 'Read-only store check exceeded its deadline'}
  if($process.ExitCode -ne 0 -or $out.Result.Length -gt 1024 -or $err.Result.Length){throw 'Bounded read-only store/schema check failed'}
  $result=$out.Result|ConvertFrom-Json
  if($result.schema -ne 'services-v1' -or $result.busy -or $result.unknown){throw 'Rollback refused: active/queued jobs or unknown job states/schema'}
 }finally{$process.Dispose()}
 Assert-Time $Deadline
}
function Assert-DataLeaseFree([string]$DataRoot){
 $path=Join-Path $DataRoot '.host.lock';Assert-NoReparse $path
 if(!(Test-Path -LiteralPath $path)){throw 'Expected existing Host ownership lock is missing'}
 try{$lease=[IO.File]::Open($path,'Open','Read','None');$lease.Dispose()}catch{throw 'A Host still owns the data root; no second Host may start'}
}
function Get-ExactAcl([string]$Path){return (Get-Acl -LiteralPath $Path -Audit).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)}
function Assert-AtomicAcl([string]$Sddl){
 $descriptor=[Security.AccessControl.RawSecurityDescriptor]::new($Sddl)
 $stable=[Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInherited -bor [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected
 if(!($descriptor.ControlFlags -band $stable)){throw 'Pointer ACL must already have stable inherited/protected control flags; R0 refuses to normalize original permissions'}
}
function Snapshot-Gateway([string]$Root){
 $items=@([pscustomobject]@{path=$Root;relative='';directory=$true})+@(Tree $Root 256 67108864)
 foreach($row in $items){[pscustomobject]@{relative=$row.relative;directory=$row.directory;sddl=(Get-ExactAcl $row.path);sha256=$(if(!$row.directory){FileHash $row.path}else{$null})}}
}
function Assert-GatewayMatches($Package,$Config,[string]$Root,[bool]$Gated=$false){
 $rows=@(Tree $Root 256 67108864);$packageRows=@(Tree (Join-Path $Package.root 'gateway') 256 67108864)
 if($Gated){$gate=Join-Path $Root 'app_offline.htm';if(!(Test-Path -LiteralPath $gate -PathType Leaf)){throw 'R0 child admission gate is missing'};$rows=@($rows|Where-Object{$_.relative -cne 'app_offline.htm'})}
 $a=@($rows|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object);$b=@($packageRows|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object)
 if(($a -join '|') -cne ($b -join '|')){throw 'Installed gateway contains extra/missing files; refusing to overwrite unrelated content'}
 foreach($row in $rows){if(!$row.directory){
  if($row.relative -eq 'web.config'){$actual=Read-Xml $row.path;$expected=Render-WebConfig $Package $Config.gatewayPath;if($actual.OuterXml -cne $expected.OuterXml){throw 'Installed gateway configuration differs from selected external appSettings'}}
  elseif((FileHash $row.path) -cne $Package.files['gateway/'+$row.relative].sha256){throw 'Installed gateway binary/assets differ from current immutable package'}
 }}
}
function New-RollbackPlan($Options){
 if($Options.ApplyLocal -or $Options.DevelopmentConsole){throw 'Legacy console/pointer-only rollback is explicitly unsupported by R0; installed services require the verified local IIS path'}
 if(!$Options.VerifiedLocalInputs -or $Options.SiteName -cne 'Default Web Site' -or $Options.SiteBaseUrl -cne 'http://localhost' -or $Options.AppPoolName -cne 'WebCADServices' -or $Options.ServiceName -cne 'WebCADServices' -or $Options.AllowedOrigin -cne 'http://127.0.0.1:17674' -or $Options.PipeName -cne 'WebCADServices-local'){throw 'R0 requires all explicit verified local site/service/pool/origin/pipe inputs'}
 Assert-LocalStorage $Options.LocalRoot $Options.GoldenluckWebRoot
 $Options.LocalRoot=Absolute $Options.LocalRoot;$Options.GoldenluckWebRoot=Absolute $Options.GoldenluckWebRoot;$Options.PythonExe=Absolute $Options.PythonExe
 $active=Join-Path $Options.LocalRoot 'active-release.json';$pointer=Read-Json $active
 $pointerKeys=@('format','releaseId','previousReleaseId','serviceName','servicesUrl','hostConfig','productionInstalled','dataSchema')
 if(@($pointer.PSObject.Properties|Where-Object{$_.Name -notin $pointerKeys}).Count -or $pointer.productionInstalled -isnot [bool]){throw 'Unknown pointer metadata/schema cannot be preserved by scoped R0'}
 if($pointer.format -ne 'webcad-local-release-v1' -or $pointer.dataSchema -ne 'services-v1' -or $pointer.productionInstalled -ne $false -or $pointer.releaseId -cne $Options.ExpectedCurrentReleaseId -or $pointer.previousReleaseId -cne $Options.ExpectedPreviousReleaseId -or $pointer.releaseId -ceq $pointer.previousReleaseId -or $pointer.serviceName -cne $Options.ServiceName -or $pointer.servicesUrl -cne ($Options.SiteBaseUrl+'/cadservices/api.ashx')){throw 'State/previous identity is not the explicitly selected compatible local IIS installation'}
 foreach($id in @($pointer.releaseId,$pointer.previousReleaseId)){if($id -notmatch '^[A-Za-z0-9_-]{1,80}$'){throw 'Invalid selected release identity'}}
 $current=Verify-Package (Join-Path $Options.LocalRoot "releases/$($pointer.releaseId)") $pointer.releaseId $Options.CurrentPackageInventorySha256
 $target=Verify-Package (Join-Path $Options.LocalRoot "releases/$($pointer.previousReleaseId)") $pointer.previousReleaseId $Options.PreviousPackageInventorySha256
 if(($current.manifest.documentVersions|ConvertTo-Json -Compress) -cne ($target.manifest.documentVersions|ConvertTo-Json -Compress)){throw 'Rollback refuses a document format change'}
 if($current.manifest.binarySha256.runtime -cne $target.manifest.binarySha256.runtime){
  # Cross-runtime rollback requires a separately pinned actual old-new-old
  # certificate, packaged in the hash-checked kernel proof. No schema migration.
  if($Options.RuntimeCompatibilityProofSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Runtime change requires an explicitly pinned compatibility proof'}
  $compatible=$false
  foreach($package in @($current,$target)){
   $proofPath=Join-Path $package.root 'configuration/kernel-pair.json'
   if((FileHash $proofPath) -cne $Options.RuntimeCompatibilityProofSha256){continue}
   $certificate=Property (Read-Json $proofPath 1048576) 'dataCompatibility'
   if(!$certificate -or $certificate.version -ne 'services-runtime-compatibility-1' -or $certificate.status -ne 'passed' -or $certificate.schema -ne 'services-v1' -or $certificate.schemaMigration -isnot [bool] -or $certificate.schemaMigration -or @($certificate.legs).Count -ne 3){continue}
   $pair=@($certificate.runtimeSha256)
   if($pair.Count -ne 2 -or $current.manifest.binarySha256.runtime -notin $pair -or $target.manifest.binarySha256.runtime -notin $pair){continue}
   $legs=@($certificate.legs)
   if($legs[0].runtimeSha256 -cne $pair[0] -or $legs[1].runtimeSha256 -cne $pair[1] -or $legs[2].runtimeSha256 -cne $pair[0]){continue}
   if(@($legs|Where-Object{$_.authenticatedReadback -ne $true -or $_.state -ne 'succeeded' -or $_.resultSha256 -cne $legs[0].resultSha256 -or $_.jobId -cne $legs[0].jobId}).Count){continue}
   $compatible=$true
  }
  if(!$compatible){throw 'Actual pinned cross-runtime persistence compatibility not proven'}
 }
 $currentConfig=Read-HostConfig $current $Options;$targetConfig=Read-HostConfig $target $Options
 if(!(SamePath $pointer.hostConfig $currentConfig.path)){throw 'Active pointer Host configuration differs from current selected release'}
 $iis=Read-IisSnapshot $Options;$service=Read-ServiceSnapshot $Options $current $currentConfig
 Assert-GatewayMatches $current $currentConfig $iis.gatewayRoot
 $from=@(Tree (Join-Path $current.root 'gateway') 256 67108864|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object)
 $to=@(Tree (Join-Path $target.root 'gateway') 256 67108864|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object)
 if(($from -join '|') -cne ($to -join '|')){throw 'R0 requires identical gateway layout to preserve every existing ACL exactly'}
 [void](Render-WebConfig $target $targetConfig.gatewayPath);Assert-StoreIdle $Options.PythonExe $currentConfig.config.dataRoot
 $acls=@(Snapshot-Gateway $iis.gatewayRoot);$pointerAcl=Get-ExactAcl $active;Assert-AtomicAcl $pointerAcl
 return [pscustomobject]@{options=$Options;current=$current;target=$target;currentConfig=$currentConfig;targetConfig=$targetConfig;iis=$iis;service=$service;active=$active;pointer=$pointer;pointerHash=(FileHash $active);pointerAcl=$pointerAcl;acls=$acls}
}
function Set-ExactAcl([string]$Path,[bool]$Directory,[string]$Sddl){
 $acl=if($Directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
 $acl.SetSecurityDescriptorSddlForm($Sddl,[Security.AccessControl.AccessControlSections]::All);Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-GatewayAcls($Plan,$Deadline){
 # Gateway files/directories remain the original NTFS objects. Recreating an
 # inherited ACL through Set-Acl can normalize its control flags; do not do that.
 foreach($row in $Plan.acls){Assert-Time $Deadline;$path=if($row.relative){Join-Path $Plan.iis.gatewayRoot $row.relative}else{$Plan.iis.gatewayRoot};if((Get-ExactAcl $path) -cne $row.sddl){throw 'Exact gateway ACL restoration/readback failed'}}
}
function Protect-Backup([string]$Path){
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
 foreach($sid in @('S-1-5-18','S-1-5-32-544',[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
function Write-Atomic([string]$Path,[byte[]]$Bytes,[string]$Acl,$Deadline){
 Assert-Time $Deadline;Assert-NoReparse $Path;Assert-AtomicAcl $Acl;$temporary=$Path+'.r0-'+[Guid]::NewGuid().ToString('N')
 try{
  [IO.File]::WriteAllBytes($temporary,$Bytes);Set-ExactAcl $temporary $false $Acl
  if((Get-ExactAcl $temporary) -cne $Acl){throw 'Pointer temporary exact ACL preparation failed before publication'}
  Assert-Time $Deadline;[IO.File]::Replace($temporary,$Path,[Management.Automation.Language.NullString]::Value)
  if((Get-ExactAcl $Path) -cne $Acl){throw 'Atomic pointer ACL readback mismatch'}
 }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}
 Assert-Time $Deadline
}
function Stop-SelectedService($Plan,$Deadline){
 Assert-Time $Deadline;Assert-SelectedOwnership $Plan;Assert-Time $Deadline;$s=[ServiceProcess.ServiceController]::new($Plan.options.ServiceName)
 try{$s.Refresh();if($s.Status -ne 'Stopped'){if($s.Status -ne 'StopPending'){$s.Stop()};$s.WaitForStatus('Stopped',[TimeSpan]::FromMilliseconds((RemainingMs $Deadline 20000)))}}finally{$s.Dispose()}
 Assert-Time $Deadline;Assert-DataLeaseFree $Plan.currentConfig.config.dataRoot
}
function Assert-SelectedOwnership($Plan){
 $s=Get-CimInstance Win32_Service -Filter ("Name='"+$Plan.options.ServiceName+"'") -OperationTimeoutSec 5
 if(!$s -or $s.StartName -ine ('NT SERVICE\'+$Plan.options.ServiceName)){throw 'Selected service identity changed concurrently'}
 try{Assert-ServiceCommand $s.PathName $Plan.current $Plan.currentConfig}catch{Assert-ServiceCommand $s.PathName $Plan.target $Plan.targetConfig}
}
function Change-SelectedService($Plan,[string]$Command,$Deadline){
 Assert-Time $Deadline;$budget=[Math]::Max(1,[Math]::Ceiling((RemainingMs $Deadline 5000)/1000))
 $service=Get-CimInstance Win32_Service -Filter ("Name='"+$Plan.options.ServiceName+"'") -OperationTimeoutSec $budget
 if($service.State -ne 'Stopped' -or $service.StartName -ine ('NT SERVICE\'+$Plan.options.ServiceName)){throw 'Only the stopped selected virtual-account service may be changed'}
 Assert-Time $Deadline
 $result=Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$Command} -OperationTimeoutSec $budget
 if($result.ReturnValue -ne 0){throw 'Structured Win32_Service.Change failed'}
 Assert-Time $Deadline
 $check=Get-CimInstance Win32_Service -Filter ("Name='"+$Plan.options.ServiceName+"'") -OperationTimeoutSec $budget
 if($check.PathName -cne $Command -or $check.StartMode -ne $Plan.service.startMode){throw 'Selected service command/start-mode readback failed'}
}
function Start-SelectedService($Plan,$Package,$Config,$Deadline){
 Assert-DataLeaseFree $Plan.currentConfig.config.dataRoot;Assert-Time $Deadline;$s=[ServiceProcess.ServiceController]::new($Plan.options.ServiceName)
 try{$s.Start();$s.WaitForStatus('Running',[TimeSpan]::FromMilliseconds((RemainingMs $Deadline 20000)))}finally{$s.Dispose()}
 Assert-Time $Deadline;[void](Read-ServiceSnapshot $Plan.options $Package $Config);Assert-Time $Deadline
}
function Replace-Gateway($Plan,[string]$Source,$WebConfig,$Deadline){
 $root=Absolute $Plan.iis.gatewayRoot
 if(!(SamePath $root (Join-Path $Plan.options.GoldenluckWebRoot 'cadservices'))){throw 'Gateway replacement escaped the exact verified child'}
 Assert-NoReparse $root;$existing=@(Tree $root 256 67108864|Where-Object{$_.relative -cne 'app_offline.htm'});$sourceRows=@(Tree $Source 256 67108864)
 $a=@($existing|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object);$b=@($sourceRows|ForEach-Object{$_.relative+':'+$_.directory}|Sort-Object)
 if(($a -join '|') -cne ($b -join '|')){throw 'Gateway layout changed; refusing to create/delete unrelated NTFS objects'}
 # Copy bytes into the existing objects to preserve EXACT owner/group/DACL/SACL,
 # including inherited flags. Bounded chunks also check the deadline during I/O.
 foreach($row in $sourceRows){if(!$row.directory){
  Assert-Time $Deadline;$dest=Join-Path $root $row.relative;Assert-NoReparse $row.path;Assert-NoReparse $dest
  $inputStream=[IO.File]::OpenRead($row.path);$outputStream=$null
  try{
   $outputStream=[IO.File]::Open($dest,'Open','Write','None');$buffer=[byte[]]::new(65536)
   while(($count=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){Assert-Time $Deadline;$outputStream.Write($buffer,0,$count)}
   $outputStream.SetLength($inputStream.Length);$outputStream.Flush()
  }finally{$inputStream.Dispose();if($outputStream){$outputStream.Dispose()}}
 }}
 if($WebConfig){Assert-Time $Deadline;$WebConfig.Save((Join-Path $root 'web.config'))}
 Assert-GatewayAcls $Plan $Deadline;Assert-Time $Deadline
}
function Assert-GatewayPipe($Plan,$Package,$Deadline){
 # One-byte invalid authorization cannot equal the >=32-byte token. Host-stage
 # 401 proves IIS->pool->pipe->loaded Host; NOT authenticated health/geometry.
 $request=[Net.HttpWebRequest]::Create($Plan.options.SiteBaseUrl+'/cadservices/api.ashx?route=/v1/health')
 $request.AllowAutoRedirect=$false;$request.Proxy=$null;$request.Timeout=RemainingMs $Deadline 4000;$request.ReadWriteTimeout=$request.Timeout
 $request.Headers['Origin']=$Plan.options.AllowedOrigin;$request.Headers['Authorization']='Bearer !';$response=$null
 try{
  try{$response=$request.GetResponse()}catch [Net.WebException]{if(!$_.Exception.Response){throw 'Bounded IIS transport probe failed'};$response=$_.Exception.Response}
  if([int]$response.StatusCode -ne 401 -or $response.Headers['X-WebCAD-Transport'] -cne 'iis-ashx-pipe-v1' -or $response.Headers['X-WebCAD-Gateway-Build'] -cne ('sha256:'+$Package.manifest.binarySha256.gateway)){throw 'Actual IIS transport/build/status probe failed'}
  $stream=$response.GetResponseStream();$buffer=[byte[]]::new(2049);$count=0
  try{while($count -lt $buffer.Length){Assert-Time $Deadline;$n=$stream.Read($buffer,$count,$buffer.Length-$count);if(!$n){break};$count+=$n}}finally{$stream.Dispose()}
  if($count -gt 2048){throw 'IIS probe response exceeds bound'}
  $body=[Text.Encoding]::UTF8.GetString($buffer,0,$count)|ConvertFrom-Json
  if($body.code -cne 'UNAUTHORIZED' -or $body.stage -cne 'request' -or $body.sourceVersion -cne 'services-v1'){throw 'IIS probe did not reach the actual Host authorization path'}
 }finally{if($response){$response.Dispose()}}
 Assert-Time $Deadline
}
function Invoke-RollbackCore($Options){
 $plan=New-RollbackPlan $Options
 $summary=[ordered]@{format='webcad-r0-rollback-plan-v1';apply=[bool]$Options.Apply;current=$plan.current.id;target=$plan.target.id;site=$Options.SiteName;child='/cadservices';pool=$Options.AppPoolName;service=$Options.ServiceName;dataSchema='services-v1';dataChanges=$false;credentialRead=$false;runtimeAcceptance='not performed';restoreOnFailure=$true}
 if(!$Options.Apply){$summary|ConvertTo-Json;Write-Output 'Dry-run passed: packages, installed identity, configs, exact ACL readability and read-only idle store verified. No runtime switch performed.';return}
 $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Native Apply requires elevation'}
 Add-Type -AssemblyName System.ServiceProcess
 $backupBase='G:/CAD-Workspace/WebCAD/backups';Assert-NoReparse $backupBase
 $backup=Join-Path $backupBase ((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-r0-rollback')
 if(Test-Path -LiteralPath $backup){throw 'Unique R0 backup already exists'}
 [void][IO.Directory]::CreateDirectory($backup);Protect-Backup $backup
 $gatewayBackup=Join-Path $backup 'site/cadservices';[void][IO.Directory]::CreateDirectory((Split-Path $gatewayBackup));Copy-Item -LiteralPath $plan.iis.gatewayRoot -Destination $gatewayBackup -Recurse
 $pointerBackup=Join-Path $backup 'runtime/active-release.json';[void][IO.Directory]::CreateDirectory((Split-Path $pointerBackup));Copy-Item -LiteralPath $plan.active -Destination $pointerBackup
 [IO.File]::WriteAllText((Join-Path $backup 'original-contract.json'),(@{gatewayAcls=$plan.acls;pointerAcl=$plan.pointerAcl;service=$plan.service;pointerHash=$plan.pointerHash;current=$plan.current.id;target=$plan.target.id}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 foreach($row in $plan.acls){if(!$row.directory -and (FileHash (Join-Path $gatewayBackup $row.relative)) -cne $row.sha256){throw 'Gateway backup verification failed'}}
 if((FileHash $pointerBackup) -cne $plan.pointerHash){throw 'Pointer backup verification failed'}
 $deadline=[DateTime]::UtcNow.AddSeconds($Options.ApplyTimeoutSeconds);$gated=$false;$stopRequested=$false;$changed=$false;$ungated=$false;$targetPointerHash=$null;$offline=Join-Path $plan.iis.gatewayRoot 'app_offline.htm'
 try{
  if((FileHash $plan.active) -cne $plan.pointerHash){throw 'Active pointer changed during preflight'}
  [void](Read-IisSnapshot $Options);[void](Read-ServiceSnapshot $Options $plan.current $plan.currentConfig);Assert-GatewayMatches $plan.current $plan.currentConfig $plan.iis.gatewayRoot
  Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $deadline
  if(Test-Path -LiteralPath $offline){throw 'Existing child maintenance gate is not owned by R0'}
  $gateStream=[IO.File]::Open($offline,'CreateNew','Write','None');$gated=$true
  try{$gateBytes=[Text.Encoding]::UTF8.GetBytes('WebCADServices local rollback in progress.');$gateStream.Write($gateBytes,0,$gateBytes.Length)}finally{$gateStream.Dispose()}
  # Drain pre-gate requests for the existing complete transport deadline; no IIS,
  # site or pool stop/recycle is used. Recheck jobs before AND after Host stop.
  $drain=[int]$plan.currentConfig.config.transport.overallTimeoutMs+1000
  if((RemainingMs $deadline $drain) -lt $drain){throw 'Insufficient Apply budget for bounded admission drain'}
  Start-Sleep -Milliseconds $drain;Assert-Time $deadline;Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $deadline
  $stopRequested=$true;Stop-SelectedService $plan $deadline;Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $deadline
  $changed=$true;Replace-Gateway $plan (Join-Path $plan.target.root 'gateway') (Render-WebConfig $plan.target $plan.targetConfig.gatewayPath) $deadline
  Assert-GatewayMatches $plan.target $plan.targetConfig $plan.iis.gatewayRoot $true
  Change-SelectedService $plan (Service-Command $plan.target $plan.targetConfig) $deadline;Start-SelectedService $plan $plan.target $plan.targetConfig $deadline
  Assert-Time $deadline;Remove-Item -LiteralPath $offline -Force;$ungated=$true
  Assert-GatewayPipe $plan $plan.target $deadline;Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $deadline
  $pointer=[ordered]@{format='webcad-local-release-v1';releaseId=$plan.target.id;previousReleaseId=$plan.current.id;serviceName=$Options.ServiceName;servicesUrl=$Options.SiteBaseUrl+'/cadservices/api.ashx';hostConfig=$plan.targetConfig.path;productionInstalled=$false;dataSchema='services-v1'}
  if((FileHash $plan.active) -cne $plan.pointerHash){throw 'Active pointer changed before atomic publication'}
  $pointerBytes=[Text.Encoding]::UTF8.GetBytes(($pointer|ConvertTo-Json));$sha=[Security.Cryptography.SHA256]::Create()
  try{$targetPointerHash=([BitConverter]::ToString($sha.ComputeHash($pointerBytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  Write-Atomic $plan.active $pointerBytes $plan.pointerAcl $deadline
  $readback=Read-Json $plan.active;if($readback.releaseId -cne $plan.target.id -or $readback.previousReleaseId -cne $plan.current.id){throw 'Atomic pointer selected-identity readback failed'}
  [void](Read-IisSnapshot $Options);[void](Read-ServiceSnapshot $Options $plan.target $plan.targetConfig);Assert-Time $deadline
  Write-Output "Local IIS/service/config/pointer switched to $($plan.target.id). Host-stage negative authorization verified; authenticated health remains native acceptance. Backup: $backup"
 }catch{
  # External exception messages/response bodies may contain private details.
  $failureType=$_.Exception.GetType().Name
  if(!$gated -and !$stopRequested -and !$changed){throw ('R0 refused before product mutation ('+$failureType+'). Backup retained: '+$backup)}
  $recovery=[DateTime]::UtcNow.AddSeconds($Options.RecoveryTimeoutSeconds)
  try{
   if($ungated){
    Assert-NoReparse $offline;$gateStream=[IO.File]::Open($offline,'CreateNew','Write','None');$gateStream.Dispose()
    $drain=[int]$plan.targetConfig.config.transport.overallTimeoutMs+1000
    if((RemainingMs $recovery $drain) -lt $drain){throw 'Insufficient recovery admission-drain budget'}
    Start-Sleep -Milliseconds $drain;Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $recovery
   }
   if($stopRequested){Stop-SelectedService $plan $recovery;Assert-StoreIdle $Options.PythonExe $plan.currentConfig.config.dataRoot $recovery}
   Replace-Gateway $plan $gatewayBackup $null $recovery;Assert-GatewayMatches $plan.current $plan.currentConfig $plan.iis.gatewayRoot $true
   if($stopRequested){Change-SelectedService $plan $plan.service.path $recovery;Start-SelectedService $plan $plan.current $plan.currentConfig $recovery}
   if((FileHash $plan.active) -notin @($plan.pointerHash,$targetPointerHash)){throw 'Concurrent pointer publication detected; refusing to overwrite it'}
   Write-Atomic $plan.active ([IO.File]::ReadAllBytes($pointerBackup)) $plan.pointerAcl $recovery
   if((FileHash $plan.active) -cne $plan.pointerHash){throw 'Original pointer byte restoration failed'}
   [void](Read-IisSnapshot $Options);[void](Read-ServiceSnapshot $Options $plan.current $plan.currentConfig)
   Assert-Time $recovery;Remove-Item -LiteralPath $offline -Force;Assert-GatewayPipe $plan $plan.current $recovery;Assert-Time $recovery
  }catch{throw ('R0 switch failed ('+$failureType+'); current product recovery incomplete ('+$_.Exception.GetType().Name+'). Native recovery required; backup retained: '+$backup)}
  throw ('R0 switch failed ('+$failureType+'); current gateway, exact ACLs, service command/running identity and pointer were restored. Backup retained: '+$backup)
 }
}
function Invoke-Rollback($Options){
 if(!$Options.Apply){Invoke-RollbackCore $Options;return}
 $mutex=[Threading.Mutex]::new($false,'Global\WebCADServices-R0-Rollback');$owned=$false
 try{
  try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
  if(!$owned){throw 'Another scoped R0 rollback is active'}
  Invoke-RollbackCore $Options
 }finally{if($owned){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
Invoke-Rollback @{
 LocalRoot=$LocalRoot;Apply=[bool]$Apply;ApplyLocal=[bool]$ApplyLocal;DevelopmentConsole=[bool]$DevelopmentConsole;VerifiedLocalInputs=[bool]$VerifiedLocalInputs
 SiteName=$SiteName;GoldenluckWebRoot=$GoldenluckWebRoot;SiteBaseUrl=$SiteBaseUrl;AppPoolName=$AppPoolName;ServiceName=$ServiceName;AllowedOrigin=$AllowedOrigin;PipeName=$PipeName
 ExpectedCurrentReleaseId=$ExpectedCurrentReleaseId;ExpectedPreviousReleaseId=$ExpectedPreviousReleaseId;CurrentPackageInventorySha256=$CurrentPackageInventorySha256;PreviousPackageInventorySha256=$PreviousPackageInventorySha256
 PythonExe=$PythonExe;RuntimeCompatibilityProofSha256=$RuntimeCompatibilityProofSha256;ApplyTimeoutSeconds=$ApplyTimeoutSeconds;RecoveryTimeoutSeconds=$RecoveryTimeoutSeconds
}
