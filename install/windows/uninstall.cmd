@echo off
rem Double-click to remove instinct (and ~\instinct if it has no uncommitted work). Programs stay.
rem (goto) ends batch mode first: this file is deleted with the clone, so cmd must not read on.
(goto) 2>nul & powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Uninstall %* & pause
