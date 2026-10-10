@echo off
title Push to GitHub (Hostel & Mess Management)
color 0B
cd /d "%~dp0.."

echo ==============================================================================
echo Pushing committed changes to GitHub repository:
echo https://github.com/Garvit-09/Hostel-and-mess-management
echo ==============================================================================
echo.

set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
if exist "%GIT_EXE%" (
    "%GIT_EXE%" push origin main
) else (
    git push origin main
)

echo.
pause
