# BUMBI OBS TALLY PRO acceptance checklist

The Windows GitHub Actions workflow tests TypeScript, all 20 source mapping tests, compiled desktop runtime, Windows DPAPI encryption/decryption, GUI construction, bundled Node startup error path, and Inno Setup compilation.

The following require an actual Windows 10/11 computer with OBS Studio and cannot be simulated in CI.

- First-run settings dialog can save a valid OBS WebSocket password, encrypted for the Windows user
- Connection test identifies WebSocket TCP port availability, and the Bridge logs OBS WebSocket connected
- Generate 48-character code in the director website and Register PC completes within 10 minutes
- Red ON AIR and green STANDBY states appear on a paired phone in Studio Mode
- Disconnect OBS and confirm camera statuses fail safe instead of showing stale ON AIR
- Close and reopen desktop app, confirm it reuses the local cloud token and starts automatically
- Restart Windows and sign in to validate Start with Windows toggle
- Install on another streaming PC, use fresh code, ensure previous PC authorization is revoked
- Test incorrect OBS password, offline internet, expired registration code, and re-registration recovery
- Verify uninstallation removes the current-user Start Menu shortcut and startup registry value

The installer is unsigned. Do not treat a successful build as proof of antivirus reputation or end-to-end compatibility with every PC and firewall.
