@echo off
title Fortress Backup Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0setup.ps1"
echo.
pause
