param([Parameter(Mandatory=$true)][string]$ReferenceDirectory,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot
$source=Join-Path $repo 'host/Goldenluck.WebCADHost'
$framework=Join-Path $env:windir 'Microsoft.NET/Framework64/v4.0.30319'
$sdk=Get-ChildItem (Join-Path $env:ProgramFiles 'dotnet/sdk') -Directory|Sort-Object Name -Descending|Select-Object -First 1
$compiler=Join-Path $sdk.FullName 'Roslyn/bincore/csc.dll'
New-Item -ItemType Directory -Path $OutputDirectory,"$OutputDirectory/bin" -Force|Out-Null
$dll=Join-Path $OutputDirectory 'bin/Goldenluck.WebCADHost.dll'
$arguments=@('exec',$compiler,'/nologo','/target:library','/optimize+','/deterministic+','/nostdlib+','/platform:anycpu',"/out:$dll")
foreach($name in @('mscorlib','System','System.Core','System.Web','System.Net.Http','System.Configuration','System.Data','System.Xml','System.Security','System.Runtime.Serialization')){$arguments+='/r:'+(Join-Path $framework "$name.dll")}
foreach($name in @('BLL','DAL','Main','Model','ChatClass','Newtonsoft.Json','BouncyCastle.Cryptography')){$arguments+='/r:'+(Join-Path $ReferenceDirectory "$name.dll")}
$arguments+=@(Get-ChildItem -LiteralPath $source -File -Filter '*.cs'|ForEach-Object FullName)
& dotnet @arguments
if($LASTEXITCODE){throw 'Independent Agent host compilation failed.'}
$stream=[IO.File]::OpenRead($dll);$pe=[System.Reflection.PortableExecutable.PEReader]::new($stream)
try{
 $md=[System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
 $refs=@(foreach($h in $md.AssemblyReferences){$r=$md.GetAssemblyReference($h);$md.GetString($r.Name)})
 $types=@(foreach($h in $md.TypeDefinitions){$t=$md.GetTypeDefinition($h);$md.GetString($t.Namespace)+'.'+$md.GetString($t.Name)})
 if($refs -contains 'Web' -or @($types|Where-Object {$_ -like 'Web.*'}).Count){throw 'Host must not reference Web.dll or define legacy Web namespace types.'}
}finally{$pe.Dispose();$stream.Dispose()}
foreach($file in Get-ChildItem -LiteralPath "$source/site" -Recurse -File){
 $relative=$file.FullName.Substring([IO.Path]::GetFullPath("$source/site").TrimEnd('/','\').Length+1)
 $target=Join-Path $OutputDirectory $relative
 New-Item -ItemType Directory -Path (Split-Path $target) -Force|Out-Null
 Copy-Item -LiteralPath $file.FullName -Destination $target
}
$files=@(Get-ChildItem -LiteralPath $OutputDirectory -Recurse -File|Where-Object Name -ne 'host-manifest.json'|ForEach-Object{@{path=$_.FullName.Substring([IO.Path]::GetFullPath($OutputDirectory).TrimEnd('/','\').Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$_.Length}})
@{format='webcad-independent-agent-host-v1';sourceOwner='WebCAD/host/Goldenluck.WebCADHost';assembly='Goldenluck.WebCADHost';namespace='Goldenluck.WebCAD.Hosting';references=$refs;types=$types;files=$files}|ConvertTo-Json -Depth 5|Set-Content "$OutputDirectory/host-manifest.json" -Encoding utf8
Get-FileHash -LiteralPath $dll -Algorithm SHA256
