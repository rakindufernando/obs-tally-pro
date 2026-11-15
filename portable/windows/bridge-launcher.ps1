# OBS TALLY PRO Portable Windows Launcher
# Works on Windows 10/11 with Windows PowerShell 5.1, without Node.js or VS Code.
param(
  [switch]$Configure,
  [switch]$ResetPairing,
  [switch]$EnableAutoStart,
  [switch]$DisableAutoStart
)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'OBS TALLY PRO Bridge'
$projectUrl = 'https://lvzrhzlcyajhhgfqgdar.supabase.co'
$dashboard = 'https://rakindufernando.github.io/obs-tally-pro/#/settings'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridgeExe = Join-Path $base 'OBS-TALLY-PRO-Bridge.exe'
$bridgeCode = Join-Path $base 'bridge.cjs'
$privateDir = Join-Path $env:LOCALAPPDATA 'OBS TALLY PRO'
$configPath = Join-Path $privateDir 'connection.json'
$statePath = Join-Path $privateDir 'bridge-config.json'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'OBS TALLY PRO Bridge.lnk'
$startCmd = Join-Path $base 'Start OBS TALLY PRO.cmd'

function Set-StartupShortcut([bool]$enable) {
 if ($enable) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $startCmd
  $shortcut.WorkingDirectory = $base
  $shortcut.Description = 'Connect local OBS Studio to OBS TALLY PRO cloud'
  $shortcut.Save()
  Write-Host 'Start with Windows enabled for this Windows user.' -ForegroundColor Green
 } else {
  if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }
  Write-Host 'Start with Windows disabled.' -ForegroundColor Green
 }
}
if ($EnableAutoStart) { Set-StartupShortcut $true; return }
if ($DisableAutoStart) { Set-StartupShortcut $false; return }

function Write-PrivateConfig([string]$obsUrl,[Security.SecureString]$password) {
 New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
 $encodedPassword = ConvertFrom-SecureString -SecureString $password
 $entry = @{ obsUrl=$obsUrl; encryptedPassword=$encodedPassword; cloudUrl=$projectUrl; formatVersion=1 }
 $entry | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
 Write-Host 'OBS connection settings saved for this Windows user (password encrypted using Windows DPAPI).' -ForegroundColor Green
}
function Ask-Configuration {
 Write-Host ''
 Write-Host 'OBS TALLY PRO - First-time PC setup' -ForegroundColor Cyan
 Write-Host '1. In OBS Studio: Tools > WebSocket Server Settings > Enable server and authentication.'
 Write-Host '2. Keep OBS Studio running on this same computer.'
 Write-Host ''
 $url = Read-Host 'OBS WebSocket URL [ws://127.0.0.1:4455]'
 if ([string]::IsNullOrWhiteSpace($url)) { $url = 'ws://127.0.0.1:4455' }
 if ($url -notmatch '^wss?://[^\s/]+(:[0-9]{2,5})?/?$') { throw 'Invalid WebSocket URL. Example: ws://127.0.0.1:4455' }
 $securePassword = Read-Host 'OBS WebSocket password (hidden)' -AsSecureString
 Write-PrivateConfig $url $securePassword
 Write-Host 'Settings saved. You can change them later using Change OBS Settings.cmd.'
}

try {
 if (!(Test-Path -LiteralPath $bridgeExe) -or !(Test-Path -LiteralPath $bridgeCode)) {
  throw 'Bridge runtime or bridge.cjs is missing. Extract the COMPLETE downloaded ZIP first.'
 }
 if ($Configure -or !(Test-Path -LiteralPath $configPath)) { Ask-Configuration; if($Configure){return} }
 $settings = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
 if (!$settings.obsUrl -or !$settings.encryptedPassword -or $settings.cloudUrl -ne $projectUrl) {throw 'Saved settings are invalid. Run Change OBS Settings.cmd.'}
 $secure = ConvertTo-SecureString -String $settings.encryptedPassword
 $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
 $env:SUPABASE_URL = $projectUrl
 $env:OBS_URL = [string]$settings.obsUrl
 $env:OBS_PASSWORD = $plain
 $env:BRIDGE_CONFIG_PATH = $statePath
 $plain = $null

 if ($ResetPairing) {
  Write-Host 'Re-registering this Windows PC. This will replace the existing bridge on the same production.' -ForegroundColor Yellow
  Write-Host 'The old PC will lose its authorization when the new registration succeeds.'
  if ((Read-Host 'Continue? (YES to confirm)') -cne 'YES') {return}
  if (Test-Path -LiteralPath $statePath) {Remove-Item -LiteralPath $statePath -Force}
 }
 if (!(Test-Path -LiteralPath $statePath)) {
  Write-Host ''
  Write-Host 'This PC is not registered with the cloud yet.' -ForegroundColor Yellow
  Write-Host 'On the director website, select the production, then go to Settings > Generate bridge code.'
  Write-Host $dashboard -ForegroundColor Cyan
  Write-Host 'Codes expire in 10 minutes and are single-use.'
  $code = (Read-Host 'Paste the new bridge registration code').Trim()
  if ($code -notmatch '^[0-9a-fA-F]{48}$') {throw 'Invalid registration code. Generate a fresh code in the director dashboard.'}
  $env:BRIDGE_REGISTRATION_CODE = $code.ToLowerInvariant()
  $code = $null
 }
 Write-Host ''
 Write-Host 'Starting OBS TALLY PRO Bridge...' -ForegroundColor Green
 Write-Host 'The Bridge connects to OBS automatically. Keep this window open during your production.'
 Write-Host 'If OBS is not open, the Bridge keeps trying to reconnect.'
 Write-Host 'Close this window or press Ctrl+C to stop. No inbound network ports are opened.'
 Write-Host ''
 & $bridgeExe $bridgeCode
 $bridgeExit = $LASTEXITCODE
 if ($bridgeExit -ne 0) {throw ('OBS Bridge stopped with error code '+$bridgeExit+'. See the message above.')}
} catch {
 Write-Host ''
 Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'See README-WINDOWS.txt for troubleshooting.'
 exit 1
} finally {
 Remove-Item Env:\OBS_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:\BRIDGE_REGISTRATION_CODE -ErrorAction SilentlyContinue
}
