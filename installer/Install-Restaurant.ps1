#Requires -RunAsAdministrator
<#
.SYNOPSIS
    FireFlow Restaurant POS – Full Installation Script
.DESCRIPTION
    Installs PostgreSQL 16, Node.js 20, creates the local database, runs Prisma
    migrations, writes the .env file, seeds default data, builds the QR PWA,
    configures Windows auto-start and firewall, then activates the license.
    Must be run as Administrator.
.PARAMETER DbPassword
    PostgreSQL superuser (postgres) password.
.PARAMETER DbPort
    PostgreSQL port (default: 5432).
.PARAMETER AppDir
    Path where FireFlow application files live (default: C:\FireFlow).
.PARAMETER LicenseToken
    Signed cryptographic license token (Header.Payload.Signature format) generated
    by HQ using your hardware fingerprint. Displayed during Step 9 if you don't
    have it yet — you can activate later by re-running this script with the token.
.PARAMETER SupabaseUrl
    Supabase project URL.
.PARAMETER SupabaseAnonKey
    Supabase publishable (anon) key.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', '')]
param (
    [string]$DbPassword      = "",
    [string]$DbPort          = "5432",
    [string]$AppDir          = "C:\FireFlow",
    [string]$LicenseToken    = "",   # Full Header.Payload.Signature token from HQ (optional at install time)
    [string]$SupabaseUrl     = "",
    [string]$SupabaseAnonKey = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host $Text -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "      $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "      $Text" -ForegroundColor Cyan
}

function Fail-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "  ❌ ERROR: $Message" -ForegroundColor Red
    Write-Host ""
    Write-Host "  The installation cannot continue. Please fix the error above and re-run this script." -ForegroundColor Red
    Pause
    exit 1
}

function Prompt-Required {
    param([string]$Name, [string]$Prompt, [switch]$IsSecret)
    if ($IsSecret) {
        $secure = Read-Host -Prompt "  → $Prompt" -AsSecureString
        $plain  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                      [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        return $plain
    } else {
        return (Read-Host -Prompt "  → $Prompt")
    }
}

function Get-VersionNumber {
    param([string]$VersionString)
    # Extract leading major version integer, e.g. "v20.11.0" → 20
    $clean = $VersionString -replace '[^0-9.]', '' 
    $parts = $clean.Split('.')
    return [int]$parts[0]
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   🔥 FireFlow Restaurant POS Setup 🔥  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " This script installs and configures"
Write-Host " FireFlow on this Windows machine."
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Verify running as Administrator
# ─────────────────────────────────────────────────────────────────────────────
$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "  ❌ This script must be run as Administrator." -ForegroundColor Red
    Write-Host "     Right-click PowerShell and choose 'Run as administrator'." -ForegroundColor Red
    Pause
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Prompt for any missing required parameters
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "  Checking required parameters..." -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    $DbPassword = Prompt-Required -Name "DbPassword" -Prompt "Enter PostgreSQL superuser password" -IsSecret
}
if ([string]::IsNullOrWhiteSpace($DbPassword)) { Fail-Step "DbPassword is required." }

if ([string]::IsNullOrWhiteSpace($AppDir)) {
    $AppDir = Prompt-Required -Name "AppDir" -Prompt "Enter FireFlow app directory [default: C:\FireFlow]"
    if ([string]::IsNullOrWhiteSpace($AppDir)) { $AppDir = "C:\FireFlow" }
}

# LicenseToken is OPTIONAL at install time — Step 9 will prompt for it interactively
# and display the hardware fingerprint so HQ can generate the token if needed.

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
    $SupabaseUrl = Prompt-Required -Name "SupabaseUrl" -Prompt "Enter your Supabase Project URL"
}
if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) { Fail-Step "SupabaseUrl is required." }

if ([string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
    $SupabaseAnonKey = Prompt-Required -Name "SupabaseAnonKey" -Prompt "Enter your Supabase Anon Key"
}
if ([string]::IsNullOrWhiteSpace($SupabaseAnonKey)) { Fail-Step "SupabaseAnonKey is required." }

# Temp folder for downloads
$TempDir = "$env:TEMP\FireFlow_Install"
if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Force -Path $TempDir | Out-Null }

# ─────────────────────────────────────────────────────────────────────────────
# [1/9] Check + Install PostgreSQL 16
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[1/9] Checking PostgreSQL 16..."

