@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
start "" "http://127.0.0.1:3210"
