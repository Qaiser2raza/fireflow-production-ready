@echo off
:: FireFlow Watchdog  Uninstaller
setlocal

set SERVICE_NAME=FireflowWatchdog
set WATCHDOG_SVC=FireflowWatchdogMonitor
set TASK_NAME=FireflowWatchdog

echo [INFO] Stopping and removing FireFlow Watchdog...

:: NSSM path
where nssm >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Removing NSSM services...
    nssm stop   "%WATCHDOG_SVC%" 2>nul
    nssm remove "%WATCHDOG_SVC%" confirm 2>nul
    nssm stop   "%SERVICE_NAME%" 2>nul
    nssm remove "%SERVICE_NAME%" confirm 2>nul
    echo [OK] NSSM services removed.
)

:: Scheduled Task
echo [INFO] Removing scheduled task...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Scheduled task "%TASK_NAME%" removed.
) else (
    echo [WARN] Task not found or already removed.
)

:: Kill any running watchdog node processes (best-effort)
echo [INFO] Killing any watchdog node processes...
for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    wmic process where "ProcessId=%%~p" get CommandLine 2>nul | findstr /i "watchdog.js" >nul
    if !errorlevel! equ 0 (
        taskkill /pid %%~p /f >nul 2>&1
        echo [OK] Killed watchdog PID %%~p
    )
)

echo.
echo [DONE] FireFlow Watchdog removed.
pause
