@echo off
chcp 65001 >nul
title GitHub 周报 · 功能开关
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0flag-tool.ps1"
pause