$pgInstalled  = $false
$pgBinPath    = ""

# Check common install locations
$pgCandidates = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\17\bin"
)
foreach ($candidate in $pgCandidates) {
    if (Test-Path "$candidate\psql.exe") {
        $pgBinPath   = $candidate
        $pgInstalled = $true
        break
    }
}

# Also check if psql is already on PATH
if (-not $pgInstalled) {
    $psqlCmd = Get-Command "psql" -ErrorAction SilentlyContinue
    if ($psqlCmd) {
        $rawVer = (& psql --version 2>&1) | Select-Object -First 1
        $major  = Get-VersionNumber -VersionString ($rawVer -replace 'psql \(PostgreSQL\) ', '')
        if ($major -ge 16) {
            $pgBinPath   = Split-Path $psqlCmd.Source -Parent
            $pgInstalled = $true
            Write-Success "PostgreSQL $major already installed and on PATH."
        }
    }
}

if (-not $pgInstalled) {
    Write-Info "PostgreSQL 16 not found. Downloading from EnterpriseDB..."
    $pgInstallerUrl  = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe"
    $pgInstallerPath = "$TempDir\postgresql-16-installer.exe"

    if (-not (Test-Path $pgInstallerPath)) {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $pgInstallerUrl -OutFile $pgInstallerPath -UseBasicParsing
            Write-Success "Downloaded PostgreSQL installer."
        } catch {
            Fail-Step "Failed to download PostgreSQL: $_"
        }
    } else {
        Write-Info "Using cached PostgreSQL installer at $pgInstallerPath"
    }

    Write-Info "Installing PostgreSQL 16 silently (this may take 2-5 minutes)..."
    $pgArgs = "--mode unattended --superpassword `"$DbPassword`" --serverport $DbPort --servicename postgresql-16"
    try {
        $proc = Start-Process -FilePath $pgInstallerPath -ArgumentList $pgArgs -Wait -PassThru
        if ($proc.ExitCode -ne 0) { Fail-Step "PostgreSQL installer exited with code $($proc.ExitCode)." }
    } catch {
        Fail-Step "PostgreSQL installation failed: $_"
    }

    $pgBinPath = "C:\Program Files\PostgreSQL\16\bin"
    Write-Success "PostgreSQL 16 installed."
}

# Ensure PostgreSQL bin is on the system PATH
$systemPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::Machine)
if ($systemPath -notlike "*$pgBinPath*") {
    [Environment]::SetEnvironmentVariable("PATH", "$systemPath;$pgBinPath", [EnvironmentVariableTarget]::Machine)
    Write-Success "Added PostgreSQL bin to system PATH."
}
# Update current session PATH too
if ($env:Path -notlike "*$pgBinPath*") {
    $env:Path += ";$pgBinPath"
}
Write-Success "PostgreSQL step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [2/9] Check + Install Node.js 20 LTS
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[2/9] Checking Node.js 20 LTS..."

$nodeInstalled = $false
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVerRaw = (& node --version 2>&1)
    $nodeMajor  = Get-VersionNumber -VersionString $nodeVerRaw
    if ($nodeMajor -ge 20) {
        $nodeInstalled = $true
        Write-Success "Node.js $nodeVerRaw already installed."
    } else {
        Write-Info "Node.js $nodeVerRaw found but version < 20. Upgrading..."
    }
}

if (-not $nodeInstalled) {
    $nodeUrl     = "https://nodejs.org/dist/v20.15.1/node-v20.15.1-x64.msi"
    $nodeInstPath = "$TempDir\node-v20-x64.msi"

    if (-not (Test-Path $nodeInstPath)) {
        Write-Info "Downloading Node.js 20 LTS MSI..."
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstPath -UseBasicParsing
            Write-Success "Downloaded Node.js installer."
        } catch {
            Fail-Step "Failed to download Node.js: $_"
        }
    } else {
        Write-Info "Using cached Node.js installer at $nodeInstPath"
    }

    Write-Info "Installing Node.js 20 LTS silently..."
    try {
        $proc = Start-Process -FilePath "msiexec.exe" `
            -ArgumentList "/i `"$nodeInstPath`" /qn ADDLOCAL=ALL" `
            -Wait -PassThru
        if ($proc.ExitCode -ne 0) { Fail-Step "Node.js installer exited with code $($proc.ExitCode)." }
    } catch {
        Fail-Step "Node.js installation failed: $_"
    }

    # Refresh PATH from machine env after install
    $env:Path = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::Machine) + ";" +
                [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
    Write-Success "Node.js 20 installed."
}
Write-Success "Node.js step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [3/9] Create Database + Run Migrations
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[3/9] Creating database and running Prisma migrations..."

