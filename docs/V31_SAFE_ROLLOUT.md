# OBS TALLY PRO v3.1 | Safe rollout and acceptance testing

This branch preserves existing production IDs, camera IDs, source assignments, bridge registration, pairing tokens, and other working features. **Do not deploy this branch to the live website until database migration, protected media relay, and actual OBS tests are complete.**

## What this patch changes

- Removes both legacy WebRTC voice calling interfaces, calling assets, and client-side microphone requests.
- Retires only voice-call signalling SQL functions/table in `202611180001_v31_director_media_no_calls.sql`. The operator text message tables and WebRTC video authentication remain in place.
- Keeps the separate director login, source mapping, OBS bridge control path, and branded UI.
- Restricts director multiview to authorized director accounts by `is_production_director` in existing SQL and uses one authenticated continuous WebRTC WHEP feed per camera tile.
- Cameraman tally retains only a personal tally and the OBS program feed. No camera-only WHEP URL is available to a cameraman.
- Tally messages load from persistent Supabase rows; read acknowledgements are written through `mark_operator_message_read`. Incoming notifications use the `ops:<production_id>` private broadcast channel and polling fallback.
- Director scene switching reports success only after OBS Bridge confirms completion; timeout/failed conditions are displayed.

## External media infrastructure REQUIRED

The existing repository does **not** contain a deployed media server or any real camera video publishers. A URL alone does not generate live video.

1. Operate a TLS-enabled WebRTC/WHEP-compatible media relay (for example MediaMTX) on an independently secured host and configure its HTTP external authentication against the deployed `media-auth` Edge Function.
2. Deploy `media-auth` from this branch and migrate the database **before** deploying the web code. Verify JWT validation and role-specific access with real director and paired-camera accounts.
3. Publish OBS's actual PROGRAM output to the relay path `program-<production_id>` using a secure broadcaster/publisher. Configure its matching HTTPS WHEP URL in Director Settings.
4. Publish each camera's real video to its `camera-<camera_id>` relay path. A SOURCE mapping by itself is **not** a video output. Use an explicit additional encoder/capture pipeline if needed. Avoid extra OBS CPU load, and provide sufficient upstream and relay bandwidth for all simultaneous feeds.
5. Configure firewall, TLS, CORS, HTTPS, STUN/TURN, and WHEP session cleanup for remote browser connectivity. The `crew-ice` Edge Function can provide short-lived TURN credentials if configured. Verify external auth for both `program-` and `camera-` paths and reject unauthorized publishers/readers.
6. Configure individual director camera WHEP URL entries in Settings. The server returns unavailable until a configured path and fresh Bridge status exist.
7. Verify OBS program audio playback; this is **program video audio** and not removed talkback. Cameraman pages never request microphone access.

Do not use screenshots, cache-busted JPEGs, local OBS WebSocket endpoints, or simulated previews as substitutes.

## Live acceptance checklist

| Verification | Expected result |
| --- | --- |
| Existing camera IDs and pairing links | Preserved; no re-pair required |
| Administrator and separate director sign-in | Independent sessions and correctly assigned production |
| Cameraman multiview RPC and camera WHEP URL access | Denied, including direct API request |
| Director camera multiview | Actual continuous video in 2, 4, 9 and custom layouts |
| OBS program feed on paired phone | Actual continuous video, real audio only if explicitly enabled |
| Camera scene switching | Confirmed through Bridge after actual OBS program changes |
| Invalid/expired/revoked role or pairing | Denied server-side for messages and media |
| Tally PROGRAM/PREVIEW/IDLE/DISCONNECTED | Matches real OBS source output and stale heartbeat |
| Individual/group/broadcast messages | Correct recipients receive banner on tally screen |
| Message ack/reload/reconnect | One server-side acknowledgement; unread preserved until acknowledged |
| Director UI | Every control either performs and confirms the requested action or gives a clear error |
| Stream health | Real OBS telemetry with stale connection status |
| Multiple networks | Use a remote director PC and cameraman phone on separate internet connection |
| Windows stop/shutdown | Bridge shuts down; OBS remains running |
| Windows upgrade | Compatible saved bridge config and credentials remain intact |
| Installer sharing | SHA256-verified installer on an external HTTPS host, not GitHub Releases |

## Validation and release rules

Run `npm install`, `npm test`, `npm run typecheck` and `npm run build`. GitHub Actions `Validate Project` covers these checks, but cannot validate real OBS, browsers on different networks, relay uptime, RLS with live signed-in test users, Windows install/upgrade or external file hosting.

For a Windows binary, the existing `bumbi-windows-installer.yml` compiles an Inno Setup v3.1 installer on Windows and runs the native desktop self-tests. That build is **not** a verified public download link. Keep Windows installers outside the repository and GitHub Releases. After independently hosting and checksum-verifying the installer, put its HTTPS URL into the desktop's `verified-installer-url.txt` in `Program.UserFolder`. The existing SHARE SOFTWARE button intentionally refuses unconfigured or invalid links.

Do not mark the feature or release production ready until every real-device and media test is completed and security-reviewed. Record unverified cases rather than claiming success.
