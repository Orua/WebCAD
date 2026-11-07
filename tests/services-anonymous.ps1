param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot,[string]$LogoWorker)
$ErrorActionPreference='Stop'
if([IO.Path]::GetFullPath($DataRoot) -notmatch '^F:[\\/]'){throw 'Services runtime test data must use fixed F: storage'}
if(Test-Path -LiteralPath $DataRoot){throw 'Choose a fresh isolated test directory'}
New-Item -ItemType Directory -Path $DataRoot|Out-Null
Copy-Item -Path (Join-Path $RuntimeDirectory '*.dll') -Destination $DataRoot
foreach($architecture in @('x64','x86')){
 $source=Join-Path $RuntimeDirectory $architecture
 if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $DataRoot -Recurse}
}
$references=@('System.dll','System.Core.dll')+@('Newtonsoft.Json.dll','WebCADServices.Contracts.dll','WebCADServices.Runtime.dll','System.Data.SQLite.dll'|ForEach-Object{Join-Path $DataRoot $_})
$exe=Join-Path $DataRoot 'AnonymousTests.exe'
$arguments=@('/nologo','/target:exe','/platform:x64',"/out:$exe")+@($references|ForEach-Object{"/reference:$_"})+@(Join-Path $PSScriptRoot 'services-anonymous.cs')
& "$env:windir/Microsoft.NET/Framework64/v4.0.30319/csc.exe" @arguments
if($LASTEXITCODE -ne 0){throw 'Anonymous compute tests did not compile'}
$testArguments=@((Join-Path $DataRoot 'data'))
if($LogoWorker){$testArguments+=@($LogoWorker,(Join-Path (Split-Path $PSScriptRoot) 'services/WebCADServices/modules/LogoVector/tests/sample-ring.logo.json'))}
& $exe @testArguments
if($LASTEXITCODE -ne 0){throw 'Anonymous compute acceptance failed'}
