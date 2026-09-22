@echo off
setlocal
cd /d "%~dp0"
set "WEBCAD_ROOT=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 LTS or newer is required. Install Node.js, then double-click this file again.
 pause
 exit /b 1
)
node scripts\serve.mjs --probe
if errorlevel 2 goto prepare
if errorlevel 1 (
 echo Port 667 is occupied by another service. Nothing was stopped.
 echo Close that service yourself or ask for help, then retry.
 pause
 exit /b 1
)
echo Existing WebCAD found. Reusing it.
start "" "http://127.0.0.1:667"
exit /b 0
:prepare
if not exist node_modules\@modelcontextprotocol\sdk\dist\esm\server\mcp.js goto install
if not exist node_modules\ws\index.js goto install
if not exist node_modules\zod\package.json goto install
if exist dist\index.html goto launch
if exist node_modules\vite\bin\vite.js goto build
:install
call npm install
if errorlevel 1 goto failed
if exist dist\index.html goto launch
:build
call npm run build
if errorlevel 1 goto failed
:launch
if not exist agent\temp mkdir agent\temp
powershell -NoProfile -ExecutionPolicy Bypass -Command "$node=(Get-Command node).Source; $script=Join-Path $env:WEBCAD_ROOT 'scripts\serve.mjs'; $out=Join-Path $env:WEBCAD_ROOT 'agent\temp\webcad-server.log'; $err=Join-Path $env:WEBCAD_ROOT 'agent\temp\webcad-server-error.log'; Start-Process -FilePath $node -ArgumentList @(([char]34+$script+[char]34)) -WorkingDirectory $env:WEBCAD_ROOT -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err; for($i=0;$i -lt 40;$i++){try{$r=Invoke-RestMethod 'http://127.0.0.1:667/healthz' -TimeoutSec 1;if($r.identity -eq 'WebCAD-local-server-v1' -and $r.mcp -eq '/mcp'){Start-Process 'http://127.0.0.1:667';exit 0}}catch{};Start-Sleep -Milliseconds 250};exit 1"
if errorlevel 1 goto failed
exit /b 0
:failed
echo WebCAD could not start. See agent\temp\webcad-server-error.log.
pause
exit /b 1


