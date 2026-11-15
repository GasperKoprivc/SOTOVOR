@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Namesti Node.js 24 ali novejsi in ponovno zazeni start.bat.
    pause
    exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 24 ? 1 : 0)"
if errorlevel 1 (
    echo Sotovor potrebuje Node.js 24 ali novejsi.
    pause
    exit /b 1
)
if not exist "node_modules\mongodb\package.json" (
    call npm ci
    if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
node --env-file-if-exists=.env scripts/start.js
set "SOTOVOR_EXIT=%ERRORLEVEL%"
if not "%SOTOVOR_EXIT%"=="0" pause
exit /b %SOTOVOR_EXIT%

:failed
echo Namestitev paketov ali gradnja ni uspela.
pause
exit /b 1
