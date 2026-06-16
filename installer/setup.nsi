; ============================================================================
; FireFlow Restaurant POS – NSIS Installer Script
; Produces: FireFlow-Setup.exe
;
; HOW TO BUILD
; ─────────────────────────────────────────────────────────────────────────────
;  Pre-requisites (must be placed in this installer/ directory BEFORE compiling):
;
;    1. postgresql-16.4-1-windows-x64.exe
;       Download from: https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe
;
;    2. node-v20.15.1-x64.msi
;       Download from: https://nodejs.org/dist/v20.15.1/node-v20.15.1-x64.msi
;
;    3. The application build output must exist at ..\dist\ or ..\release\win-unpacked\
;       Run "npm run build && npm run build:backend" in the project root first.
;
;  Compile command (from the installer/ directory):
;    makensis setup.nsi
;
;  Output: installer\FireFlow-Setup.exe
; ============================================================================

;-----------------------------------------------------------------------------
; Metadata / Defines
;-----------------------------------------------------------------------------
!define APP_NAME        "FireFlow Restaurant POS"
!define APP_VERSION     "1.0.1"
!define APP_PUBLISHER   "FireFlow Inc."
!define APP_URL         "https://fireflow.app"
!define APP_EXE         "FireFlow.exe"
!define INSTALL_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FireFlow"
!define TASK_NAME       "FireFlow-Server"

; Estimated installed size in KB  (~150 MB app + deps)
!define ESTIMATED_SIZE  153600

;-----------------------------------------------------------------------------
; General NSIS settings
;-----------------------------------------------------------------------------
Name             "${APP_NAME} ${APP_VERSION}"
OutFile          "FireFlow-Setup.exe"
InstallDir       "$PROGRAMFILES64\FireFlow"
InstallDirRegKey HKLM "${INSTALL_REG_KEY}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor    /SOLID lzma
ShowInstDetails  show
ShowUnInstDetails show

; Modern UI
!include "MUI2.nsh"
!include "LogicLib.nsh"

;-----------------------------------------------------------------------------
; MUI Pages
;-----------------------------------------------------------------------------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"           ; optional – remove line if no LICENSE file
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

;-----------------------------------------------------------------------------
; Version information embedded in the .exe
;-----------------------------------------------------------------------------
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName"    "${APP_NAME}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName"    "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "© 2025 ${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion"    "${APP_VERSION}"

;=============================================================================
; SECTION 1 – Install PostgreSQL 16 (silent)
;=============================================================================
Section "PostgreSQL 16" SEC_PG
  SectionIn RO   ; always installed

  SetOutPath "$INSTDIR\prereqs"

  ; ── PRE-REQUISITE ──────────────────────────────────────────────────────────
  ; Download postgresql-16.4-1-windows-x64.exe from EnterpriseDB and copy it
  ; to this installer\ directory BEFORE running makensis.
  ; ───────────────────────────────────────────────────────────────────────────
  File "postgresql-16.4-1-windows-x64.exe"

  ; Only install if psql.exe is not already present in the expected location
  ${IfNot} ${FileExists} "$PROGRAMFILES64\PostgreSQL\16\bin\psql.exe"
    DetailPrint "Installing PostgreSQL 16..."
    ExecWait '"$INSTDIR\prereqs\postgresql-16.4-1-windows-x64.exe" \
              --mode unattended \
              --superpassword "fireflow_setup_temp" \
              --serverport 5432 \
              --servicename postgresql-16' $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "PostgreSQL installation failed (exit code $0). \
                                    Please install PostgreSQL 16 manually and re-run the setup."
      Quit
    ${EndIf}
    DetailPrint "PostgreSQL 16 installed successfully."
  ${Else}
    DetailPrint "PostgreSQL 16 already installed – skipping."
  ${EndIf}

SectionEnd

;=============================================================================
; SECTION 2 – Install Node.js 20 LTS (silent)
;=============================================================================
Section "Node.js 20 LTS" SEC_NODE
  SectionIn RO

  SetOutPath "$INSTDIR\prereqs"

  ; ── PRE-REQUISITE ──────────────────────────────────────────────────────────
  ; Download node-v20.15.1-x64.msi from nodejs.org and copy it to installer\.
  ; ───────────────────────────────────────────────────────────────────────────
  File "node-v20.15.1-x64.msi"

  ; Check if node.exe already exists in the standard install location
  ${IfNot} ${FileExists} "$PROGRAMFILES64\nodejs\node.exe"
    DetailPrint "Installing Node.js 20 LTS..."
    ExecWait 'msiexec.exe /i "$INSTDIR\prereqs\node-v20.15.1-x64.msi" /qn ADDLOCAL=ALL' $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONSTOP "Node.js installation failed (exit code $0). \
                                    Please install Node.js 20 LTS manually and re-run the setup."
      Quit
    ${EndIf}
    DetailPrint "Node.js 20 installed successfully."
  ${Else}
    DetailPrint "Node.js already installed – skipping."
  ${EndIf}

SectionEnd

