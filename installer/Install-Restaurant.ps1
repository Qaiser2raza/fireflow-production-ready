[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', '')]
param (
    [string]$DbPassword = "fireflow_admin",
    [string]$DbPort = "5432"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🔥 FireFlow Restaurant System Setup 🔥" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "This script will install PostgreSQL, Node.js, and FireFlow."
Write-Host ""

# Request Admin Rights
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator!"
    exit
}

$InstallDir = "C:\FireFlow_Setup_Temp"
if (-Not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null }

# 1. Install PostgreSQL silently
Write-Host "[1/4] Checking PostgreSQL..." -ForegroundColor Yellow
if (-Not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
    $PgInstaller = "$InstallDir\postgresql-installer.exe"
    if (-Not (Test-Path $PgInstaller)) {
        Write-Host "      Downloading PostgreSQL 14..."
        Invoke-WebRequest -Uri "https://get.enterprisedb.com/postgresql/postgresql-14.10-1-windows-x64.exe" -OutFile $PgInstaller
    }
    Write-Host "      Installing PostgreSQL silently (this may take a few minutes)..."
    Start-Process -FilePath $PgInstaller -ArgumentList "--mode unattended --superpassword $DbPassword --serverport $DbPort" -Wait

    
    # Add to PATH
    $env:Path += ";C:\Program Files\PostgreSQL\14\bin"
    [Environment]::SetEnvironmentVariable("PATH", $env:Path, [EnvironmentVariableTarget]::Machine)
    Write-Host "      PostgreSQL Installed!" -ForegroundColor Green
} else {
    Write-Host "      PostgreSQL is already installed." -ForegroundColor Green
}

# 2. Install Node.js silently
Write-Host "[2/4] Checking Node.js..." -ForegroundColor Yellow
if (-Not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    $NodeInstaller = "$InstallDir\node-installer.msi"
    if (-Not (Test-Path $NodeInstaller)) {
        Write-Host "      Downloading Node.js..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi" -OutFile $NodeInstaller
    }
    Write-Host "      Installing Node.js silently..."
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$NodeInstaller`" /qn" -Wait
    Write-Host "      Node.js Installed!" -ForegroundColor Green
} else {
    Write-Host "      Node.js is already installed." -ForegroundColor Green
}

# 3. Setup Database
Write-Host "[3/4] Configuring FireFlow Database..." -ForegroundColor Yellow
Start-Sleep -Seconds 5 # Wait for PG to fully start
$env:PGPASSWORD = $DbPassword
& "C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres -p $DbPort -c "CREATE DATABASE fireflow_db;" 2>$null
Write-Host "      Database 'fireflow_db' is ready." -ForegroundColor Green

# 4. Install FireFlow App
Write-Host "[4/4] Launching FireFlow App Installer..." -ForegroundColor Yellow
$AppInstaller = ".\release\Fireflow Restaurant System Setup 1.0.0.exe"
if (Test-Path $AppInstaller) {
    Start-Process -FilePath $AppInstaller
    Write-Host "      Please follow the Windows installer prompt for FireFlow." -ForegroundColor Green
} else {
    Write-Host "      Could not find $AppInstaller! Please ensure it is in the 'release/' folder next to this script." -ForegroundColor Red
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Pre-requisite Installation Complete!" -ForegroundColor Cyan
Write-Host "After FireFlow finishes installing, it will launch automatically."
Write-Host "It will ask for your SaaS License Key to activate the restaurant."
Write-Host "========================================" -ForegroundColor Cyan
Pause
