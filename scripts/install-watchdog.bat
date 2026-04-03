@echo off
:: FireFlow Watchdog  Windows Service Installer
:: Requires: Administrator privileges
:: Uses: NSSM (Non-Sucking Service Manager) if available, else sc.exe wrapper

setlocal enabledelayedexpansion

set SERVICE_NAME=FireflowWatchdog
set SERVICE_DESC=FireFlow POS Auto-Recovery Watchdog
set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
set NODE_EXE=%APPDATA%\npm\node.cmd

:: Resolve node.exe full path
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_EXE=%%i

if not exist "%NODE_EXE%" (
    echo [ERROR] node.exe not found in PATH. Is Node.js installed?
    pause & exit /b 1
)

echo [INFO] Node.js: %NODE_EXE%
echo [INFO] Root:    %ROOT_DIR%
echo [INFO] Service: %SERVICE_NAME%

:: Check if NSSM is available (preferred for proper Windows Service wrapping)
where nssm >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] NSSM found  using NSSM for service registration
    goto :install_nssm
)

echo [WARN] NSSM not found  using scheduled task fallback (runs at logon)
goto :install_task

::  NSSM install (preferred) 
:install_nssm
nssm stop  "%SERVICE_NAME%" 2>nul
nssm remove "%SERVICE_NAME%" confirm 2>nul

nssm install "%SERVICE_NAME%" "%NODE_EXE%"
nssm set "%SERVICE_NAME%" AppParameters --import tsx "%ROOT_DIR%\src\api\server.ts"
nssm set "%SERVICE_NAME%" AppDirectory  "%ROOT_DIR%"
nssm set "%SERVICE_NAME%" Description  "%SERVICE_DESC%"
nssm set "%SERVICE_NAME%" Start        SERVICE_AUTO_START
nssm set "%SERVICE_NAME%" AppStdout    "%ROOT_DIR%\logs\watchdog-svc.log"
nssm set "%SERVICE_NAME%" AppStderr    "%ROOT_DIR%\logs\watchdog-svc-err.log"
nssm set "%SERVICE_NAME%" AppRotateFiles 1
nssm set "%SERVICE_NAME%" AppRotateBytes 10485760

:: Register a second NSSM service for the watchdog itself
set WATCHDOG_SVC=FireflowWatchdogMonitor
nssm stop  "%WATCHDOG_SVC%" 2>nul
nssm remove "%WATCHDOG_SVC%" confirm 2>nul
nssm install "%WATCHDOG_SVC%" "%NODE_EXE%"
nssm set "%WATCHDOG_SVC%" AppParameters "%ROOT_DIR%\scripts\watchdog.js"
nssm set "%WATCHDOG_SVC%" AppDirectory  "%ROOT_DIR%"
nssm set "%WATCHDOG_SVC%" Description  "FireFlow Watchdog Monitor"
nssm set "%WATCHDOG_SVC%" Start        SERVICE_AUTO_START
nssm set "%WATCHDOG_SVC%" AppStdout    "%ROOT_DIR%\logs\watchdog.log"
nssm set "%WATCHDOG_SVC%" AppStderr    "%ROOT_DIR%\logs\watchdog-err.log"
nssm set "%WATCHDOG_SVC%" AppRotateFiles 1

nssm start "%WATCHDOG_SVC%"
echo [OK] Services installed and started via NSSM.
echo      FireflowWatchdog         the Express server
echo      FireflowWatchdogMonitor  the watchdog monitor
goto :done

::  Scheduled Task fallback (no NSSM) 
:install_task
set TASK_NAME=FireflowWatchdog
set WATCHDOG_JS=%ROOT_DIR%\scripts\watchdog.js

:: Remove old task if exists
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create task: runs at startup, repeats every 5 min, auto-restart on failure
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%NODE_EXE%\" \"%WATCHDOG_JS%\"" ^
  /sc ONSTART ^
  /ru SYSTEM ^
  /rl HIGHEST ^
  /f

if %errorlevel% neq 0 (
    echo [ERROR] Failed to create scheduled task. Run as Administrator.
    pause & exit /b 1
)

:: Also add a repetition trigger every 5 minutes (in case watchdog crashes)
schtasks /change /tn "%TASK_NAME%" /ri 05 /du 9999:59 >nul 2>&1

echo [OK] Scheduled task "%TASK_NAME%" created.
echo      Runs as SYSTEM at startup and every 5 minutes.

:: Start it now
schtasks /run /tn "%TASK_NAME%"
echo [OK] Watchdog started.

:done
echo.
echo [DONE] FireFlow Watchdog installation complete.
echo        Check logs\watchdog.log for status.
pause
