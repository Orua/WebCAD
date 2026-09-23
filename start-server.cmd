@echo off
setlocal
cd /d "%~dp0"
echo Starting optional local Agent mode.
echo Open http://127.0.0.1:667/agent after the build finishes.
echo Normal static WebCAD deployment still does not require this service.
call npm run agent
