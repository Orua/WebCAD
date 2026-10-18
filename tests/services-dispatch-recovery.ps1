param([Parameter(Mandatory=$true)][string]$RuntimeDirectory,[Parameter(Mandatory=$true)][string]$DataRoot)
$ErrorActionPreference='Stop'
foreach($name in @('Newtonsoft.Json','WebCADServices.Contracts','WebCADServices.Runtime')){[void][Reflection.Assembly]::LoadFrom((Join-Path $RuntimeDirectory "$name.dll"))}
$credential='test-only-dispatch-recovery-credential'
$runtime=[WebCADServices.Runtime.ServiceRuntime]::new($DataRoot,(Join-Path $RuntimeDirectory 'WebCADServices.Runtime.dll'),$credential)
$flags=[Reflection.BindingFlags]'Instance,NonPublic'
$store=$runtime.GetType().GetField('store',$flags).GetValue($runtime)
$db=$store.GetType().GetField('db',$flags).GetValue($store)
$gate=$store.GetType().GetField('gate',$flags).GetValue($store)
$request=[WebCADServices.Contracts.WireRequest]::new();$request.Method='GET';$request.Route='/v1/health';$request.Credential=$credential
function Observe { return ,([Newtonsoft.Json.Linq.JObject]::Parse([Text.Encoding]::UTF8.GetString($runtime.Handle($request).Body))) }
try {
 [Threading.Monitor]::Enter($gate);try{$db.Close()}finally{[Threading.Monitor]::Exit($gate)}
 Start-Sleep -Milliseconds 1400
 $health=Observe
 if($health['storageAvailable'].Value -or !$health['dispatchersAlive'].Value){throw ('Storage failure must degrade health without killing dispatchers: '+$health.ToString())}
 [Threading.Monitor]::Enter($gate);try{$db.Open()}finally{[Threading.Monitor]::Exit($gate)}
 Start-Sleep -Milliseconds 1400
 $health=Observe
 if(!$health['storageAvailable'].Value -or !$health['dispatchersAlive'].Value){throw 'Dispatchers did not recover after database restoration'}
} finally { $runtime.Dispose() }
if($runtime.Handle($request).Status -ne 503){throw 'Stopping runtime must reject new requests'}
$reopened=[WebCADServices.Runtime.Store]::new($DataRoot);$reopened.Dispose()
Write-Output 'passed: actual dispatchers survive database failure, resume after restoration and release storage after shutdown'
