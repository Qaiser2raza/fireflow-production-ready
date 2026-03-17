# FireFlow Remote Hot-Update Script
# Called by UpdateService.ts as a detached process

param (
    [string]$ZipPath = "",
    [string]$AppDir = ""
)

Write-Host "--- FIREFLOW UPDATE AGENT ---" -ForegroundColor Blue
Write-Host "Zip     : $ZipPath"
Write-Host "AppDir  : $AppDir"
Write-Host "Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (-not (Test-Path $ZipPath)) {
    Write-Error "Zip file not found at: $ZipPath"
    exit 1
}

# Resolve app directory - script lives in <appDir>\installer\
if ($AppDir -eq "" -or -not (Test-Path $AppDir)) {
    $AppDir = Split-Path -Parent $PSScriptRoot
}

if (-not (Test-Path "$AppDir\package.json")) {
    Write-Error "Cannot find package.json in $AppDir. Aborting."
    exit 1
}

Write-Host "App root: $AppDir"

# Wait for server to release file locks
Write-Host "Waiting 10s for server to release locks..."
Start-Sleep -Seconds 10

# Extract zip
$TempExtract = Join-Path $AppDir "updates\extracted"
if (Test-Path $TempExtract) { Remove-Item -Recurse -Force $TempExtract }
New-Item -ItemType Directory -Path $TempExtract -Force | Out-Null

Write-Host "Extracting update..."
try {
    Expand-Archive -Path $ZipPath -DestinationPath $TempExtract -Force
    Write-Host "Extraction complete." -ForegroundColor Green
} catch {
    Write-Error "Failed to extract: $_"
    exit 1
}

# Copy new files, protect critical config
$ExcludeList = @(".env", "data", "updates", "node_modules")
Get-ChildItem -Path $TempExtract | ForEach-Object {
    if ($ExcludeList -notcontains $_.Name) {
        Copy-Item -Path $_.FullName -Destination (Join-Path $AppDir $_.Name) -Recurse -Force
        Write-Host "  Copied: $($_.Name)"
    } else {
        Write-Host "  Skipped (protected): $($_.Name)" -ForegroundColor DarkGray
    }
}
Write-Host "Binaries applied." -ForegroundColor Green

# Run migrations
Write-Host "Running migrations..."
Push-Location $AppDir
$npx = (Get-Command "npx.cmd" -ErrorAction SilentlyContinue)?.Source
if (-not $npx) { $npx = "npx.cmd" }
& $npx prisma migrate deploy
if ($LASTEXITCODE -eq 0) {
    Write-Host "Migrations done." -ForegroundColor Green
} else {
    Write-Warning "Migration returned non-zero. Check DB manually."
}
Pop-Location

# Restart server
Write-Host "Restarting server..."
Push-Location $AppDir
$npm = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue)?.Source
if (-not $npm) { $npm = "npm.cmd" }
Start-Process -FilePath $npm `
    -ArgumentList "run", "server" `
    -WorkingDirectory $AppDir `
    -WindowStyle Hidden
Write-Host "Server restarted." -ForegroundColor Green
Pop-Location

# Cleanup
Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
Remove-Item $TempExtract -Recurse -Force -ErrorAction SilentlyContinue

# Log result
$LogFile = Join-Path $AppDir "updates\update-log.txt"
$LogDir = Split-Path $LogFile
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Update applied successfully" | Add-Content $LogFile

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Update applied successfully!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
