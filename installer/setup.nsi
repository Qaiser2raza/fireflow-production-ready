!define APP_NAME "FireFlow Restaurant POS"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Fireflow Inc"

Name "${APP_NAME}"
OutFile "FireFlow-Setup.exe"
InstallDir "$PROGRAMFILES64\FireFlow"

Page directory
Page instfiles

Section "Install PostgreSQL" SEC_PG
  SetOutPath "$INSTDIR"
  
  # Ensure you download the postgresql silent installer to the installer/ folder before compiling
  # File "postgresql-installer.exe"
  # ExecWait '"$INSTDIR\postgresql-installer.exe" --mode unattended --superpassword "postgres" --serverport 5432'
  
SectionEnd

Section "Install Node.js" SEC_NODE
  SetOutPath "$INSTDIR"
  
  # Ensure you download the node MSI to the installer/ folder before compiling
  # File "node-installer.msi"
  # ExecWait 'msiexec.exe /i "$INSTDIR\node-installer.msi" /qn'
  
SectionEnd

Section "Install FireFlow" SEC_APP
  SetOutPath "$INSTDIR"
  
  # Copy application files (we would bundle the build output here)
  # File /r "..\release\win-unpacked\*.*"

  # Create Desktop Shortcut
  CreateShortcut "$DESKTOP\FireFlow POS.lnk" "$INSTDIR\Fireflow Restaurant System.exe" "" "$INSTDIR\Fireflow Restaurant System.exe" 0
SectionEnd
