@echo off
title Fortress Backup Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0setup.ps1"
