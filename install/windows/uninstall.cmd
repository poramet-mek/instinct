@echo off
rem Double-click to remove instinct (and ~\instinct if it has no uncommitted work). Programs stay.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Uninstall %*
pause
