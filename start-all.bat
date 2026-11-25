@echo off
title Halifax Digital Twin - Starting Services
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1"
pause
