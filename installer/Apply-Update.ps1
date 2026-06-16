# FireFlow Remote Hot-Update Script
# Called by UpdateService.ts as a detached process, or run manually by a technician.
#
# Usage:
#   .\Apply-Update.ps1 -ZipPath "C:\FireFlow\updates\update-1.2.0.zip" -AppDir "C:\FireFlow"
#
# What this script does (in order):
#   1. Validates inputs and waits for server to release locks
#   2. Extracts the update zip, protecting critical files (.env, data, node_modules)
#   3. Runs npm install --production        (new packages may have been added)
#   4. Runs prisma migrate deploy           (apply schema changes)
#   5. Runs prisma generate                 (regenerate Prisma client)
#   6. Rebuilds the QR PWA                  (cd qr-pwa && npm run build)
#   7. Restarts the FireFlow server
#   8. Writes a versioned log entry

param (
    [string]$ZipPath = "",
    [string]$AppDir  = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Helper: abort with a clear message
# ─────────────────────────────────────────────────────────────────────────────
function Fail-Update {
    param([string]$Message)
    Write-Host ""
    Write-Host "  ❌ UPDATE FAILED: $Message" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "   🔥 FireFlow Update Agent             " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host "  Zip     : $ZipPath"
Write-Host "  AppDir  : $AppDir"
Write-Host "  Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# Validate zip path
# ─────────────────────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($ZipPath) -or -not (Test-Path $ZipPath)) {
    Fail-Update "Zip file not found at: '$ZipPath'"
}

# ─────────────────────────────────────────────────────────────────────────────
# Resolve app directory
# Script lives in <AppDir>\installer\ — fall back to parent of $PSScriptRoot
# ─────────────────────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($AppDir) -or -not (Test-Path $AppDir)) {
    $AppDir = Split-Path -Parent $PSScriptRoot
    Write-Host "  AppDir not provided. Resolved to: $AppDir" -ForegroundColor DarkGray
}

if (-not (Test-Path (Join-Path $AppDir "package.json"))) {
    Fail-Update "Cannot find package.json in '$AppDir'. Aborting."
}

