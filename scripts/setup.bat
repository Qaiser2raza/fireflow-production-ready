@echo off
setlocal EnableDelayedExpansion
title FireFlow POS Installation Wizard
color 0B

echo =======================================================
echo          Welcome to FireFlow POS Setup Wizard
echo =======================================================
echo.
echo This wizard will guide you through installing and
echo configuring your FireFlow restaurant management system.
echo.
pause

:: Step 1: Check Node.js
echo.
echo [1/7] Checking System Requirements...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js v18 or higher from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1,2,3 delims=." %%a in ('node -v') do (
    set NODE_MAJOR=%%a
    set NODE_MAJOR=!NODE_MAJOR:v=!
)

if !NODE_MAJOR! LSS 18 (
    color 0E
    echo [WARNING] Node.js version is !NODE_MAJOR!. Suggested minimum is v18.
    echo Installation will continue, but you may experience issues.
    pause
) else (
    echo [OK] Node.js version !NODE_MAJOR! detected.
)

:: Step 2: Check PostgreSQL
where psql >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] psql utility not found in PATH. 
    echo Checking if PostgreSQL service is running instead...
)

sc query | findstr /i "postgresql" >nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] PostgreSQL service does not appear to be running.
    echo Please ensure PostgreSQL is installed and the service is active.
    pause
    exit /b 1
) else (
    echo [OK] PostgreSQL service detected.
)

:: Step 3: NPM Install
echo.
echo [2/7] Installing Dependencies (This may take a few minutes)...
cd ..
call npm install
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Failed to install NPM dependencies. Please check the network or npm logs.
    pause
    exit /b 1
)
echo [OK] Dependencies installed successfully.

:: Step 4: Environment Variables setup
echo.
echo [3/7] Configuring Environment...
if exist ".env" (
    echo [INFO] .env file already exists. Skipping environment creation.
) else (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [OK] .env file created from .env.example.
    ) else (
        echo [WARNING] .env.example not found. Creating a generic .env file.
        echo DATABASE_USER=postgres> .env
        echo DATABASE_PASSWORD=admin123>> .env
        echo DATABASE_NAME=fireflow_local>> .env
        echo DATABASE_PORT=5432>> .env
        echo SERVER_PORT=3001>> .env
        echo DATABASE_URL="postgresql://postgres:admin123@localhost:5432/fireflow_local?schema=public">> .env
    )
    
    echo.
    echo We need to setup your database connection.
    echo Default PostgreSQL user is usually 'postgres'.
    set /p DB_PASS="Enter your PostgreSQL password [default: admin123]: "
    if "!DB_PASS!"=="" set DB_PASS=admin123
    
    :: Basic replace in .env file using PowerShell
    powershell -Command "(Get-Content .env) -replace 'DATABASE_PASSWORD=.*', 'DATABASE_PASSWORD=!DB_PASS!' | Set-Content .env"
    powershell -Command "(Get-Content .env) -replace 'postgresql://postgres:.*?@', 'postgresql://postgres:!DB_PASS!@' | Set-Content .env"
    echo [OK] Database credentials updated in .env.
)

:: Step 5: Database Schema and Seeding
echo.
echo [4/7] Setting up the Database...
echo Running database migrations...
call npx prisma migrate deploy
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Failed to deploy database migrations. Check your PostgreSQL credentials in the .env file.
    pause
    exit /b 1
)

echo Running database seed (Initial Data)...
call npm run db:seed
if %ERRORLEVEL% neq 0 (
    color 0E
    echo [WARNING] Database seed encountered an issue (it might have already been seeded). Continuing...
) else (
    echo [OK] Database setup complete.
)

:: Step 6: Install Watchdog Service
echo.
echo [5/7] Installing Auto-Recovery Watchdog Service...
cd scripts
call install-watchdog.bat
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Watchdog service installation encountered an issue. See logs.
)
cd ..

:: Step 7: Launch Application
echo.
echo [6/7] Application is starting in the background via Watchdog.
echo Launching frontend...
echo [INFO] Note: Assuming Vite frontend runs on port 5173 for dev or built static site on 3000.
start http://localhost:5173

:: Finish
echo.
echo [7/7] Installation Complete!
color 0A
echo =======================================================
echo          FIREFLOW POS SUCCESSFULLY INSTALLED
echo =======================================================
echo.
echo Your system is now running.
echo The Watchdog service ensures the backend stays online.
echo.
echo Default Login Credentials (if seeded):
echo PIN: 1234 (Manager Audit / Admin)
echo.
echo Note: If the browser shows an error immediately, wait a 
echo few seconds for the backend to finish booting and refresh.
echo =======================================================
pause
