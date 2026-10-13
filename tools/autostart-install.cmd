@echo off
rem Registers the BTC DESK logon task from a normal desktop session (not from inside a packaged app).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File toolsutostart.ps1 install > datautostart.log 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File toolsutostart.ps1 status >> datautostart.log 2>&1
