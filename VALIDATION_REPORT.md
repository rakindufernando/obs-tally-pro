# OBS TALLY PRO Cloud Edition, validation report

Date 2026-11-15

## Confirmed in this environment

- Completed the modular GitHub Pages + Supabase + local OBS Bridge source package.
- Validated seven JSON configuration files with a JSON parser.
- Parsed all nine TypeScript and TSX source modules with TypeScript 5.8-compatible global compiler syntax APIs. No syntax errors reported.
- Compiled the dependency-free `packages/shared` module with the available TypeScript compiler.
- Ran the Node.js test runner against 20 tally mapping/freshness test cases. **20 passed, 0 failed.**
- Reviewed the SQL migration for the mandatory authorization functions and read-only/private broadcast policy boundaries. Retention of tally history and audit rows is bounded by periodic cleanup, and duplicate/unchanged cloud snapshots are suppressed.
- Consulted current Supabase documentation for Realtime Broadcast `realtime.send()`, private channel authorization and `verify_jwt = false` custom-auth Edge Function deployment.

## Not confirmed in this environment

- `npm install` was attempted and **failed** because the npm registry could not be reached (`EAI_AGAIN`). The React app and Bridge TypeScript therefore have not completed a dependency-based typecheck or production build.
- A real Supabase project is not connected. SQL migrations, Edge Function deployment, private-channel authorization, and end-to-end signal distribution have not been tested against Supabase.
- No live OBS instance is available here. OBS WebSocket scene change/transition events have not been field-tested.
- The Windows packaging workflow and optional standalone EXE have not been run. No `.exe` binary is included.
- Real iPhone/Android device tests, production latency measurements, Wi-Fi/mobile-data reconnection, and GitHub Pages deployment remain outstanding.

## Production blockers

1. Run `npm install`, `npm test`, `npm run typecheck`, and `npm run build` in a normal internet-connected development machine.
2. Apply the SQL migration and deploy the Bridge function in your own Supabase project.
3. Configure the first admin, create a production, pair the local Bridge and pair camera phones.
4. Verify unauthorized cross-camera subscriptions are refused on live Supabase Realtime.
5. Execute the on-site end-to-end acceptance test matrix in `docs/VALIDATION.md`.

## Features intentionally not claimed

The delivered source is a substantive functional implementation, not a verified commercial broadcast system. Optional remote OBS switching, a complete Windows system-tray GUI, compiled Windows installer, live delay meter, Web Push notifications, and preset application UI are not included. The OBS dock is intentionally read-only to avoid disruptive operations.