if (-not (Test-Path $AppDir)) {
    Fail-Step "Application directory not found: $AppDir. Please ensure FireFlow files are deployed there first."
}

# Give PostgreSQL a moment to be fully ready after fresh install
Start-Sleep -Seconds 5

$env:PGPASSWORD = $DbPassword
$psqlExe        = if (Test-Path "$pgBinPath\psql.exe") { "$pgBinPath\psql.exe" } else { "psql" }

# Create database if it doesn't exist
Write-Info "Creating database 'fireflow_local' (if not exists)..."
try {
    $dbExists = & $psqlExe -U postgres -p $DbPort -t -c "SELECT 1 FROM pg_database WHERE datname='fireflow_local';" 2>&1
    if ($dbExists -notmatch "1") {
        & $psqlExe -U postgres -p $DbPort -c "CREATE DATABASE fireflow_local;" | Out-Null
        Write-Success "Database 'fireflow_local' created."
    } else {
        Write-Success "Database 'fireflow_local' already exists."
    }
} catch {
    Fail-Step "Failed to create database: $_"
}

# Run Prisma migrate deploy
Write-Info "Running Prisma migrate deploy..."
Push-Location $AppDir
try {
    & npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { Fail-Step "Prisma migrate deploy failed (exit code $LASTEXITCODE)." }
    Write-Success "Migrations applied."
} catch {
    Fail-Step "Prisma migrate deploy threw an error: $_"
} finally {
    Pop-Location
}

# Run Prisma generate
Write-Info "Running Prisma generate..."
Push-Location $AppDir
try {
    & npx prisma generate
    if ($LASTEXITCODE -ne 0) { Fail-Step "Prisma generate failed (exit code $LASTEXITCODE)." }
    Write-Success "Prisma client generated."
} catch {
    Fail-Step "Prisma generate threw an error: $_"
} finally {
    Pop-Location
}
Write-Success "Database step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [4/9] Install npm dependencies
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[4/9] Installing npm production dependencies..."

Push-Location $AppDir
try {
    & npm install --production
    if ($LASTEXITCODE -ne 0) { Fail-Step "npm install failed (exit code $LASTEXITCODE)." }
    Write-Success "npm dependencies installed."
} catch {
    Fail-Step "npm install threw an error: $_"
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# [5/9] Create .env file
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[5/9] Creating .env configuration file..."

$envPath = Join-Path $AppDir ".env"

if (Test-Path $envPath) {
    Write-Host "  ⚠️  A .env file already exists at $envPath" -ForegroundColor DarkYellow
    $overwrite = Read-Host "  → Overwrite it? (y/N)"
    if ($overwrite -notmatch '^[Yy]$') {
        Write-Info ".env file left untouched. Continuing with existing configuration."
    } else {
        Remove-Item $envPath -Force
    }
}

if (-not (Test-Path $envPath)) {
    # Generate a random 32-byte hex JWT secret
    $jwtBytes  = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
    $jwtSecret = ($jwtBytes | ForEach-Object { $_.ToString("x2") }) -join ''

    $envContent = @"
# FireFlow environment – generated by Install-Restaurant.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

DATABASE_URL=postgresql://postgres:$DbPassword@localhost:$DbPort/fireflow_local?schema=public
PORT=3001
NODE_ENV=production
VITE_SUPABASE_URL=$SupabaseUrl
VITE_SUPABASE_ANON_KEY=$SupabaseAnonKey
SUPABASE_URL=$SupabaseUrl
FIREFLOW_JWT_SECRET=$jwtSecret
NOTIFICATION_ENABLED=false
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Success ".env file written to $envPath"
} 
Write-Success ".env step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [6/9] Seed default data
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[6/9] Seeding default data..."

Push-Location $AppDir
try {
    # Chart of Accounts seed (required)
    $coaSeedPath = Join-Path $AppDir "scripts\seed-coa.ts"
    if (Test-Path $coaSeedPath) {
        Write-Info "Running seed-coa.ts..."
        & npx tsx scripts/seed-coa.ts
        if ($LASTEXITCODE -ne 0) { Fail-Step "seed-coa.ts failed (exit code $LASTEXITCODE)." }
        Write-Success "Chart of Accounts seeded."
    } else {
        Write-Host "  ⚠️  scripts\seed-coa.ts not found — skipping CoA seed." -ForegroundColor DarkYellow
    }

    # Default settings seed (optional)
    $settingsSeedPath = Join-Path $AppDir "scripts\seed-default-settings.ts"
    if (Test-Path $settingsSeedPath) {
        Write-Info "Running seed-default-settings.ts..."
        & npx tsx scripts/seed-default-settings.ts
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ⚠️  seed-default-settings.ts returned non-zero — continuing." -ForegroundColor DarkYellow
        } else {
            Write-Success "Default settings seeded."
        }
    } else {
        Write-Info "scripts\seed-default-settings.ts not found — skipping (optional)."
    }
} catch {
    Fail-Step "Seeding threw an error: $_"
} finally {
    Pop-Location
}
Write-Success "Seed step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [7/9] Build QR PWA
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[7/9] Building QR PWA..."

