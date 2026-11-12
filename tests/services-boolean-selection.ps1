param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($DataRoot) -notmatch '^F:[\\/]'){throw 'Test store requires fixed F: storage'}
foreach($name in @('Newtonsoft.Json','WebCADServices.Contracts','WebCADServices.Runtime')){[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory ($name+'.dll')))}
New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
$workerHash=[WebCADServices.Contracts.Protocol]::Hash([IO.File]::ReadAllBytes($NativeWorker));$proof=Join-Path $DataRoot 'proof.json'
@{status='isolated-selection-test';producerKernelBuildId=('native-occt@7.8.1:sha256:'+$workerHash);consumerKernelBuildId='replicad-opencascadejs@1.1.0:sha256:f5384e3032591f3af04ce5c73b821b831beefebfd30b052052bc9259f089f7b3';codec='occt-text-brep-v1';brepVersion=3;availableSemantics=@('boolean.cut-1.0','boolean.cut-1.1');booleanCutStatus='passed';booleanCutSelectionStatus='passed'} | ConvertTo-Json | Set-Content -LiteralPath $proof -Encoding UTF8
[WebCADServices.Runtime.NativeAdapter]::Configure($NativeWorker,$proof)
$store=[WebCADServices.Runtime.Store]::new($DataRoot);$owner='selection-test'
try{
 $inputs=@();foreach($name in @('source','tool')){$asset=$store.AddAsset($owner,($name+'.brep'),[IO.File]::ReadAllBytes((Join-Path $FixtureRoot ($name+'.brep'))),'brep');$inputs+=@{assetId=[string]$asset['assetId'];sha256=[string]$asset['sha256'];role=$(if($name -eq 'source'){'source'}else{'tool'});sourceFeatureId=$name}}
 $request=[Newtonsoft.Json.Linq.JObject]::Parse((@{requestId='selection';documentId='selection-doc';documentInstanceId='selection-instance';expectedRevision=1;featureId='selection';operation='cut';schemaVersion='1.0';semanticVersion='boolean.cut-1.1';inputs=$inputs;placementSnapshot=$null;selectionIntent=@{kind='whole-sources'};params=@{keepSolidAt=@(2,5,5);maxDiscardedVolumeMm3=1400};strategy='multi-source-boolean';requiredResultFormat='occt-text-brep-v1';recipeFingerprint='selection'} | ConvertTo-Json -Depth 12))
 $payload=[WebCADServices.Runtime.NativeAdapter]::Validate($request,$store,$owner);$job=$store.Submit($owner,'selection-key',$payload,$request);$row=$store.Claim('occt');$manifest=[WebCADServices.Runtime.NativeAdapter]::Execute($row,$store,[Func[bool]]{return $false})
 if([Math]::Abs([double]$manifest['validation']['volumeMm3']-400) -gt .000001){throw 'Selected material incorrect'}
 $stage=@($manifest['stages'] | Where-Object {$_['stage'] -eq 'boolean-result-selection'})[0];if([Math]::Abs([double]$stage['discardedVolumeMm3']-1400) -gt .000001){throw 'Missing discard report'}
 $store.Finish([string]$job['jobId'],'succeeded',$manifest.ToString([Newtonsoft.Json.Formatting]::None),$null)
 foreach($change in @('{"keepSolidAt":[10,5,5],"maxDiscardedVolumeMm3":1400}','{"keepSolidAt":[2,5,5],"maxDiscardedVolumeMm3":1500}')){
  $other=$request.DeepClone();$other['params']=[Newtonsoft.Json.Linq.JObject]::Parse($change);$otherPayload=[WebCADServices.Runtime.NativeAdapter]::Validate($other,$store,$owner)
  if([Newtonsoft.Json.Linq.JToken]::DeepEquals($otherPayload['semanticParams'],$payload['semanticParams'])){throw 'Selection parameters missing from physical cache identity'}
 }
 [IO.File]::WriteAllText((Join-Path $DataRoot 'manifest.json'),$manifest.ToString())
 @{status='passed';semanticVersion='boolean.cut-1.1';producerKernelBuildId=('native-occt@7.8.1:sha256:'+$workerHash);volumeMm3=400;discardedVolumeMm3=1400;selectionCacheSeparated=$true;controlledWorker=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $DataRoot 'acceptance.json') -Encoding UTF8
 Write-Output 'passed: Runtime/Store exact selection, native worker, manifest and cache binding'
}finally{$store.Dispose()}
