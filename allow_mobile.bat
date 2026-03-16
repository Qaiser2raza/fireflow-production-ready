@echo off
:: Request Admin Privileges automatically
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "cmd.exe", "/c ""%~s0""", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0"
    echo.
    echo ====================================================
    echo   FIREFLOW NETWORK CONFIGURATOR
    echo ====================================================
    echo.
    echo Opening Port 3001 in Windows Firewall for Mobile Access...
    netsh advfirewall firewall add rule name="Fireflow Backend API (3001)" dir=in action=allow protocol=TCP localport=3001
    echo.
    echo Opening Port 3000 in Windows Firewall for UI Access...
    netsh advfirewall firewall add rule name="Fireflow Frontend UI (3000)" dir=in action=allow protocol=TCP localport=3000
    echo.
    echo ====================================================
    echo SUCCESS! Your mobile device should now be able to connect!
    echo ====================================================
    pause
