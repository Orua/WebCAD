param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$NativeEvidence)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($DataRoot) -notmatch '^F:[\\/]'){throw 'Persistent protocol test store requires an explicit fixed F: path'}
[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'Newtonsoft.Json.dll'))
[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'WebCADServices.Contracts.dll'))
[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory 'WebCADServices.Runtime.dll'))
function Assert-Equal($Actual,$Expected,[string]$Message){if($Actual -ne $Expected){throw "${Message}: $Actual != $Expected"}}
function Assert-Code([scriptblock]$Action,[string]$Code){try{& $Action | Out-Null}catch{$caught=$_.Exception;while($caught.InnerException){$caught=$caught.InnerException};Assert-Equal $caught.Code $Code 'Error code';return};throw "Expected error $Code"}
$evidence=Get-Content -LiteralPath $NativeEvidence -Raw | ConvertFrom-Json
Assert-Equal $evidence.status 'native-cut-and-client-codec-passed' 'Real native evidence required'
$build='native-occt@7.8.1:sha256:'+[WebCADServices.Contracts.Protocol]::Hash([IO.File]::ReadAllBytes($NativeWorker))
Assert-Equal $build $evidence.producerKernelBuildId 'Evidence must bind actual worker'
New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
$proofPath=Join-Path $DataRoot 'isolated-native-proof.json'
# This isolated process uses the actual cut/codec evidence only. It does not
# advertise a production installation or copy old semantic acceptance.
@{producerKernelBuildId=$build;consumerKernelBuildId=$evidence.consumerKernelBuildId;codec='occt-text-brep-v1';brepVersion=3;status='isolated-boolean-protocol-test';availableSemantics=@('boolean.cut-1.0');booleanCutStatus='passed'} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $proofPath -Encoding UTF8
[WebCADServices.Runtime.NativeAdapter]::Configure($NativeWorker,$proofPath)
$owner='isolated-boolean-protocol-owner';$store=[WebCADServices.Runtime.Store]::new($DataRoot)
try{
 $files=@($evidence.fixture.sourcePath)+@($evidence.fixture.toolPaths | Select-Object -First 3)
 $assets=@();foreach($file in $files){$assets+=,$store.AddAsset($owner,[IO.Path]::GetFileName($file),[IO.File]::ReadAllBytes($file),'brep')}
 function New-Request([string]$Name,[int[]]$Indices){
  $parts=@();for($i=0;$i -lt $Indices.Count;$i++){$asset=$assets[$Indices[$i]];$parts+=@{assetId=[string]$asset['assetId'];sha256=[string]$asset['sha256'];role=$(if($i -eq 0){'source'}else{'tool'});sourceFeatureId="${Name}-source-$i"}}
  return ,([Newtonsoft.Json.Linq.JObject]::Parse((@{requestId=$Name;documentId='boolean-protocol-doc';documentInstanceId=$Name;expectedRevision=1;featureId=$Name;operation='cut';schemaVersion='1.0';semanticVersion='boolean.cut-1.0';inputs=$parts;placementSnapshot=$null;selectionIntent=@{kind='whole-sources'};params=@{};strategy='multi-source-boolean';requiredResultFormat='occt-text-brep-v1';recipeFingerprint=$Name} | ConvertTo-Json -Depth 12 -Compress)))
 }
 $request=New-Request 'base' @(0,1,2);$payload=[WebCADServices.Runtime.NativeAdapter]::Validate($request,$store,$owner)
 Assert-Equal $payload['semanticParams']['inputSha256'].Count 3 'Every source hash is in computation identity'
 $base=$store.Submit($owner,'base-key',$payload,$request);$row=$store.Claim('occt');Assert-Equal ([string]$row['id']) ([string]$base['jobId']) 'Exact queued job'
 $manifest=[WebCADServices.Runtime.NativeAdapter]::Execute($row,$store,[Func[bool]]{return $false})
 Assert-Equal ([string]$manifest['sourceSha256']) ([string]$assets[0]['sha256']) 'Primary source compatibility'
 Assert-Equal ([Newtonsoft.Json.Linq.JToken]::DeepEquals($manifest['inputSha256'],$payload['semanticParams']['inputSha256'])) $true 'Complete ordered manifest input binding'
 Assert-Equal ([int]$manifest['topologyBinding']['matchCount']) 3 'Whole-source count'
 Assert-Equal ([int]$manifest['validation']['solidCount']) 1 'Positive single solid result'
 $expectedVolume=64000-2*[Math]::PI*2.5*2.5*10
 if([Math]::Abs([double]$manifest['validation']['volumeMm3']-$expectedVolume) -gt 0.000001){throw 'Runtime returned incorrect two-hole material volume'}
 $store.Finish([string]$base['jobId'],'succeeded',$manifest.ToString([Newtonsoft.Json.Formatting]::None),$null)
 $aliasRequest=New-Request 'other-document-context' @(0,1,2);$aliasRequest['params']=[Newtonsoft.Json.Linq.JObject]::Parse('{"keepTools":true}')
 $aliasPayload=[WebCADServices.Runtime.NativeAdapter]::Validate($aliasRequest,$store,$owner);$alias=$store.Submit($owner,'alias-key',$aliasPayload,$aliasRequest)
 Assert-Equal ([string]$alias['jobId']) ([string]$base['jobId']) 'Feature identity and keepTools cannot evade computation cache'
 $rebound=$store.RequestResult($owner,'alias-key');Assert-Equal ([string]$rebound['featureId']) 'other-document-context' 'Cached manifest context rebind'
 Assert-Equal ([Newtonsoft.Json.Linq.JToken]::DeepEquals($rebound['inputSha256'],$manifest['inputSha256'])) $true 'Cache rebind preserves complete input hashes'
 foreach($case in @(@{name='changed-tool';indices=@(0,1,3)},@{name='reordered-tools';indices=@(0,2,1)})){
  $changed=New-Request $case.name $case.indices;$changedPayload=[WebCADServices.Runtime.NativeAdapter]::Validate($changed,$store,$owner);$accepted=$store.Submit($owner,$case.name,$changedPayload,$changed)
  if([string]$accepted['inputFingerprint'] -eq [string]$base['inputFingerprint']){throw 'Changed ordered tool inputs reused original fingerprint'}
  [void]$store.Cancel($owner,[string]$accepted['jobId'])
 }
 $bad=$request.DeepClone();$bad['inputs'][1]['role']=[Newtonsoft.Json.Linq.JValue]::new('source');Assert-Code {[WebCADServices.Runtime.NativeAdapter]::Validate($bad,$store,$owner)} 'PARAM_SCHEMA_INVALID'
 $bad=$request.DeepClone();$bad['selectionIntent']=[Newtonsoft.Json.Linq.JObject]::Parse('{"kind":"whole-sources","faceId":0}');Assert-Code {[WebCADServices.Runtime.NativeAdapter]::Validate($bad,$store,$owner)} 'PARAM_SCHEMA_INVALID'
 $bad=$request.DeepClone();$bad['params']=[Newtonsoft.Json.Linq.JObject]::Parse('{"toolPaths":["untrusted"]}');Assert-Code {[WebCADServices.Runtime.NativeAdapter]::Validate($bad,$store,$owner)} 'PARAM_SCHEMA_INVALID'
 $bad=$request.DeepClone();$bad['inputs'][1]['sha256']=[Newtonsoft.Json.Linq.JValue]::new(('0'*64));Assert-Code {[WebCADServices.Runtime.NativeAdapter]::Validate($bad,$store,$owner)} 'SOURCE_HASH_MISMATCH'
 Assert-Code {[WebCADServices.Runtime.NativeAdapter]::Validate($request,$store,'another-owner')} 'ASSET_NOT_FOUND'
 [IO.File]::WriteAllText((Join-Path $DataRoot 'manifest.json'),$manifest.ToString())
 @{status='passed';scope='isolated Runtime/Store/controlled-worker execution; no Host or IIS';kernelBuildId=$build;inputCount=3;jobId=[string]$base['jobId'];checks=@('ordered input hashes','changed second tool fingerprint','ordered tool fingerprint','keepTools excluded from compute key','source ownership','strict request fields','geometric binding','complete manifest','cache request rebind');expectedVolumeMm3=$expectedVolume;volumeMm3=[double]$manifest['validation']['volumeMm3']} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $DataRoot 'acceptance.json') -Encoding UTF8
 Write-Output "passed: actual Runtime/Store/native Boolean protocol; evidence $(Join-Path $DataRoot 'acceptance.json')"
}finally{$store.Dispose()}
