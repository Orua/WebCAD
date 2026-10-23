#requires -Version 7.0
<#
.SYNOPSIS
Build once, synchronize changed frontend files, verify once, push scoped source.
.EXAMPLE
pwsh -File scripts/deploy.ps1 -Apply -SourcePaths src/changed.js,public/automation
.EXAMPLE
pwsh -File scripts/deploy.ps1 -BuildRoot G:/CAD-Workspace/WebCAD/builds/example
#>
[CmdletBinding()]
param(
 [string]$BuildRoot,
 [switch]$Apply,
 [switch]$LocalOnly,
 [string[]]$SourcePaths=@(),
 [string]$CommitMessage='发布已验证的 WebCAD 更新',
 [string]$WorkspaceCheckScript,
 [Microsoft.PowerShell.Commands.WebRequestSession]$WorkspaceSession,
 [string]$DataRoot='G:/CAD-Workspace/WebCAD',
 [string]$CredentialFile='F:/Project/Goldenluck/.secrets/ftp.enc.json'
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$run=Join-Path $DataRoot ('reports/deploy-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$backup=Join-Path $DataRoot ('backups/'+(Split-Path $run -Leaf))
New-Item -ItemType Directory -Force $run|Out-Null
$receipt=@{phase='started';report=$run;frontendOnly=$true;servicesImpact='none';logoImpact='none';nativeImpact='none'}
function SaveReceipt { $receipt|ConvertTo-Json -Depth 20|Set-Content "$run/RELEASE.json" -Encoding utf8 }
function Hash([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Git([string[]]$arguments) {
 $output=& git.exe -C $repo @arguments
 if($LASTEXITCODE -ne 0){throw "git failed: $($arguments[0])"}; return $output
}
function JsonGet([string]$url) { Invoke-RestMethod -Uri $url -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'} }
function Transfer([string]$path,[string]$file,[bool]$upload,[bool]$allowMissing=$false) {
 $url="ftp://$($script:secret.host):$($script:secret.port)/GOLDENLUCK/$path"
 $argsList=@('--silent','--show-error','--fail','--noproxy','*','--connect-timeout','10','--max-time','60','--user',$script:userpass)
 if($upload){$argsList+=@('--ftp-create-dirs','--upload-file',$file)}else{$argsList+=@('--output',$file)}
 & curl.exe @argsList $url
 if($allowMissing -and $LASTEXITCODE -eq 78){return}
 if($LASTEXITCODE -ne 0){throw "FTP failed: $path (exit $LASTEXITCODE)"}
}
function Mapping([string]$name) {
 $path=(& "$env:windir/System32/inetsrv/appcmd.exe" list vdir $name /text:physicalPath).Trim()
 if($LASTEXITCODE -ne 0 -or !$path){throw "Cannot resolve IIS mapping: $name"}
 return [Environment]::ExpandEnvironmentVariables($path)
}
function InstallFiles($files,[string]$target,[string]$label) {
 $count=0
 foreach($f in $files){
  $relative=$f.path.Substring(7);$destination=Join-Path $target $relative
  if((Test-Path -LiteralPath $destination) -and (Hash $destination) -eq $f.sha256){continue}
  if(Test-Path -LiteralPath $destination){
   $save=Join-Path "$backup/$label" $relative
   New-Item -ItemType Directory -Force (Split-Path $save)|Out-Null
   Copy-Item -LiteralPath $destination -Destination $save
  }
  New-Item -ItemType Directory -Force (Split-Path $destination)|Out-Null
  Copy-Item -LiteralPath $f.local -Destination $destination;$count++
 }
 Write-Host "$label : $count changed files"
}
function VerifyEndpoint([string]$base) {
 $actual=JsonGet ($base+'automation/manifest.json')
 foreach($key in @('buildId','version','catalogHash','docsHash')){
  if($actual.$key -ne $candidate.$key){throw "Endpoint mismatch: $base $key"}
 }
 $html=(Invoke-WebRequest $base -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}).Content
 $entry=[regex]::Match($html,'src="(\./assets/index-[^"]+\.js)"').Groups[1].Value
 if(!$entry){throw "Entry module missing: $base"}
 $bytes=Join-Path $run ('entry-'+$receipt.endpoints.Count+'.js')
 Invoke-WebRequest ([Uri]::new([Uri]$base,$entry)) -OutFile $bytes -TimeoutSec 20
 if((Hash $bytes) -ne (Hash (Join-Path $BuildRoot $entry.Substring(2)))){throw "Entry mismatch: $base"}
 $receipt.endpoints+=@{url=$base;buildId=$actual.buildId;pageApiVersion=$actual.version;catalogHash=$actual.catalogHash;docsHash=$actual.docsHash;entrySha256=Hash $bytes}
 Remove-Item -LiteralPath $bytes
}
$ptr=[IntPtr]::Zero
try {
 Set-Location $repo
 if((Git @('branch','--show-current')) -ne 'main'){throw 'Release requires canonical main checkout'}
 # localhost/webcad is the only maintained local frontend. Resolve current IIS mapping.
 $web=Mapping 'Default Web Site/'
 $mirror=Join-Path $web 'webcad'
 [xml]$vdirs=& "$env:windir/System32/inetsrv/appcmd.exe" list vdir /xml
 $mapped=@($vdirs.appcmd.VDIR|Where-Object {$_.'VDIR.NAME' -in @('Default Web Site/webcad/','Default Web Site/webcad')})
 if($mapped.Count){$mirror=Mapping $mapped[0].'VDIR.NAME'}
 $receipt.mappings=@{local=$mirror;production='https://goldenfu.cn/webcad/'}
 $receipt.localUrl='http://localhost/webcad/'
 if($Apply -and !$LocalOnly){
  if($WorkspaceCheckScript){
   $WorkspaceCheckScript=(Resolve-Path -LiteralPath $WorkspaceCheckScript).Path
  }else{
   $workspaceUrl='https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx'
   $request=@{Uri=$workspaceUrl;TimeoutSec=20}
   if($WorkspaceSession){$request.WebSession=$WorkspaceSession}
   $workspaceHtml=(Invoke-WebRequest @request).Content
   $bootstrap=[regex]::Match($workspaceHtml,'(?s)<script[^>]*id="webcad-config"[^>]*>(.*?)</script>').Groups[1].Value
   if(!$bootstrap){throw 'Workspace requires an authenticated -WorkspaceSession or -WorkspaceCheckScript (no files changed)'}
   $workspaceConfig=$bootstrap|ConvertFrom-Json
   $workspaceBase=[Uri]::new([Uri]$workspaceUrl,$workspaceConfig.pageUrl)
   if($workspaceBase.AbsoluteUri -ne 'https://goldenfu.cn/webcad/'){throw 'Workspace embeds a different frontend; align its host configuration first'}
  }
 }
 if(!$BuildRoot){
  if(!$Apply){throw 'Preview requires -BuildRoot; -Apply without it builds once on G:'}
  $BuildRoot=Join-Path $DataRoot ('builds/'+(Split-Path $run -Leaf))
  $previousDist=$env:WEBCAD_DIST_DIR
  try{$env:WEBCAD_DIST_DIR=$BuildRoot;& npm.cmd run build;if($LASTEXITCODE -ne 0){throw 'Build failed'}}
  finally{$env:WEBCAD_DIST_DIR=$previousDist}
 }
 $BuildRoot=(Resolve-Path -LiteralPath $BuildRoot).Path
 $candidate=Get-Content "$BuildRoot/automation/manifest.json" -Raw|ConvertFrom-Json
 $receipt.candidate=$candidate|Select-Object buildId,version,catalogHash,docsHash
 if(!$LocalOnly){
 $baseline=JsonGet 'https://goldenfu.cn/webcad/automation/manifest.json'
 $receipt.baseline=$baseline|Select-Object buildId,version,catalogHash,docsHash
 # Credentials remain transient; never write them into plan, progress or receipt.
 $script:secret=Get-Content $CredentialFile -Raw|ConvertFrom-Json
 $secure=$script:secret.encryptedPassword|ConvertTo-SecureString -Key ([IO.File]::ReadAllBytes($script:secret.keyFile))
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 $script:userpass=$script:secret.username+':'+[Runtime.InteropServices.Marshal]::PtrToStringUni($ptr)
 Transfer '.deploy-manifest.json' "$run/manifest-before.json" $false
 }else{
  @{files=@()}|ConvertTo-Json|Set-Content "$run/manifest-before.json" -Encoding utf8
 }
 $planArgs=@("$PSScriptRoot/deploy-plan.mjs",$BuildRoot,"$run/manifest-before.json")
 if($LocalOnly){$planArgs+=@('--local-root',$mirror)}
 $planText=& node @planArgs
 if($LASTEXITCODE -ne 0){throw 'File planning failed'}
 $planText|Set-Content "$run/plan.json" -Encoding utf8
 $plan=$planText|ConvertFrom-Json
 $receipt.changedFiles=@($plan.changed).Count
 $destinationLabel=if($LocalOnly){'Localhost'}else{'Production'}
 Write-Host "$destinationLabel changes: $($receipt.changedFiles) / $($plan.files.Count) files"
 if(!$Apply){$receipt.phase='planned-no-mutation';SaveReceipt;return}
 # Bind this package to maintained source, allowing a build made before its commit.
 $identityText=& node --input-type=module -e "import{readBuildIdentity}from'./scripts/build-identity.mjs';console.log(JSON.stringify(readBuildIdentity(process.cwd())))"
 if($LASTEXITCODE -ne 0){throw 'Source identity failed'}
 $identity=$identityText|ConvertFrom-Json
 if($candidate.buildId -notmatch ('-src-'+$identity.sourceHash.Substring(0,16)+'(?:-working)?$')){throw 'Package does not match current source; rebuild once'}
 $receipt.sourceHash=$identity.sourceHash
 if($LocalOnly){
  $receipt.endpoints=@()
  InstallFiles $plan.files $mirror 'localhost'
  VerifyEndpoint 'http://localhost/webcad/'
  $receipt.phase='completed-local-only';SaveReceipt
  Write-Host "Local ready: http://localhost/webcad/ ; report $run"
  return
 }
 if(Git @('diff','--cached','--name-only')){throw 'Existing staged changes must be preserved; finish them before release'}
 $dirty=@(Git @('diff','HEAD','--name-only'))
 $newSource=@(Git @('ls-files','--others','--exclude-standard','--','src','scripts','docs','skills','contracts','services'))
 if($newSource.Count -and !$SourcePaths.Count){throw 'New source files require an explicit -SourcePaths commit scope'}
 if($dirty.Count -and !$SourcePaths.Count){throw 'Pass -SourcePaths with the exact source scope to commit; unrelated work is preserved'}
 if(@($dirty+$newSource)|Where-Object {$_ -match '^(services/|contracts/services/)'} ){throw 'Backend source changed: publish its matching DLL/Native package using the Services release procedure first'}
 $receipt.endpoints=@()
 # Capture old production bytes BEFORE replacing the sole local frontend.
 $known=@{};foreach($f in (Get-Content "$run/manifest-before.json" -Raw|ConvertFrom-Json).files){$known[$f.path]=$f}
 foreach($f in $plan.changed){
  $save=Join-Path "$backup/production" $f.path
  New-Item -ItemType Directory -Force (Split-Path $save)|Out-Null
  $mirrorFile=Join-Path $mirror $f.path.Substring(7)
  if($known.ContainsKey($f.path) -and (Test-Path -LiteralPath $mirrorFile) -and (Hash $mirrorFile) -eq $known[$f.path].sha256){
   Copy-Item -LiteralPath $mirrorFile -Destination $save
  }else{Transfer $f.path $save $false (!$known.ContainsKey($f.path))}
 }
 InstallFiles $plan.files $mirror 'localhost'
 VerifyEndpoint 'http://localhost/webcad/'
 # Freeze source and candidate bytes before publishing any production files.
 foreach($f in $plan.files){if((Hash $f.local) -ne $f.sha256){throw "Package changed: $($f.path)"}}
 $live=JsonGet 'https://goldenfu.cn/webcad/automation/manifest.json'
 if($live.buildId -ne $baseline.buildId){throw 'Production changed during preparation; replan against the new version'}
 if($SourcePaths.Count){
  foreach($path in $SourcePaths){
   if([IO.Path]::IsPathRooted($path) -or $path -eq '.' -or $path -match '[:*?\[\]]|(^|[/\\])\.\.([/\\]|$)' -or $path -match '^(agent|dist|node_modules|\.git|\.codex|webcad-skills)([/\\]|$)' -or $path -match '\.(png|jpg|zip|dll|wasm|log)$'){throw "Invalid source scope: $path"}
  }
  Git (@('add','--')+$SourcePaths)|Out-Null
  if(Git @('diff','--cached','--name-only')){Git @('commit','-m',$CommitMessage)|Out-Host}
 }
 # A package must never include tracked source left outside the committed scope.
 $remaining=@(Git @('diff','HEAD','--name-only','--','src','scripts','docs','skills','public','contracts','services','index.html','package.json','package-lock.json','vite.config.mjs','PROJECT.md'))
 $remaining+=@(Git @('ls-files','--others','--exclude-standard','--','src','scripts','docs','skills','contracts','services'))
 if($remaining.Count){throw 'Build source still has uncommitted files outside -SourcePaths; production not changed'}
 Git @('push','origin','HEAD:main')|Out-Host
 $commit=Git @('rev-parse','HEAD')
 $remote=Git @('ls-remote','origin','refs/heads/main')
 if(($remote -split '\s+')[0] -ne $commit){throw 'GitHub main push not confirmed'}
 $receipt.commit=$commit;$receipt.push='verified';SaveReceipt
 $uploaded=@()
 foreach($f in $plan.changed){
  Transfer $f.path $f.local $true
  $uploaded+=$f.path;$receipt.uploaded=$uploaded;SaveReceipt
  Write-Progress -Activity 'Incremental deployment' -Status "$($uploaded.Count)/$($plan.changed.Count)" -PercentComplete (100*$uploaded.Count/[Math]::Max(1,$plan.changed.Count))
 }
 # Persist manifest immediately after transfer, including when authenticated workspace check is unavailable.
 if($plan.changed.Count){
  Transfer '.deploy-manifest.json' "$run/manifest-latest.json" $false
  $mergeText=& node "$PSScriptRoot/deploy-plan.mjs" $BuildRoot "$run/manifest-latest.json"
  if($LASTEXITCODE -ne 0){throw 'Manifest merge failed'}
  ($mergeText|ConvertFrom-Json).manifest|ConvertTo-Json -Depth 30|Set-Content "$run/manifest-after.json" -Encoding utf8
  Transfer '.deploy-manifest.json' "$run/manifest-after.json" $true
 }
 VerifyEndpoint 'https://goldenfu.cn/webcad/'
 $receipt.phase='static-published-workspace-unverified';SaveReceipt
 # This hook reads the existing authenticated browser; it must not reload a user project.
 if($WorkspaceCheckScript){$workspace=& $WorkspaceCheckScript}
 else{
  # The actual authenticated workspace response selected this exact public URL;
  # reuse its already checked HTTP identity instead of fetching the same bytes again.
  $workspace=@{};foreach($property in $receipt.endpoints[-1].Keys){$workspace[$property]=$receipt.endpoints[-1][$property]}
  $workspace.url=$workspaceUrl;$workspace.embeddedUrl=$workspaceBase.AbsoluteUri
 }
 foreach($key in @('buildId','catalogHash','docsHash')){if($workspace.$key -ne $candidate.$key){throw "Workspace mismatch: $key"}}
 if($workspace.pageApiVersion -ne $candidate.version -or $workspace.url -ne 'https://goldenfu.cn/AI/WebCAD/WebCADWorkspace.aspx'){throw 'Workspace API version or URL mismatch'}
 if($workspace.entrySha256 -ne $receipt.endpoints[-1].entrySha256){throw 'Workspace entry hash mismatch'}
 $receipt.workspace=$workspace;$receipt.phase='completed-deployed-and-pushed';SaveReceipt
 Write-Host "Complete: $($receipt.changedFiles) uploaded; commit $commit; report $run"
} catch {
 $receipt.error=$_.Exception.Message
 if($receipt.phase -ne 'static-published-workspace-unverified'){$receipt.phase='failed'}
 SaveReceipt;throw
} finally {
 if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $script:userpass=$null;$script:secret=$null
}
