OBS TALLY PRO Portable Windows Bridge
=====================================

PURPOSE
This runs the OBS TALLY PRO OBS Bridge on a Windows 10/11 streaming computer.
It does NOT require VS Code, Node.js, npm, or an installer.
Do not publish or redistribute any local configuration or pairing tokens.

FIRST-TIME SETUP
1. Extract this ENTIRE ZIP to a permanent folder, e.g. C:\OBS-TALLY-PRO-Bridge
2. In OBS Studio, go to Tools > WebSocket Server Settings.
3. Enable WebSocket server and authentication; note the password. Default port 4455.
4. Double-click "Start OBS TALLY PRO.cmd".
5. Enter or accept ws://127.0.0.1:4455 and enter the OBS WebSocket password.
   The password is encrypted for your Windows account using DPAPI.
6. Open https://rakindufernando.github.io/obs-tally-pro/#/settings in a browser,
   select the production and Generate bridge code. Paste it into the launcher.
7. The Bridge will pair with Supabase, save its private token in your own
   Windows user profile, and start monitoring OBS.
8. Keep the launcher window open during the production.

EVERY SUBSEQUENT TIME
- Start OBS Studio.
- Double-click "Start OBS TALLY PRO.cmd". No code or password needed.
- Or use "Enable Start with Windows.cmd" once to launch at Windows sign-in.
  If OBS has not opened yet, the Bridge will keep retrying.

USING A DIFFERENT PC
- Extract the same ZIP to that PC, and run the start file.
- You MUST generate a new bridge registration code from the director dashboard.
- Registering a replacement PC revokes the old PC's pairing for that production.
  Only one active Bridge per production is permitted.
- Never copy files from %LOCALAPPDATA%\OBS TALLY PRO to another computer.
- If you're using a completely different OBS installation, confirm the camera
  scene/source names match the mappings in the director dashboard.

WINDOWS LOGIN AUTO-START
- Click "Enable Start with Windows.cmd" (no administrator privileges required).
- "Disable Start with Windows.cmd" removes that user's startup shortcut.
- Keep the extracted folder at the same location after enabling auto-start.
- This starts at user sign-in, NOT before logging in to Windows.

SETTINGS AND SECURITY
- "Change OBS Settings.cmd" allows changing OBS URL/password.
- "Re-register This PC.cmd" requires explicit confirmation and a new code.
- Encrypted OBS settings are stored in %LOCALAPPDATA%\OBS TALLY PRO\connection.json
- The private cloud bridge token is saved in the same folder as bridge-config.json.
  Treat that profile as sensitive. Do not share it or upload to GitHub.
- OBS WebSocket authentication must remain enabled. For a local OBS server
  leave the address on 127.0.0.1 and the default port 4455.
- Windows SmartScreen may warn about an unsigned executable. Use only a
  package downloaded from your own GitHub Actions build and verify the publisher.

TROUBLESHOOTING
- "OBS unavailable or authentication failed" => Check OBS, WebSocket and password.
- "Bridge is not authorized" => The PC was replaced/revoked. Re-register this PC.
- "Registration code expired" => Generate a fresh code in the dashboard.
- "Bridge EXE was not found" => Extract the entire ZIP, not only a CMD file.
- Offline site: make sure OBS, this Bridge, the internet, and Supabase are online.
- If Windows blocks the EXE, check SmartScreen details; do not disable system-wide
  security settings or run an unknown downloaded build.
