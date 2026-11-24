@echo off
title Allow phone access to gh-weekly
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0open-phone-access.ps1\"' -Verb RunAs"
exit
