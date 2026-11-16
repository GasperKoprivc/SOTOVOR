@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Namesti Node.js 24 ali novejsi.
    goto failed
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) < 24 ? 1 : 0)"
if errorlevel 1 goto failed
pushd apps\desktop
if errorlevel 1 goto failed
if not exist "node_modules\electron\package.json" goto install
fc /b package-lock.json "node_modules\.sotovor-package-lock" >nul 2>nul
if errorlevel 1 goto install
goto launch

:install
call npm ci
if errorlevel 1 goto failed
copy /y package-lock.json "node_modules\.sotovor-package-lock" >nul
if errorlevel 1 goto failed

:launch
popd
if not defined SOTOVOR_URL (
    set "SOTOVOR_NO_BROWSER=1"
    node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1000)}).then(r=>r.json()).then(v=>process.exit(v.service==='sotovor'?0:1)).catch(()=>process.exit(1))"
    if errorlevel 1 start "Sotovor - lokalni streznik" "%ComSpec%" /d /c start.bat
)
call npm --prefix apps/desktop start
if errorlevel 1 goto failed
exit /b 0

:failed
echo Zagon namiznega Sotovora ni uspel. Preveri izpis.
pause
exit /b 1
