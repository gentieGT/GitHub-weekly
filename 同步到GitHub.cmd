@echo off
chcp 65001 >nul
title 同步到 GitHub

cd /d "%~dp0"

echo ============================================
echo   同步 gh-weekly 到 GitHub
echo ============================================
echo.

git status --short
echo.

set /p MSG=提交说明（直接回车用时间戳）: 
if "%MSG%"=="" set MSG=update: %date% %time%

echo.
echo [1/3] 暂存改动...
git add -A

echo [2/3] 提交...
git commit -m "%MSG%"
if errorlevel 1 (
    echo     没有需要提交的改动，跳过
)

echo [3/3] 推送到 GitHub...
git push

echo.
if errorlevel 1 (
    echo ============================================
    echo   推送失败，请检查网络或代理
    echo ============================================
) else (
    echo ============================================
    echo   完成：https://github.com/gentieGT/GitHub-weekly
    echo ============================================
)
echo.
pause
