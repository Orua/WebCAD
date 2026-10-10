param([Parameter(Mandatory=$true)][string]$BuildRoot,[Parameter(Mandatory=$true)][string]$DataRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$repoRoot=Split-Path $PSScriptRoot
$programRoot=Join-Path $BuildRoot ('infrastructure-tests/'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($programRoot);[void][IO.Directory]::CreateDirectory($DataRoot)
foreach($file in @('install-services','start-package','initialize-services-local','test-services')){
 $tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile((Join-Path $repoRoot "scripts/$file.ps1"),[ref]$tokens,[ref]$errors)
 if($errors.Count){throw ($file+': '+($errors.Message -join '; '))}
}
Write-Output 'passed: installer and affected PowerShell parsers'
Add-Type -AssemblyName System.Configuration,System.Web
$mapped=[Configuration.ExeConfigurationFileMap]::new();$mapped.ExeConfigFilename=Join-Path $repoRoot 'services/WebCADServices/deploy/web.config'
$web=[Configuration.ConfigurationManager]::OpenMappedExeConfiguration($mapped,[Configuration.ConfigurationUserLevel]::None)
[void]$web.GetSection('system.web/authorization');[void]$web.GetSection('system.web/httpRuntime')
Write-Output 'passed: actual ASP.NET web.config sections parse'
$transport=@{pipeName=('r1-fixture-'+[Guid]::NewGuid().ToString('N'));allowedOrigin='http://127.0.0.1:17780';connectTimeoutMs=300;readTimeoutMs=300;writeTimeoutMs=300;authenticationTimeoutMs=400;overallTimeoutMs=1200}
[IO.File]::WriteAllText((Join-Path $DataRoot 'transport.json'),($transport|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$settings=[xml]'<appSettings><clear /></appSettings>'
foreach($entry in $transport.GetEnumerator()){$add=$settings.CreateElement('add');$add.SetAttribute('key','WebCAD.'+$entry.Key.Substring(0,1).ToUpperInvariant()+$entry.Key.Substring(1));$add.SetAttribute('value',[string]$entry.Value);[void]$settings.DocumentElement.AppendChild($add)}
$external=Join-Path $DataRoot 'external-appSettings.config';$settings.Save($external)
foreach($kind in @('gateway','host')){
 $name=if($kind -eq 'gateway'){'WebCADServices.Gateway'}else{'WebCADServices.Host'}
 $source=Join-Path $BuildRoot "bin/$name/Release/net48";$target=Join-Path $programRoot $kind
 [void][IO.Directory]::CreateDirectory($target);Copy-Item -Path "$source/*" -Destination $target -Recurse
 $dlls=@(Get-ChildItem -LiteralPath $target -Filter '*.dll' | Where-Object {$_.Name -ne 'System.Data.SQLite.dll'} | ForEach-Object {$_.FullName})
 if($kind -eq 'host'){
  Copy-Item -LiteralPath (Join-Path $target 'WebCADServices.Host.exe') -Destination (Join-Path $target 'WebCADServices.Host.dll')
  $dlls+=Join-Path $target 'WebCADServices.Host.dll';$dlls+=Join-Path $target 'System.Data.SQLite.dll'
 }
 $references=$dlls+@('System.dll','System.Core.dll','System.Web.dll','System.Configuration.dll','System.Security.dll','System.ServiceProcess.dll')
 $exe=Join-Path $target 'InfrastructureTests.exe'
 Add-Type -TypeDefinition (Get-Content -LiteralPath "$PSScriptRoot/services-$kind-infrastructure.cs" -Encoding UTF8 -Raw) -ReferencedAssemblies $references -OutputAssembly $exe -OutputType ConsoleApplication
 if($kind -eq 'gateway'){
  $configXml=[xml]'<configuration><appSettings /></configuration>'
  $configXml.SelectSingleNode('/configuration/appSettings').SetAttribute('file',$external)
  $config=$configXml.OuterXml
  [IO.File]::WriteAllText($exe+'.config',$config,[Text.UTF8Encoding]::new($false));& $exe
 }else{& $exe $DataRoot}
 if($LASTEXITCODE -ne 0){throw "Actual net48 $kind infrastructure tests failed"}
}
