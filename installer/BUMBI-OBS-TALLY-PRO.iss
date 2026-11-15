#define AppName "OBS TALLY PRO"
#define Publisher "BUMBI Software Solutions"
#define AppVersion "2.0.0"
[Setup]
AppId={{B87D61B2-6B07-4932-AD59-5AAC76CF770A}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName=OBS TALLY PRO 2.0
AppPublisher={#Publisher}
AppPublisherURL=https://rakindufernando.github.io/obs-tally-pro/
AppSupportURL=https://github.com/rakindufernando/obs-tally-pro
DefaultDirName={localappdata}\Programs\BUMBI OBS TALLY PRO
DefaultGroupName=BUMBI Software Solutions
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
UninstallDisplayIcon={app}\bumbi.ico
SetupIconFile=..\windows-app\bumbi.ico
WizardImageFile=..\windows-app\wizard-side.png
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
OutputDir=..\dist\installer
OutputBaseFilename=BUMBI-OBS-TALLY-PRO-Setup-v2.0.0
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts"; Flags: checkedonce
[Files]
Source: "..\dist\windows-installer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\OBS TALLY PRO"; Filename: "{app}\BUMBI-OBS-TALLY-PRO.exe"; IconFilename: "{app}\bumbi.ico"
Name: "{userdesktop}\OBS TALLY PRO"; Filename: "{app}\BUMBI-OBS-TALLY-PRO.exe"; IconFilename: "{app}\bumbi.ico"; Tasks: desktopicon
[Run]
Filename: "{app}\BUMBI-OBS-TALLY-PRO.exe"; Description: "Launch OBS TALLY PRO"; Flags: nowait postinstall skipifsilent
[UninstallRun]
Filename: "{app}\BUMBI-OBS-TALLY-PRO.exe"; Parameters: "--remove-startup"; RunOnceId: "RemoveStartup"
