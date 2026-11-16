@echo off
setlocal
set "SOTOVOR_DESKTOP=1"
set "SOTOVOR_NO_BROWSER=1"
call "%~dp0start.bat"
exit /b %ERRORLEVEL%
