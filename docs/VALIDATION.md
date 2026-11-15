# Verification matrix and honest completion status

## Checks available offline

- Shared TypeScript state resolver compiles using the installed TypeScript compiler.
- Node.js test runner checks program, preview, idle, source mapping, nested scene, precedence, disconnection and freshness.
- Structural/static inspection of React TSX, OBS bridge TypeScript, SQL and Edge Function files.
- Security policy review identifies that signed-in camera devices cannot directly update authoritative tally or send private broadcasts.

## Unverified in the archive environment

- `npm install` cannot run where npmjs.org DNS is unavailable; no successful dependency installation is claimed.
- PostgreSQL migrations have not been executed on a real Supabase project.
- Edge Function has not been deployed to Supabase.
- OBS WebSocket 5.x has not been exercised against a live OBS application.
- Realtime authorization cannot be empirically verified without live connected phones and accounts.
- GitHub Pages deployment, Node Windows packaging, iOS Safari and Android Chrome tests remain outstanding.
- This build has not been field-validated for actual broadcast operations.

## Production acceptance tests to perform before a real event

| Test | Method | Pass condition |
| --- | --- | --- |
| OBS authentication | Start with invalid password | No connected status; reconnect warnings |
| Basic Program | CAM 01 scene on Program | CAM 01 turns red across dock, director and phone |
| Basic Preview | CAM 02 on Studio Mode Preview | CAM 02 green, no manual refresh |
| CUT transition | Cut preview into Program | New Program red, previous camera correct |
| FADE transition | Crossfade between cameras | No premature off air during active transition |
| Multiple sources | Show two mapped inputs in PIP | Both cameras red |
| Source nested scene | Move source under a nested scene | Correct source is detected |
| Disabled item | Disable mapped source item | Camera leaves Program/Preview |
| Same source both outputs | Map one source to both | Program red takes precedence |
| Studio Mode off | Turn off Studio Mode | Preview never synthesized |
| OBS disconnect | Exit OBS Studio | Signal unavailable after definitive disconnect |
| Bridge crash | Force-exit bridge process | Stale state expires within approximately 30 seconds plus timer scheduling |
| Cloud connection loss | Disable phone Wi-Fi/mobile internet | Phone displays warning, not stale red/green |
| Cloud reconnection | Restore internet | Fresh server snapshot received |
| Pairing expiry | Wait >5 minutes before claim | Code rejected |
| Pairing replay | Reuse previously claimed QR | Code rejected |
| Camera RLS | Attempt Camera 2 snapshot using Camera 1 device | Access denied |
| Channel RLS | Subscribe to Camera 2 using Camera 1 JWT | Subscription denied |
| Realtime send | Send forged status from authenticated cameraman | No permission to send |
| Bridge replay | Re-send old sequence | Cloud rejects stale sequence |
| Bridge revoke | Register replacement bridge | Old bridge cannot publish |
| Device revoke | Revoke phone while subscribed | New camera channel rotates; old phone has no current snapshot |
| Mobile foreground | Test Android Chrome and iOS Safari | Readable and current in supported foreground behavior |
| PWA offline | Refresh while disconnected | Offline visual warning, no cached live status |
| GitHub Pages | Deploy to `username.github.io/obs-tally-pro` | Routes work, assets load, public only |

## Manual SQL authorization test (conceptual)

Create two anonymous authenticated users via separate browser profiles and pair them to different cameras. Sign in as Camera 1's user and run `camera_snapshot` with Camera 2's camera UUID. The function must return a permission error. Attempt joining the private `camera:<Camera2Id>:<Camera2Nonce>` channel using Camera 1's JWT. The join must fail. The same user's channel for Camera 1 should work. Verify no `INSERT` policy on `realtime.messages` and no camera-device `UPDATE` policy on `tally_states`.

## Known incomplete features

Optional remote switching commands, production presets applying to the bridge, advanced system-tray/Windows GUI, full measured latency diagnostics, Web Push and translated Sinhala/Tamil resource dictionaries have not been implemented.