$qrPwaDir = Join-Path $AppDir "qr-pwa"
if (-not (Test-Path $qrPwaDir)) {
    Write-Host "  ⚠️  qr-pwa directory not found at $qrPwaDir — skipping." -ForegroundColor DarkYellow
} else {
    Push-Location $qrPwaDir
    try {
        Write-Info "Running npm run build in qr-pwa..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { Fail-Step "QR PWA build failed (exit code $LASTEXITCODE)." }
        Write-Success "QR PWA built successfully."
    } catch {
        Fail-Step "QR PWA build threw an error: $_"
    } finally {
        Pop-Location
    }
}
Write-Success "QR PWA step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [8/9] Configure Windows auto-start + Firewall
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[8/9] Configuring Windows auto-start and firewall..."

# Locate npm.cmd for the scheduled task
$npmPath = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue)?.Source
if (-not $npmPath) { $npmPath = "npm.cmd" }

# Remove existing task if present to ensure clean state
$existingTask = Get-ScheduledTask -TaskName "FireFlow-Server" -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Info "Removing existing FireFlow-Server scheduled task..."
    Unregister-ScheduledTask -TaskName "FireFlow-Server" -Confirm:$false
}

Write-Info "Creating FireFlow-Server scheduled task..."
try {
    $currentUser  = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $taskAction   = New-ScheduledTaskAction `
        -Execute    $npmPath `
        -Argument   "run server" `
        -WorkingDirectory $AppDir
    $taskTrigger  = New-ScheduledTaskTrigger -AtStartup
    $taskSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)
    $taskPrincipal = New-ScheduledTaskPrincipal `
        -UserId  $currentUser `
        -LogonType Interactive `
        -RunLevel Highest

    Register-ScheduledTask `
        -TaskName   "FireFlow-Server" `
        -Action     $taskAction `
        -Trigger    $taskTrigger `
        -Settings   $taskSettings `
        -Principal  $taskPrincipal `
        -Description "Starts the FireFlow POS server on Windows startup" | Out-Null

    Write-Success "Scheduled task 'FireFlow-Server' created (runs at startup, interactive logon)."
} catch {
    Fail-Step "Failed to create scheduled task: $_"
}

