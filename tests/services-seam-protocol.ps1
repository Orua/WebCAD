param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot,[Parameter(Mandatory=$true)][string]$NativeWorker,[Parameter(Mandatory=$true)][string]$EvidenceRoot)
$ErrorActionPreference='Stop'
foreach($dll in @('Newtonsoft.Json','WebCADServices.Contracts','WebCADServices.Runtime')){[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory ($dll+'.dll')))}
$evidence=Get-Content "$EvidenceRoot/seam-acceptance.json" -Raw|ConvertFrom-Json
$build='native-occt@7.8.1:sha256:'+(Get-FileHash -LiteralPath $NativeWorker -Algorithm SHA256).Hash.ToLowerInvariant()
if($evidence.status -ne 'passed' -or $evidence.producerKernelBuildId -ne $build){throw 'Actual seam/codec proof required'}
New-Item -ItemType Directory -Force $DataRoot|Out-Null
$proof=Join-Path $DataRoot 'proof.json'
$evidence|ConvertTo-Json -Depth 20|Set-Content $proof -Encoding UTF8
[WebCADServices.Runtime.NativeAdapter]::Configure($NativeWorker,$proof)
$store=[WebCADServices.Runtime.Store]::new($DataRoot);$owner='seam-test'
function Assert($ok,$why){if(!$ok){throw $why}}
try{
 $assets=@(0,1|ForEach-Object {$file="$EvidenceRoot/seam/source-$_.brep";,$store.AddAsset($owner,"source-$_.brep",[IO.File]::ReadAllBytes($file),'brep')})
 function Request($radius){
  $inputs=@(for($i=0;$i-lt2;$i++){@{assetId=[string]$assets[$i]['assetId'];sha256=[string]$assets[$i]['sha256'];role=$(if($i){'tool'}else{'source'});sourceFeatureId="part-$i"}})
  return ,([Newtonsoft.Json.Linq.JObject]::Parse((@{requestId='seam-request';documentId='seam-doc';documentInstanceId='seam-instance';expectedRevision=1;featureId='seam';operation='union';schemaVersion='1.0';semanticVersion=$(if($radius -is [System.Collections.IDictionary]){'boolean.union-seam-1.1'}else{'boolean.union-seam-1.0'});strategy='multi-source-union-seam';inputs=$inputs;placementSnapshot=$null;selectionIntent=@{kind='whole-sources'};params=@{blendRadiusMm=$radius};requiredResultFormat='occt-text-brep-v1';recipeFingerprint='seam-recipe'}|ConvertTo-Json -Depth 10)))
 }
 $request=Request .2;$payload=[WebCADServices.Runtime.NativeAdapter]::Validate($request,$store,$owner)
 $job=$store.Submit($owner,'seam-key',$payload,$request);$row=$store.Claim('occt')
 $manifest=[WebCADServices.Runtime.NativeAdapter]::Execute($row,$store,[Func[bool]]{return $false})
 Assert ([double]$manifest['blendReport']['radiusUsedMm'] -eq .2) 'Exact seam radius'
 Assert ([int]$manifest['inputSha256'].Count -eq 2) 'Both input hashes'
 Assert ([int]$manifest['validation']['solidCount'] -eq 1) 'Single valid result'
 $store.Finish([string]$job['jobId'],'succeeded',$manifest.ToString([Newtonsoft.Json.Formatting]::None),$null)
 $alias=$store.Submit($owner,'alias-key',$payload,$request);Assert ([string]$alias['jobId'] -eq [string]$job['jobId']) 'Idempotent physical cache'
 $rangeRequest=Request @{maxMm=1000;minMm=.2;maxAttempts=2};$rangePayload=[WebCADServices.Runtime.NativeAdapter]::Validate($rangeRequest,$store,$owner)
 $rangeJob=$store.Submit($owner,'range-key',$rangePayload,$rangeRequest);$rangeRow=$store.Claim('occt');$rangeManifest=[WebCADServices.Runtime.NativeAdapter]::Execute($rangeRow,$store,[Func[bool]]{return $false})
 Assert ([int]$rangeManifest['blendReport']['attemptCount'] -eq 2) 'Explicit native range sample count'
 Assert ([double]$rangeManifest['blendReport']['radiusUsedMm'] -eq .2) 'Actual sampled radius returned'
 $store.Finish([string]$rangeJob['jobId'],'succeeded',$rangeManifest.ToString([Newtonsoft.Json.Formatting]::None),$null)
 $badRange=Request @{maxMm=1000;minMm=900;maxAttempts=2};$badPayload=[WebCADServices.Runtime.NativeAdapter]::Validate($badRange,$store,$owner)
 $badJob=$store.Submit($owner,'bad-range-key',$badPayload,$badRange);$badRow=$store.Claim('occt');$failure=$null
 try{[void][WebCADServices.Runtime.NativeAdapter]::Execute($badRow,$store,[Func[bool]]{return $false})}catch{$failure=$_.Exception;while($failure.InnerException){$failure=$failure.InnerException}}
 Assert ($null -ne $failure -and $failure.Code -eq 'BLEND_BUILD_FAILED') 'Range failure is explicit'
 Assert ([int]$failure.BlendDiagnostics['tried'].Count -eq 2) 'Failure diagnostics preserve every requested candidate'
 Assert ([int]$failure.BlendDiagnostics['pointsMm'].Count -le 16) 'Failure locations are bounded'
 $store.Finish([string]$badJob['jobId'],'failed',$null,$failure.Body().ToString([Newtonsoft.Json.Formatting]::None))
 $other=Request .3;$otherPayload=[WebCADServices.Runtime.NativeAdapter]::Validate($other,$store,$owner)
 $otherJob=$store.Submit($owner,'other-radius',$otherPayload,$other);Assert ([string]$otherJob['inputFingerprint'] -ne [string]$job['inputFingerprint']) 'Radius belongs to physical identity';[void]$store.Cancel($owner,[string]$otherJob['jobId'])
 $bad=$request.DeepClone();$bad['params']['toolPaths']=[Newtonsoft.Json.Linq.JArray]::new('untrusted')
 $rejected=$false;try{[void][WebCADServices.Runtime.NativeAdapter]::Validate($bad,$store,$owner)}catch{$rejected=$true};Assert $rejected 'Client disk paths rejected'
 [IO.File]::WriteAllText((Join-Path $DataRoot 'manifest.json'),$manifest.ToString())
 @{status='passed';scope='actual Runtime/Store/controlled native job, ordered hashes/cache/radius/whitelist';producerKernelBuildId=$build}|ConvertTo-Json|Set-Content "$DataRoot/acceptance.json"
 Write-Output 'passed: native seam Runtime/Store protocol'
}finally{$store.Dispose()}
