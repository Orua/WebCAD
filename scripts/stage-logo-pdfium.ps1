param(
 [Parameter(Mandatory=$true)][string]$DependencyRoot,
 [Parameter(Mandatory=$true)][string]$LogoWorkerRoot
)
$ErrorActionPreference='Stop'
$dllHash='a318c39c137482dc4687c2973b7ec1c27fc1c20253cf2dc31928f922eab89e8f'
$version='158.0.8111.0'
function FixedRoot([string]$Path){
 $full=[IO.Path]::GetFullPath($Path).TrimEnd('\','/')
 if($full -notmatch '^F:[\\/]WebCADServices-local[\\/]'){throw 'Use a fixed F:/WebCADServices-local program/dependency directory'}
 if(!(Test-Path -LiteralPath $full -PathType Container)){throw "Program directory does not exist: $full"}
 return $full
}
$DependencyRoot=FixedRoot $DependencyRoot
$LogoWorkerRoot=FixedRoot $LogoWorkerRoot
$manifest=Get-Content -LiteralPath (Join-Path $DependencyRoot 'MANIFEST.json') -Raw|ConvertFrom-Json
if($manifest.version -ne $version -or $manifest.asset -ne 'pdfium-win-x64.tgz' -or $manifest.assetSha256 -ne '3452d11031050ec65e57f180215b57b9e6d465e3fbedafa8a77ad90885c7d23e'){throw 'Unexpected official PDFium preparation manifest'}
$files=@($manifest.runtimeFiles)
if(@($files|Where-Object path -Like 'licenses/*').Count -ne 18){throw 'Expected the complete 18-file third-party license set'}
$pinned=@{'bin/pdfium.dll'=$dllHash;'VERSION'='892b2e2a731c629b07e875324bc9f1e11ab5521476578a9c526c01e19fc599b1';'LICENSE'='8854f4388f1ca13b3ad9baa42e95f5546b4c0b17109c159256d3eca7be39b09b'}
$seen=@{}
foreach($file in $files){
 $relative=[string]$file.path
 if($relative -notmatch '^(bin/pdfium\.dll|LICENSE|VERSION|licenses/[A-Za-z0-9_.-]+)$' -or $seen.ContainsKey($relative)){throw 'Unexpected or duplicate PDFium manifest path'}
 $seen[$relative]=$true
 $path=Join-Path $DependencyRoot $relative
 if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw "Missing dependency: $relative"}
 $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
 if($hash -ne $file.sha256 -or (Get-Item -LiteralPath $path).Length -ne $file.bytes -or ($pinned.ContainsKey($relative) -and $hash -ne $pinned[$relative])){throw "PDFium integrity check failed: $relative"}
}
foreach($required in $pinned.Keys){if(!$seen.ContainsKey($required)){throw "Missing pinned dependency: $required"}}
# All source bytes are verified before staging starts. Preserve replaced program files.
$target=Join-Path $LogoWorkerRoot 'pdfium'
if(Test-Path -LiteralPath $target){
 $backup='G:/CAD-Workspace/WebCAD/backups/'+(Get-Date -Format 'yyyyMMdd-HHmmss-ffff')+'-stage-logo-pdfium'
 New-Item -ItemType Directory -Force $backup|Out-Null
 Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'pdfium') -Recurse
}
New-Item -ItemType Directory -Force (Join-Path $target 'licenses')|Out-Null
foreach($file in $files){
 $relative=if($file.path -eq 'bin/pdfium.dll'){'pdfium.dll'}else{$file.path}
 Copy-Item -LiteralPath (Join-Path $DependencyRoot $file.path) -Destination (Join-Path $target $relative)
 if((Get-FileHash -LiteralPath (Join-Path $target $relative) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw "Staged PDFium hash mismatch: $relative"}
}
$renderer=Join-Path $target 'renderer.json'
[IO.File]::WriteAllText($renderer,(@{variant='no-v8';sha256=$dllHash;version=$version}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{status='staged';root=$target;variant='no-v8';version=$version;sha256=$dllHash;rendererSha256=(Get-FileHash -LiteralPath $renderer -Algorithm SHA256).Hash.ToLowerInvariant();licenseFiles=18}