# Open firewall port 3001 for LAN access (tablets, phones)
Write-Info "Configuring Windows Firewall for port 3001 (LAN access)..."
try {
    $existingRule = Get-NetFirewallRule -DisplayName "FireFlow POS Server" -ErrorAction SilentlyContinue
    if ($existingRule) {
        Write-Info "Firewall rule already exists — updating..."
        Remove-NetFirewallRule -DisplayName "FireFlow POS Server" -ErrorAction SilentlyContinue
    }
    New-NetFirewallRule `
        -DisplayName "FireFlow POS Server" `
        -Direction   Inbound `
        -Protocol    TCP `
        -LocalPort   3001 `
        -Action      Allow `
        -Profile     Private, Domain `
        -Description "Allows LAN devices (tablets, phones) to connect to FireFlow" | Out-Null
    Write-Success "Firewall rule created: TCP 3001 inbound (Private + Domain profiles)."
} catch {
    Write-Host "  ⚠️  Could not create firewall rule: $_" -ForegroundColor DarkYellow
    Write-Host "      You may need to add it manually in Windows Defender Firewall." -ForegroundColor DarkYellow
}
Write-Success "Auto-start and firewall step complete."

# ─────────────────────────────────────────────────────────────────────────────
# [9/9] License Activation
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "[9/9] License Activation..."

# ── 9A: Start server and retrieve hardware fingerprint ────────────────────────
Write-Info "Starting FireFlow server temporarily for fingerprint + activation..."
$serverProc = Start-Process -FilePath $npmPath `
    -ArgumentList "run", "server" `
    -WorkingDirectory $AppDir `
    -WindowStyle Hidden `
    -PassThru

# Poll /api/health for up to 30 seconds
$healthUrl    = "http://localhost:3001/api/health"
$maxWaitSecs  = 30
$pollInterval = 2
$elapsed      = 0
$serverReady  = $false

Write-Info "Waiting for server to become ready (up to $maxWaitSecs seconds)..."
while ($elapsed -lt $maxWaitSecs) {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $serverReady = $true
            break
        }
    } catch { <# still starting — keep polling #> }
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
    Write-Host "      ..." -NoNewline
}
Write-Host ""

if (-not $serverReady) {
    Write-Host "  ⚠️  Server did not become ready within $maxWaitSecs seconds." -ForegroundColor DarkYellow
    Write-Host "      Skipping license activation. You can activate later by:" -ForegroundColor DarkYellow
    Write-Host "        1. Running this script again once the server is running" -ForegroundColor DarkYellow
    Write-Host "        2. Visiting http://localhost:3001 → Settings → License" -ForegroundColor DarkYellow
} else {
    Write-Success "Server is up!"

    # ── Fetch and display the hardware fingerprint ────────────────────────────
    $hardwareFingerprint = $null
    try {
        $fpResp = Invoke-RestMethod `
            -Uri         "http://localhost:3001/api/licensing/fingerprint" `
            -Method      GET `
            -TimeoutSec  10 `
            -ErrorAction Stop
        $hardwareFingerprint = $fpResp.fingerprint
    } catch {
        Write-Host "  ⚠️  Could not retrieve hardware fingerprint: $_" -ForegroundColor DarkYellow
    }

    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "  🔑 Your Hardware Fingerprint:" -ForegroundColor Cyan
    if ($hardwareFingerprint) {
        Write-Host "     $hardwareFingerprint" -ForegroundColor White
    } else {
        Write-Host "     (could not retrieve — check server logs)" -ForegroundColor DarkYellow
    }
    Write-Host ""
    Write-Host "  Send this fingerprint to your FireFlow HQ admin" -ForegroundColor Cyan
    Write-Host "  to generate your signed license token if you don't" -ForegroundColor Cyan
    Write-Host "  have one yet." -ForegroundColor Cyan
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""

    # ── 9B: Activate if token available ──────────────────────────────────────
    # Use token passed as parameter, or prompt interactively
    if ([string]::IsNullOrWhiteSpace($LicenseToken)) {
        $hasToken = Read-Host "  → Do you have a license token from HQ? (Y/N)"
        if ($hasToken -match '^[Yy]$') {
            $LicenseToken = Read-Host "  → Paste your license token (Header.Payload.Signature)"
        }
    }

    if ([string]::IsNullOrWhiteSpace($LicenseToken)) {
        # No token — installation is complete, activation deferred
        Write-Host ""
        Write-Host "  ℹ️  No license token provided. Activation skipped." -ForegroundColor Cyan
        Write-Host "     Installation is complete — the POS will run but features" -ForegroundColor Cyan
        Write-Host "     may be restricted until the license is activated." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  To activate later, run this script again with the token:" -ForegroundColor White
        Write-Host "    .\Install-Restaurant.ps1 -LicenseToken \"<your token>\"" -ForegroundColor Green
        Write-Host "  Or open your browser after the server starts:" -ForegroundColor White
        Write-Host "    http://localhost:3001 → Settings → License" -ForegroundColor Green
    } else {
        # Token provided — attempt activation
        Write-Info "Sending activation request to local server..."
        $activateUrl  = "http://localhost:3001/api/licensing/activate"
        $activateBody = @{ licenseToken = $LicenseToken } | ConvertTo-Json -Compress
        try {
            $activateResp = Invoke-RestMethod `
                -Uri         $activateUrl `
                -Method      POST `
                -Body        $activateBody `
                -ContentType "application/json" `
                -TimeoutSec  15 `
                -ErrorAction Stop

            # Invoke-RestMethod throws on non-2xx, so reaching here means success
            $plan      = $activateResp.plan      ?? "(unknown)"
            $expiresAt = $activateResp.expiresAt ?? "(unknown)"
            Write-Host ""
            Write-Host "  ✅ FireFlow activated successfully!" -ForegroundColor Green
            Write-Host "     Plan    : $plan" -ForegroundColor Green
            Write-Host "     Expires : $expiresAt" -ForegroundColor Green
            Write-Host ""
        } catch {
            # Extract error message from the API JSON response if available
            $errMsg = $_
            try {
                $errBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop
                $errMsg  = $errBody.error ?? $errMsg
            } catch { <# use raw exception message #> }

            Write-Host ""
            Write-Host "  ❌ Activation failed: $errMsg" -ForegroundColor Red
            Write-Host ""
            Write-Host "  ─── Troubleshooting ───────────────────────────────" -ForegroundColor DarkYellow
            Write-Host "  Your hardware fingerprint is:" -ForegroundColor DarkYellow
            if ($hardwareFingerprint) {
                Write-Host "    $hardwareFingerprint" -ForegroundColor White
            }
            Write-Host "  Common causes:" -ForegroundColor DarkYellow
            Write-Host "    • The token was generated for a different machine" -ForegroundColor DarkYellow
            Write-Host "      (fingerprint mismatch — provide HQ with the fingerprint above)" -ForegroundColor DarkYellow
            Write-Host "    • The token belongs to a different restaurant ID" -ForegroundColor DarkYellow
            Write-Host "    • The token is corrupt or has been modified" -ForegroundColor DarkYellow
            Write-Host "    • The token has expired" -ForegroundColor DarkYellow
            Write-Host ""
            Write-Host "  To retry later, run:" -ForegroundColor DarkYellow
            Write-Host "    .\Install-Restaurant.ps1 -LicenseToken \"<new token>\"" -ForegroundColor White
            Write-Host "  Or visit: http://localhost:3001 → Settings → License" -ForegroundColor White
            Write-Host "  ────────────────────────────────────────────────────" -ForegroundColor DarkYellow
        }
    }
}

# Stop the temporary server process — Task Scheduler manages it from here on
if ($serverProc -and -not $serverProc.HasExited) {
    $serverProc | Stop-Process -Force -ErrorAction SilentlyContinue
}

# ─────────────────────────────────────────────────────────────────────────────
# Final summary
# ─────────────────────────────────────────────────────────────────────────────
$isActivated = -not [string]::IsNullOrWhiteSpace($LicenseToken)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ✅  FireFlow Installation Complete!   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($isActivated) {
    Write-Host "  🟢 License Status : ACTIVATED" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "    1. Reboot the PC — the server starts automatically at login" -ForegroundColor White
    Write-Host "    2. Open your browser and go to: http://localhost:3000" -ForegroundColor Green
    Write-Host "    3. Log in with the default Manager PIN (see seed.ts)" -ForegroundColor White
    Write-Host "    4. Settings → Business Profile — enter restaurant name & details" -ForegroundColor White
    Write-Host "    5. Settings → Hardware → Add your thermal / A4 printers" -ForegroundColor White
    Write-Host "    6. Settings → Zones & Tables → Create your floor plan" -ForegroundColor White
} else {
    Write-Host "  🟡 License Status : NOT YET ACTIVATED" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "  The POS is installed but needs a license token to unlock" -ForegroundColor White
    Write-Host "  all features. To activate:" -ForegroundColor White
    Write-Host ""
    Write-Host "  Option A — Re-run this script with the token:" -ForegroundColor Cyan
    Write-Host "    .\Install-Restaurant.ps1 -LicenseToken \"<token from HQ>\"" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Option B — Activate in the browser (after server starts):" -ForegroundColor Cyan
    Write-Host "    http://localhost:3001 → Settings → License" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Don't have a token yet? Send your hardware fingerprint" -ForegroundColor White
    Write-Host "  (shown above in Step 9) to your FireFlow HQ admin." -ForegroundColor White
}

Write-Host ""
Write-Host "  Server auto-starts on Windows login (Task Scheduler)." -ForegroundColor Cyan
Write-Host "  LAN tablets/phones: http://<this-PC-IP>:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Pause
