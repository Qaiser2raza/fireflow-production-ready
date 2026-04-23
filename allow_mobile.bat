@echo off
echo ==========================================
echo Fireflow POS - Network Firewall Configurer
echo ==========================================
echo.
echo Checking for Administrator privileges...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
) else (
    echo [ERROR] This script must be run as Administrator!
    echo Please right-click this file and select "Run as Administrator".
    pause
    exit /b 1
)

echo.
echo Opening Port 3000 (React Frontend)...
netsh advfirewall firewall add rule name="FireFlow POS - Frontend (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
netsh advfirewall firewall add rule name="FireFlow POS - Frontend (Port 3000) Out" dir=out action=allow protocol=TCP localport=3000 profile=private,domain

echo.
echo Opening Port 3001 (Node API / Websockets)...
netsh advfirewall firewall add rule name="FireFlow POS - API (Port 3001)" dir=in action=allow protocol=TCP localport=3001 profile=private,domain
netsh advfirewall firewall add rule name="FireFlow POS - API (Port 3001) Out" dir=out action=allow protocol=TCP localport=3001 profile=private,domain

echo.
echo Firewall rules applied successfully!
echo Kitchen tabs and Waiter devices can now communicate with this Host Computer.
echo.
pause