;=============================================================================
; SECTION 3 – Install FireFlow Application Files
;=============================================================================
Section "FireFlow Application" SEC_APP
  SectionIn RO

  SetOutPath "$INSTDIR"

  ; ── PRE-REQUISITE ──────────────────────────────────────────────────────────
  ; Build the application BEFORE compiling NSIS:
  ;   npm run build && npm run build:backend   (in the project root)
  ; This places compiled output in ..\dist\ and the server bundle in ..\server.cjs
  ; ───────────────────────────────────────────────────────────────────────────

  ; Copy the server bundle and core files
  File "..\server.cjs"
  File "..\package.json"
  File "..\electron-main.cjs"
  File "..\preload.cjs"

  ; Copy the Prisma schema and migrations
  File /r "..\prisma"

  ; Copy the built frontend (Vite output)
  File /r "..\dist"

  ; Copy the scripts directory (seed files, etc.)
  File /r "..\scripts"

  ; Copy the QR PWA directory (built by npm run build in qr-pwa/)
  File /r "..\qr-pwa"

  ; Copy the installer scripts (needed for updates and re-runs)
  SetOutPath "$INSTDIR\installer"
  File "Install-Restaurant.ps1"
  File "Apply-Update.ps1"
  SetOutPath "$INSTDIR"

  DetailPrint "Application files installed."

SectionEnd

;=============================================================================
; SECTION 4 – Run Install-Restaurant.ps1 (database, .env, migrations, etc.)
;=============================================================================
Section "Configure FireFlow" SEC_CONFIGURE
  SectionIn RO

  DetailPrint "Launching FireFlow configuration script..."
  DetailPrint "(A PowerShell window will open – please follow the prompts.)"

  ; Run the configuration script interactively so the technician can enter
  ; the license key, Supabase URL, etc.
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass \
            -File "$INSTDIR\installer\Install-Restaurant.ps1" \
            -AppDir "$INSTDIR"' $0

  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "The configuration script returned exit code $0. \
      FireFlow may not be fully configured. \
      You can re-run $INSTDIR\installer\Install-Restaurant.ps1 as Administrator at any time."
  ${EndIf}

SectionEnd

;=============================================================================
; SECTION 5 – Desktop Shortcut
;=============================================================================
Section "Desktop Shortcut" SEC_SHORTCUT

  SetOutPath "$INSTDIR"

  ; Create a shortcut that opens the POS in the default browser
  CreateShortcut "$DESKTOP\FireFlow POS.lnk" \
    "$WINDIR\system32\cmd.exe" \
    '/c start http://localhost:3000' \
    "$INSTDIR\dist\favicon.ico" 0 \
    SW_SHOWMINIMIZED "" "FireFlow Point of Sale"

  DetailPrint "Desktop shortcut created."

SectionEnd

;=============================================================================
; SECTION 6 – Write Uninstaller + Registry Metadata
;=============================================================================
Section -WriteUninstaller
  ; Write uninstaller binary
  WriteUninstaller "$INSTDIR\Uninstall-FireFlow.exe"

  ; Add/Programs/Control Panel metadata
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "DisplayName"          "${APP_NAME}"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "DisplayVersion"       "${APP_VERSION}"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "Publisher"            "${APP_PUBLISHER}"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "URLInfoAbout"         "${APP_URL}"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "UninstallString"      "$INSTDIR\Uninstall-FireFlow.exe"
  WriteRegStr   HKLM "${INSTALL_REG_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall-FireFlow.exe" /S'
  WriteRegDWORD HKLM "${INSTALL_REG_KEY}" "EstimatedSize"        ${ESTIMATED_SIZE}
  WriteRegDWORD HKLM "${INSTALL_REG_KEY}" "NoModify"             1
  WriteRegDWORD HKLM "${INSTALL_REG_KEY}" "NoRepair"             1
SectionEnd

;=============================================================================
; UNINSTALLER
;=============================================================================
Section "Uninstall"

  ; ── What we remove ────────────────────────────────────────────────────────
  ;  • Application files in $INSTDIR
  ;  • Desktop shortcut
  ;  • Windows Scheduled Task (FireFlow-Server)
  ;  • Firewall rule
  ;  • Registry keys added by this installer
  ;
  ; ── What we DO NOT remove ────────────────────────────────────────────────
  ;  • PostgreSQL or its data directory
  ;  • Node.js
  ;  • $INSTDIR\.env          (contains license key and DB credentials)
  ;  • $INSTDIR\data\         (restaurant data / uploads)
  ;  • $INSTDIR\updates\      (update log)
  ; ─────────────────────────────────────────────────────────────────────────

  ; Stop and remove the scheduled task
  DetailPrint "Removing FireFlow-Server scheduled task..."
  ExecWait 'schtasks.exe /Delete /TN "${TASK_NAME}" /F' $0

  ; Remove firewall rule
  DetailPrint "Removing firewall rule..."
  ExecWait 'powershell.exe -NoProfile -Command "Remove-NetFirewallRule -DisplayName ''FireFlow POS Server'' -ErrorAction SilentlyContinue"' $0

  ; Remove desktop shortcut
  Delete "$DESKTOP\FireFlow POS.lnk"

  ; Remove application files (preserving .env, data, updates, logs, uploads)
  RMDir /r "$INSTDIR\dist"
  RMDir /r "$INSTDIR\prisma"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\qr-pwa"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\installer"
  RMDir /r "$INSTDIR\prereqs"
  Delete "$INSTDIR\server.cjs"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\electron-main.cjs"
  Delete "$INSTDIR\preload.cjs"
  Delete "$INSTDIR\Uninstall-FireFlow.exe"

  ; Attempt to remove the install directory (will only succeed if empty after preserving data)
  RMDir "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "${INSTALL_REG_KEY}"

  MessageBox MB_OK "FireFlow has been uninstalled.$\n$\n\
    Your database, .env, and restaurant data have been preserved in:$\n\
    $INSTDIR$\n$\n\
    You may remove that folder manually if you no longer need the data."

SectionEnd

;=============================================================================
; FINISH PAGE – open browser after install
;=============================================================================
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT   "Open FireFlow in my browser now"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenBrowser

Function OpenBrowser
  ExecShell "open" "http://localhost:3000"
FunctionEnd
