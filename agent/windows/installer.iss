; Compile with ISCC /DBundleDir=... /DOutputDir=... /DAppVersion=...
#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{4FC94849-D647-4770-A754-0AD112B3D776}
AppName=Fortress Backup
AppVersion={#AppVersion}
VersionInfoVersion={#NumericVersion}
AppPublisher=Fortress Backup
AppPublisherURL=https://github.com/InSelfControll/FortressBackup
DefaultDirName={autopf}\FortressBackup
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
OutputDir={#OutputDir}
OutputBaseFilename=FortressBackup-Setup-v{#AppVersion}
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\FortressBackup.exe
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commonprograms}\Fortress Backup"; Filename: "{app}\FortressBackup.exe"; WorkingDir: "{app}"
Name: "{commondesktop}\Fortress Backup"; Filename: "{app}\FortressBackup.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\FortressBackup.exe"; Description: "Open Fortress Backup to configure this laptop"; Flags: postinstall nowait skipifsilent runascurrentuser

[Code]
function InitializeUninstall(): Boolean;
var
  ExitCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\uninstall-task.ps1') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Result := Result and (ExitCode = 0);
  if not Result then
    MsgBox('The Fortress background task could not be removed. Close active backup operations and try uninstalling again. Your configuration and backups have been preserved.', mbError, MB_OK);
end;
