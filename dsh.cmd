@echo off
setlocal
pushd "%~dp0"
".runtime\node-v24.20.0-win-x64\node.exe" --import tsx/esm "apps\cli\src\bin.ts" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
