OBS TALLY PRO | BUMBI Software Solutions
======================================

INSTALL ON WINDOWS 10 OR WINDOWS 11 (64-bit)

1. Open BUMBI-OBS-TALLY-PRO-Setup-v3.1.2.exe from the verified private distribution package.
2. Follow the installer. A Start Menu shortcut is created, and an optional desktop shortcut.
3. Open OBS Studio -> Tools -> WebSocket Server Settings.
   Enable server, set a strong authentication password. Default port 4455.
4. Launch OBS TALLY PRO. The BUMBI Software Solutions startup logo will appear.
5. On the first run, click OBS CONNECTION SETTINGS and enter ws://127.0.0.1:4455 plus your OBS password.
6. Click REGISTER / MOVE PC. From the online director dashboard, generate a new 10-minute bridge code for your selected production. Paste the code.
7. The Bridge starts. The OBS and cloud status boxes update as signals are received.
8. The phone-based tally lights still use https://rakindufernando.github.io/obs-tally-pro/.

EVERY NEXT TIME
- Start OBS Studio and launch OBS TALLY PRO from the Start Menu/desktop.
- If already paired, the Bridge starts automatically inside the app.
- The Bridge reconnects if OBS Studio opens later or the WebSocket briefly disconnects.
- Optional button START WITH WINDOWS enables start at Windows user sign-in; it does not start before sign-in.

OTHER PC
- Run the same installer on the new PC. OBS Studio must be installed there.
- Enter that PC's OBS password and generate a NEW registration code in the director dashboard.
- Only ONE PC Bridge is authorized per production at a time. The newly registered PC revokes the former one.
- OBS source/scene names must match your camera mappings. Edit mappings on the dashboard if needed.
- Do not copy settings or pairing tokens between PCs.

SAFETY AND SUPPORT
- Do not expose OBS port 4455 to the internet. Use 127.0.0.1 for local OBS.
- Your OBS password is saved encrypted using Windows DPAPI in the current user profile.
- The cloud Bridge token is saved in that user's LOCALAPPDATA profile, never inside the installer.
- The installer is not code-signed. Windows SmartScreen may display a warning; verify that it came from your own GitHub Actions build. Do not disable antivirus.
- Running this software does not replace OBS Studio, a reliable network, or live-event testing.
- Your settings remain in LOCALAPPDATA\OBS TALLY PRO if you uninstall, so reinstall can preserve your pairing.

Developed by BUMBI Software Solutions
