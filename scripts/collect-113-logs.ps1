param([string]$Since='', [string]$Until='', [string]$OutputDirectory='', [switch]$OpenFolder)
$ErrorActionPreference='Stop'
$python='F:/Project/Goldenluck.CodexAgent/codex_python_api/.venv/Scripts/python.exe'
if(!(Test-Path -LiteralPath $python)){throw 'The existing Goldenluck Agent Python environment is unavailable.'}
$arguments=@("$PSScriptRoot/collect-agent-diagnostics.py")
if(!$OutputDirectory){$OutputDirectory=Join-Path 'G:/CAD-Workspace/WebCAD/logs' ('113-'+[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyyMMdd-HHmmss'))}
if($Since){$arguments+=@('--since',$Since)}
if($Until){$arguments+=@('--until',$Until)}
if($OutputDirectory){$arguments+=@('--output',$OutputDirectory)}
& $python @arguments
if($LASTEXITCODE -ne 0){throw '113 log collection failed; no automatic retry or remote task was started.'}
if($OpenFolder){Invoke-Item -LiteralPath $OutputDirectory}
