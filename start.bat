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
if not exist "node_modules\mongodb\package.json" goto install
fc /b package-lock.json "node_modules\.sotovor-package-lock" >nul 2>nul
if errorlevel 1 goto install
goto build

:install
call npm ci
if errorlevel 1 goto failed
copy /y package-lock.json "node_modules\.sotovor-package-lock" >nul
if errorlevel 1 goto failed

:build
call npm run build
if errorlevel 1 goto failed
if "%SOTOVOR_WEB_ONLY%"=="1" (
    set "SOTOVOR_DESKTOP=0"
    goto server
)
if "%SOTOVOR_NO_BROWSER%"=="1" if not "%SOTOVOR_DESKTOP%"=="1" goto server
set "SOTOVOR_DESKTOP=1"
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if errorlevel 1 (
    echo Za namizni Sotovor namesti Rust. Nadaljujem s spletno aplikacijo.
    set "SOTOVOR_DESKTOP=0"
    goto server
)
cargo build --release --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --target-dir apps/desktop/src-tauri/target
if errorlevel 1 goto failed

:server
if exist ".env" (
    node --env-file=.env scripts/start.js
) else (
    node scripts/start.js
)
set "SOTOVOR_EXIT=%ERRORLEVEL%"
if "%SOTOVOR_EXIT%"=="10" (
    echo Prvotni streznik se naprej tece. To okno lahko zapres.
    pause
    exit /b 0
)
if not "%SOTOVOR_EXIT%"=="0" pause
exit /b %SOTOVOR_EXIT%

:failed
echo Namestitev paketov ali gradnja ni uspela.
pause
exit /b 1
