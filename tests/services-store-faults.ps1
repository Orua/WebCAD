param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot)
$ErrorActionPreference='Stop'
[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'Newtonsoft.Json.dll'))
[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'WebCADServices.Contracts.dll'))
$runtimeAssembly=[Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'WebCADServices.Runtime.dll'))
function Assert-Equal($Actual,$Expected,[string]$Message){if($Actual -ne $Expected){throw "${Message}: $Actual != $Expected"}}
function Assert-Code([scriptblock]$Action,[string]$Code){try{& $Action | Out-Null}catch{$caught=$_.Exception;while($caught.InnerException){$caught=$caught.InnerException};Assert-Equal $caught.Code $Code ("Error code: "+$caught.Message);return};throw "Expected error $Code"}
$owner='store-test-owner';$bytes=[Text.Encoding]::UTF8.GetBytes('Integrity fixture only; no geometry claim')
$store=[WebCADServices.Runtime.Store]::new($DataRoot)
try{
 $payload=[Newtonsoft.Json.Linq.JObject]::Parse('{"operation":"solid.round","sourceSha256":"fixture-sha","sourceName":"fixture.logo.json","engineBuildId":"fixture-engine","semanticVersion":"logo-1.0","options":{}}')
 $payload['publicRequest']=[Newtonsoft.Json.Linq.JObject]::Parse('{"requestId":"fixture-request","documentId":"fixture-document","documentInstanceId":"fixture-instance","expectedRevision":0,"featureId":"fixture-feature","operation":"solid.round","semanticVersion":"1.0","recipeFingerprint":"fixture-recipe","schemaVersion":1,"params":{},"placementSnapshot":{},"selectionIntent":{},"strategy":"fixture","requiredResultFormat":"brep"}')
 $accepted=$store.Submit($owner,'interrupted-key',$payload,$null);$jobId=[string]$accepted['jobId']
 [void]$store.Claim('occt');Assert-Equal ([string]$store.Job($owner,$jobId)['execution']) 'running' 'Running persisted'
 Assert-Code {[WebCADServices.Runtime.Store]::new($DataRoot)} 'DATA_ROOT_IN_USE';Assert-Equal ([string]$store.Job($owner,$jobId)['execution']) 'running' 'Second Host cannot interrupt running work'
 $asset=$store.AddAsset($owner,'integrity.logo.json',$bytes,'logo');$assetId=[string]$asset['assetId']
 Assert-Code {$store.Asset('other-owner',$assetId)} 'ASSET_NOT_FOUND'
}finally{$store.Dispose()}
$store=[WebCADServices.Runtime.Store]::new($DataRoot)
try{
 Assert-Equal ([string]$store.Job($owner,$jobId)['execution']) 'interrupted' 'Restart must not fake success'
 Assert-Equal ([string]$store.Submit($owner,'interrupted-key',$payload,$null)['jobId']) $jobId 'Same key reconciles existing job'
 Assert-Code {$store.Submit($owner,'new-key-same-input',$payload,$null)} 'KNOWN_INPUT_FAILED'
 $recovered=$store.Recover($owner,$jobId,'reviewed-recovery-key','Reviewed stopped Host interruption',$payload);$recoveredId=[string]$recovered['jobId'];if($recoveredId -eq $jobId){throw 'Recovery must retain a distinct linked task'}
 Assert-Equal ([string]$store.Job($owner,$jobId)['execution']) 'interrupted' 'Original failure record preserved'
 Assert-Equal ([string]$store.Recover($owner,$jobId,'reviewed-recovery-key','Reviewed stopped Host interruption',$payload)['jobId']) $recoveredId 'Same recovery key must reconcile instead of repeat'
 [void]$store.Cancel($owner,$recoveredId)
 Assert-Code {$store.Recover($owner,$jobId,'another-recovery-key','No second execution',$payload)} 'RECOVERY_NOT_ALLOWED'
 $conflict=$payload.DeepClone();$conflict['sourceName']=[Newtonsoft.Json.Linq.JValue]::new('changed.logo.json');Assert-Code {$store.Submit($owner,'interrupted-key',$conflict,$null)} 'IDEMPOTENCY_KEY_REUSED'
 $queuedPayload=$payload.DeepClone();$queuedPayload['sourceSha256']=[Newtonsoft.Json.Linq.JValue]::new('queued-sha');$queued=$store.Submit($owner,'queued-key',$queuedPayload,$null);$queuedId=[string]$queued['jobId'];[void]$store.Cancel($owner,$queuedId)
 Assert-Equal ([string]$store.Job($owner,$queuedId)['execution']) 'cancelled' 'Queued cancellation persisted';Assert-Equal $store.Claim('logo') $null 'Cancelled job cannot execute'
 $logoPayload=[Newtonsoft.Json.Linq.JObject]::Parse('{"operation":"logo.convert","sourceSha256":"retry-logo-sha","sourceName":"fixture.png","engineBuildId":"fixture-engine","semanticVersion":"logo-1.0","options":{}}');$logoPayload['sourceSha256']=[Newtonsoft.Json.Linq.JValue]::new('retry-logo-sha')
 $first=$store.Submit($owner,'logo-first',$logoPayload,$null);$firstId=[string]$first['jobId'];[void]$store.Claim('logo')
 $duplicate=$store.Submit($owner,'logo-while-running',$logoPayload,$null);Assert-Equal ([string]$duplicate['jobId']) $firstId 'Running LOGO is shared, never duplicated'
 $store.Finish($firstId,'failed',$null,'{"code":"NO_VECTOR_CONTENT","message":"Empty foreground","stage":"worker"}')
 Assert-Equal ([string]$store.Submit($owner,'logo-first',$logoPayload,$null)['jobId']) $firstId 'Original key retains failed receipt'
 $second=$store.Submit($owner,'logo-user-retry',$logoPayload,$null);$secondId=[string]$second['jobId'];if($secondId -eq $firstId){throw 'Explicit stopped LOGO retry must create a new job'}
 Assert-Equal ([string]$store.Job($owner,$firstId)['error']['code']) 'NO_VECTOR_CONTENT' 'Original failure reason preserved'
 [void]$store.Cancel($owner,$secondId)
 $third=$store.Submit($owner,'logo-after-cancel',$logoPayload,$null);if([string]$third['jobId'] -eq $secondId){throw 'Cancelled LOGO must allow explicit retry'};[void]$store.Cancel($owner,[string]$third['jobId'])
 $interruptedPayload=$logoPayload.DeepClone();$interruptedPayload['sourceSha256']=[Newtonsoft.Json.Linq.JValue]::new('interrupted-logo');$interrupted=$store.Submit($owner,'logo-interrupted',$interruptedPayload,$null);[void]$store.Claim('logo');$store.Finish([string]$interrupted['jobId'],'interrupted',$null,'{}');$resubmitted=$store.Submit($owner,'logo-interrupted-user-retry',$interruptedPayload,$null);if([string]$resubmitted['jobId'] -eq [string]$interrupted['jobId']){throw 'Stopped interrupted LOGO should permit new user read'};[void]$store.Cancel($owner,[string]$resubmitted['jobId'])
 $artifact=$store.PublishGeometry($owner,$bytes);$artifactId=[string]$artifact['artifactId'];Assert-Code {$store.Artifact('other-owner',$artifactId)} 'ARTIFACT_NOT_FOUND';[IO.File]::WriteAllBytes((Join-Path $DataRoot "artifacts/$artifactId"),[byte[]]@(1,2));Assert-Code {$store.Artifact($owner,$artifactId)} 'ARTIFACT_CORRUPT'
 Remove-Item -LiteralPath (Join-Path $DataRoot "artifacts/$artifactId");Assert-Code {$store.Artifact($owner,$artifactId)} 'ARTIFACT_UNAVAILABLE'
 $atomicTarget=Join-Path $DataRoot 'existing-atomic-fixture';[IO.File]::WriteAllBytes($atomicTarget,$bytes)
 try{[WebCADServices.Runtime.Store]::Atomic($atomicTarget,[byte[]]@(9));throw 'Collision should fail'}catch{if($_.Exception.Message -eq 'Collision should fail'){throw}}
 Assert-Equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes($atomicTarget))) ([Convert]::ToBase64String($bytes)) 'Atomic collision cannot overwrite original';Assert-Equal @(Get-ChildItem -LiteralPath $DataRoot -Filter '.partial-*').Count 0 'Failed atomic publication cleans temporary file'
}finally{$store.Dispose()}
$cacheType=$runtimeAssembly.GetType('WebCADServices.Runtime.LayerCheckpointCache');$cache=[Activator]::CreateInstance($cacheType,[object[]]@([string]$DataRoot,[string]$owner,'test-build'))
$publish=$cacheType.GetMethod('Publish');$read=$cacheType.GetMethod('Read');$source=Join-Path $DataRoot 'checkpoint-fixture';[IO.File]::WriteAllBytes($source,$bytes);$key='a'*64
[void]$publish.Invoke($cache,[object[]]@([string]$key,[string]$source));$checkpoint=[string]$read.Invoke($cache,[object[]]@([string]$key));$receipt=[IO.Path]::ChangeExtension($checkpoint,'.json')
Remove-Item -LiteralPath $receipt;[IO.File]::WriteAllBytes($checkpoint,[byte[]]@(3,4));Assert-Equal $read.Invoke($cache,[object[]]@([string]$key)) $null 'Orphan must not be trusted'
[void]$publish.Invoke($cache,[object[]]@([string]$key,[string]$source));Assert-Equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes($checkpoint))) ([Convert]::ToBase64String($bytes)) 'Completed publication replaces orphan'
[IO.File]::WriteAllText($receipt,'{broken');Assert-Code {$read.Invoke($cache,[object[]]@([string]$key))} 'LAYER_CACHE_CORRUPT'
Assert-Equal (Test-Path -LiteralPath $receipt) $false 'Corrupt receipt is quarantined'
[void]$publish.Invoke($cache,[object[]]@([string]$key,[string]$source));Assert-Equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes([string]$read.Invoke($cache,[object[]]@([string]$key))))) ([Convert]::ToBase64String($bytes)) 'Already completed valid bytes replace corrupt cache without geometry retry'
Write-Output 'passed: persistent interruption, no retry, ownership, queued cancellation, artifact corruption, orphan cache recovery, corrupt receipt rejection'