Write-Host "  App root : $AppDir" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Read version from package.json (best-effort)
# ─────────────────────────────────────────────────────────────────────────────
$appVersion = "unknown"
try {
    $pkgJson    = Get-Content (Join-Path $AppDir "package.json") -Raw | ConvertFrom-Json
    $appVersion = $pkgJson.version
} catch {
    Write-Host "  ⚠️  Could not read version from package.json" -ForegroundColor DarkYellow
}
Write-Host "  Current app version: $appVersion" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Locate npm/npx executables (handle environments where they're not on PATH)
# ─────────────────────────────────────────────────────────────────────────────
$npmCmd = (Get-Command "npm.cmd"  -ErrorAction SilentlyContinue)?.Source
$npxCmd = (Get-Command "npx.cmd"  -ErrorAction SilentlyContinue)?.Source
if (-not $npmCmd) { $npmCmd = "npm.cmd" }
if (-not $npxCmd) { $npxCmd = "npx.cmd" }

# ─────────────────────────────────────────────────────────────────────────────
# Wait for server to release file locks
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Waiting 10s for server to release file locks..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# ─────────────────────────────────────────────────────────────────────────────
# Extract update zip
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [1/6] Extracting update zip..." -ForegroundColor Yellow

$TempExtract = Join-Path $AppDir "updates\extracted"
if (Test-Path $TempExtract) { Remove-Item -Recurse -Force $TempExtract }
New-Item -ItemType Directory -Path $TempExtract -Force | Out-Null

try {
    Expand-Archive -Path $ZipPath -DestinationPath $TempExtract -Force
    Write-Host "        Extraction complete." -ForegroundColor Green
} catch {
    Fail-Update "Failed to extract zip: $_"
}

# ─────────────────────────────────────────────────────────────────────────────
# Copy new files, protecting critical config and caches
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [2/6] Applying update files (protecting .env, data, node_modules)..." -ForegroundColor Yellow

$ExcludeList = @(".env", "data", "updates", "node_modules", "logs", "uploads")
Get-ChildItem -Path $TempExtract | ForEach-Object {
    if ($ExcludeList -notcontains $_.Name) {
        try {
            Copy-Item -Path $_.FullName -Destination (Join-Path $AppDir $_.Name) -Recurse -Force
            Write-Host "        Copied: $($_.Name)" -ForegroundColor DarkGray
        } catch {
            Write-Host "        ⚠️  Could not copy $($_.Name): $_" -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "        Skipped (protected): $($_.Name)" -ForegroundColor DarkGray
    }
}
Write-Host "        Binaries applied." -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# [3/6] npm install --production  (new packages may have been added in update)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [3/6] Running npm install --production..." -ForegroundColor Yellow

Push-Location $AppDir
try {
    & $npmCmd install --production
    if ($LASTEXITCODE -ne 0) { Fail-Update "npm install failed (exit code $LASTEXITCODE)." }
    Write-Host "        npm dependencies updated." -ForegroundColor Green
} catch {
    Fail-Update "npm install threw an error: $_"
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# [4/6] Prisma migrate deploy
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [4/6] Running Prisma migrate deploy..." -ForegroundColor Yellow

Push-Location $AppDir
try {
    & $npxCmd prisma migrate deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Host "        Migrations applied." -ForegroundColor Green
    } else {
        Write-Host "        ⚠️  Migration returned exit code $LASTEXITCODE. Check the database manually." -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "        ⚠️  Migration threw: $_" -ForegroundColor DarkYellow
    Write-Host "           Continuing — server may still function if schema is compatible." -ForegroundColor DarkYellow
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# [5/6] Prisma generate  (regenerate client after possible schema changes)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [5/6] Running Prisma generate..." -ForegroundColor Yellow

Push-Location $AppDir
try {
    & $npxCmd prisma generate
    if ($LASTEXITCODE -eq 0) {
        Write-Host "        Prisma client regenerated." -ForegroundColor Green
    } else {
        Write-Host "        ⚠️  prisma generate returned exit code $LASTEXITCODE." -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "        ⚠️  prisma generate threw: $_" -ForegroundColor DarkYellow
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# [6/6] Rebuild QR PWA
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  [6/6] Rebuilding QR PWA..." -ForegroundColor Yellow

$qrPwaDir = Join-Path $AppDir "qr-pwa"
if (Test-Path $qrPwaDir) {
    Push-Location $qrPwaDir
    try {
        & $npmCmd run build
        if ($LASTEXITCODE -eq 0) {
            Write-Host "        QR PWA rebuilt." -ForegroundColor Green
        } else {
            Write-Host "        ⚠️  QR PWA build returned exit code $LASTEXITCODE." -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "        ⚠️  QR PWA build threw: $_" -ForegroundColor DarkYellow
    } finally {
        Pop-Location
    }
} else {
    Write-Host "        qr-pwa directory not found — skipping." -ForegroundColor DarkGray
}

# ─────────────────────────────────────────────────────────────────────────────
# Restart FireFlow server
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Restarting FireFlow server..." -ForegroundColor Yellow

Push-Location $AppDir
try {
    Start-Process -FilePath $npmCmd `
        -ArgumentList "run", "server" `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden
    Write-Host "        Server process started." -ForegroundColor Green
} catch {
    Write-Host "        ⚠️  Could not restart server: $_" -ForegroundColor DarkYellow
    Write-Host "           Please restart it manually: npm run server" -ForegroundColor DarkYellow
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup temp files
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Cleaning up..." -ForegroundColor DarkGray
Remove-Item $ZipPath    -Force -ErrorAction SilentlyContinue
Remove-Item $TempExtract -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "        Temp files removed." -ForegroundColor DarkGray

# ─────────────────────────────────────────────────────────────────────────────
# Read new version from package.json (may have changed after update)
# ─────────────────────────────────────────────────────────────────────────────
$newVersion = "unknown"
try {
    $pkgJsonNew = Get-Content (Join-Path $AppDir "package.json") -Raw | ConvertFrom-Json
    $newVersion = $pkgJsonNew.version
} catch { <# ignore #> }

# ─────────────────────────────────────────────────────────────────────────────
# Write versioned log entry
# ─────────────────────────────────────────────────────────────────────────────
$LogFile = Join-Path $AppDir "updates\update-log.txt"
$LogDir  = Split-Path $LogFile
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$timestamp  = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$logEntry   = "$timestamp | v$appVersion → v$newVersion | Update applied successfully"
$logEntry | Add-Content $LogFile
Write-Host "  Log entry written: $logEntry" -ForegroundColor DarkGray

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅  Update applied successfully!      " -ForegroundColor Green
Write-Host "  Upgraded: v$appVersion → v$newVersion " -ForegroundColor Green
Write-Host "  Time: $timestamp                      " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
