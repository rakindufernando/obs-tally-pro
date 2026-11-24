# V4.0 release candidate acceptance gates

Status: DEVELOPMENT ONLY. No final release until evidence exists for every mandatory gate.

Preserve production IDs, camera IDs, existing pairing URLs, bridge credentials, installer AppId and branding. No live video, microphone capture, calling or talkback. No paid dependency. Keep installers outside the source repository.

## Implementation scope

- Director and authenticated browser docks: scene selection, studio mode, preview, TAKE, configured transitions and duration, supported T-bar, source visibility and transforms, existing filters, media controls, audio mixer volume/mute/balance/sync/monitoring/tracks, numerical audio meters, output controls, replay buffer, virtual camera, profiles and scene collections.
- Production tools: rundown, next scene, macros, audio follow and presets, clipping and silence alarms, ready/request signals, countdown, lower thirds, hotkeys, virtual stream deck, emergency scene/mute and control lock.
- Reliability: private production subscriptions, scoped command validation, expiry, atomic command claim, acknowledgement, reconnect and state recovery, LAN fallback with local authentication, operator roles, diagnostics, PWA and training simulation.
- Messaging: individual/group/broadcast, read acknowledgements, delete/clear and expiry on disconnect; no retained chat history.
- Administrator and director camera mapping changes must be atomic and preserve pairing IDs.

## Mandatory validation

| Gate | Required evidence | Status |
| --- | --- | --- |
| Baseline and upgraded build | Clean dependency install, lockfile, typecheck, unit tests, build | Not run |
| Authorization | Deny anonymous, cameraman and cross-production control at database and bridge | Not run |
| Command lifecycle | Expired, duplicate, invalid, disconnected and failed commands cannot silently execute | Not run |
| OBS integration | Real OBS confirms every supported command and authoritative state | Not run |
| Audio | Real levels, mute and volume; unsupported inputs clearly marked; quota-safe sampling | Not run |
| Docks | Actual OBS custom browser dock login, control, resizing and reconnect | Not run |
| Remote devices | Second PC, Android, iOS and different network; tally and messages | Not run |
| Regression | Existing production, mappings, pairing, revocation and desktop shutdown preserved | Not run |
| Failure recovery | OBS restart, bridge crash, cloud outage, LAN fallback and stale state | Not run |
| Packaging | Windows upgrade, launch without VS Code, uninstall and STOP ALL & EXIT | Not run |
| Deployment | Staging migrations reviewed, rollback rehearsed, website checked, external installer checksum verified | Not run |

Never expose OBS credentials or service-role keys to the browser. Never execute arbitrary OBS request types from clients. Require explicit confirmation for disruptive actions. Keep production deployment untouched until the above gates pass. No test is considered passed merely because documentation or a mock exists.
