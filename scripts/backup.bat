@echo off
setlocal EnableDelayedExpansion
title FireFlow POS - Database Backup Utility

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..
set BACKUP_DIR=%ROOT_DIR%\backups
set LOG_FILE=%BACKUP_DIR%\backup_log.txt

echo =======================================================
echo          FireFlow Database Backup Utility
echo =======================================================
echo.

:: Ensure backup directory exists
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

:: Get current timestamp (YYYYMMDD_HHMMSS)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value ^| find "="') do set DATETIME=%%I
set TIMESTAMP=%DATETIME:~0,4%%DATETIME:~4,2%%DATETIME:~6,2%_%DATETIME:~8,2%%DATETIME:~10,2%%DATETIME:~12,2%

:: Default DB credentials
set DB_USER=postgres
set DB_NAME=fireflow_local
set PGPASSWORD=admin123

:: Try to read from .env if it exists
if exist "%ROOT_DIR%\.env" (
    echo [INFO] Reading configuration from .env file...
    for /f "usebackq tokens=1,2 delims==" %%A in ("%ROOT_DIR%\.env") do (
        if "%%A"=="DATABASE_USER" set DB_USER=%%B
        if "%%A"=="DATABASE_NAME" set DB_NAME=%%B
        if "%%A"=="DATABASE_PASSWORD" set PGPASSWORD=%%B
    )
) else (
    echo [WARNING] No .env file found. Using default credentials.
)

set BACKUP_FILE=%BACKUP_DIR%\%DB_NAME%_%TIMESTAMP%.sql

echo [INFO] Starting backup of database '%DB_NAME%'...
echo [INFO] Target file: %BACKUP_FILE%

:: Run pg_dump
:: Note: pg_dump must be in system PATH, or provide full path to PostgreSQL bin
pg_dump -U %DB_USER% -d %DB_NAME% -F c -f "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo [%DATE% %TIME%] SUCCESS: Database '%DB_NAME%' backed up to %BACKUP_FILE% >> "%LOG_FILE%"
    echo [OK] Backup created successfully.
) else (
    echo [%DATE% %TIME%] ERROR: Failed to backup database '%DB_NAME%' >> "%LOG_FILE%"
    color 0C
    echo [ERROR] Backup failed. Please ensure PostgreSQL is running and pg_dump is accessible in PATH.
    echo Check %LOG_FILE% for details.
    pause
    exit /b 1
)

:: Cleanup: Keep only the 7 most recent backups in the directory
echo [INFO] Cleaning up old backups (keeping last 7)...

:: Use PowerShell to delete files older than the 7 newest matching the pattern
powershell -Command "$files = Get-ChildItem -Path '%BACKUP_DIR%' -Filter '%DB_NAME%_*.sql' | Sort-Object CreationTime -Descending; if ($files.Count -gt 7) { $files[7..($files.Count-1)] | Remove-Item -Force }"

if %ERRORLEVEL% equ 0 (
    echo [OK] Cleanup complete.
) else (
    echo [WARNING] Failed to clean up old backups.
)

echo.
echo [DONE] Backup process finished.
echo =======================================================
timeout /t 5 >nul
