@echo off
rem Double-click to install or update instinct and its agents. See setup.ps1 for options.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
pause
