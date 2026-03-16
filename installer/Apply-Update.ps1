# FireFlow Remote Hot-Update Script
# This script is called by the UpdateService and runs in a detached process.

param (
    [string]$ZipPath = ""
)

Write-Host "--- FIREFLOW UPDATE AGENT ---" -ForegroundColor Blue
Write-Host "Target Zip: $ZipPath"

if (-not (Test-Path $ZipPath)) {
    Write-Error "Zip file not found!"
    exit
}

# 1. Wait for the main server process to exit
Write-Host "Waiting for server to release file locks..."
Start-Sleep -Seconds 5

$WorkingDir = Get-Location
$TempExtract = Join-Path $WorkingDir "updates\extracted"

if (Test-Path $TempExtract) { Remove-Item -Recurse -Force $TempExtract }
New-Item -ItemType Directory -Path $TempExtract | Out-Null

# 2. Extract update
Write-Host "Extracting update..."
Expand-Archive -Path $ZipPath -DestinationPath $TempExtract -Force

# 3. Copy files (excluding config and DB)
Write-Host "Applying new binaries..."
# You would define your exclusion list here (e.g., .env, local database files if any)
Copy-Item -Path "$TempExtract\*" -Destination $WorkingDir -Recurse -Force -Exclude ".env", "data"

# 4. Run Migrations
Write-Host "Running database migrations..."
try {
    & npx prisma migrate deploy
} catch {
    Write-Warning "Prisma migration failed. Please check logs."
}

# 5. Restart Services
Write-Host "Restarting FireFlow System..."
# If running as a Windows service or via PM2, restart it there.
# For now, we assume npm run server
Start-Process -FilePath "npm" -ArgumentList "run", "server"

Write-Host "✅ Update applied successfully!" -ForegroundColor Green
Remove-Item $ZipPath -Force
