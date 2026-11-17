# OBS TALLY PRO 3.1 by BUMBI Software Solutions

## In-place upgrade and data compatibility

The 3.1 release updates the existing `rakindufernando/obs-tally-pro` repository and Supabase project. It preserves the Inno Setup AppId, existing production IDs, camera IDs, camera mappings, phone QR pairing routes, private bridge registration tokens, OBS WebSocket settings, and Windows STOP ALL & EXIT behavior. The original BUMBI black-and-white wordmark is unaltered.

## Fixed defects with verified technical causes

1. The old talkback receiver was mounted only after opening a Talkback tab, so incoming calls were missed on the main tally screen. 3.1 mounts the call listener continuously on the tally and director pages, with direct camera call buttons, incoming overlay, answer, decline, busy, missed and end states, elapsed timer, mute, sound playback button and WebRTC network quality metrics.
2. Signaling rows were not in the `supabase_realtime` Postgres publication. 3.1 adds them with RLS and receiver filters. Fallback polling is throttled to 2.5 seconds, with de-duplication by monotonically increasing signal IDs.
3. Cameraman access to director multiview and camera snapshots was incorrectly allowed by an existing SECURITY DEFINER RPC and private Storage policy. Both now require production-operator authorization. Existing per-camera tally RPCs and pairings stay untouched.
4. The earlier previews were JPEG stills, and cannot be represented as real-time video. Director multiview now explicitly labels them as periodic OBS snapshots and shows unavailable/stale states rather than frozen thumbnails. Continuous OBS PROGRAM video is a separate authenticated WHEP receiver, with no fake video substitute.
5. A new `/director/login` and `/director` portal uses an isolated Supabase client session storage key. Only verified director or administrator profiles can log in, and SQL RLS / RPC checks enforce actual production authorization. Existing administrator and cameraman routes remain available.
6. Director messages now appear on the paired tally screen automatically through private Realtime plus 5.5-second fallback polling. Individual, group, and broadcast targeting follows the existing message RLS. Notification banners never replace the LIVE tally area and have acknowledgment and duration controls.
7. Added an atomic `save_camera_assignment_31` procedure to prevent half-created cameras or mismatched OBS source names. Existing camera IDs and phone links remain intact.
8. Director scene switches use the registered local OBS Bridge, a production-scoped scene RPC and command result acknowledgment, never an exposed public OBS WebSocket port.

## Actual continuous program feed

OBS WebSocket cannot distribute a continuous program video stream. The app does not fabricate one. The paired mobile page requests `program_feed_access` from Supabase; the backend returns a protected WHEP endpoint only when OBS is streaming and its Bridge heartbeat is fresh. The browser establishes a real WebRTC receive-only peer connection, and only labels it LIVE when WebRTC connects. The external media server must **separately authenticate the bearer token** and accept no unauthenticated video viewers. A MediaMTX instance configured for HTTP external authorization is supported by the included Edge Function `media-auth`.

A separate publicly reachable WebRTC media relay is **not provisioned** in this repo. Until the operator sets one up and enters its verified HTTPS `https://relay.example.com/program-<production-uuid>/whep` URL in Director Settings, the cameraman page correctly reports **Program video unavailable**. Do not insert a public, unprotected stream URL. Configure your own HTTPS relay, cross-origin WebRTC, ICE public host candidates, OBS RTMP/WHIP publishing and secure media-auth callback. The MediaMTX external authorization callback validates program path, Supabase user token, current pairing/role permissions, and a private publish token. Configure `MEDIA_PUBLISH_TOKEN` only in Edge secrets and the OBS publishing computer.

## Cross-network calling

The browser uses standard encrypted WebRTC, explicit mic permission, private Supabase signaling, ICE candidates and one-to-one audio sessions. TURN credentials can be provided by the `crew-ice` Edge Function through **10-minute HMAC** credentials if you separately deploy a coturn-compatible server and configure `TURN_URLS` and `TURN_SHARED_SECRET` as Edge secrets. STUN alone does not guarantee communication between different mobile networks. This deployment includes no configured TURN server and cannot be claimed to pass cross-network real-device tests.

The browser page must remain open/active for reliable incoming-call notifications. On mobile, audio autoplay, ringtone, vibration, and background execution depend on browser/device permissions. Push notifications for closed tabs are not yet integrated. Call audio is not sent to OBS or intentionally recorded.

## Remote director and administrator control

PC 1 runs OBS Studio and the local Windows Bridge; PC 2 director uses `/director/login` to access the dedicated role-protected control panel; PC 3 administrator uses the existing admin dashboard and mappings. The public website and Supabase backend connect them without exposing local OBS passwords or WebSocket ports.

## Tests and release gates

- 20 existing OBS tally mapping unit tests, TypeScript validation, web build, and Windows native runtime/installer tests run through GitHub Actions.
- Authorization tests for camera-specific pairing, director-only multiview, scene control, operator messages, call signaling and unauthorized users should be performed with reversible SQL transactions.
- Actual HDMI/camera, WebRTC relay, program video, cross-network audio, tab-sleep, mobile notification and multi-PC installation checks require the user's own hardware and media/TURN services. **These are not simulated or claimed passed.**
- The setup executable must be uploaded outside GitHub source and Releases, and the external public HTTPS URL separately verified. The existing SHARE SOFTWARE feature intentionally refuses to share a missing/unverified link.

## Deployment

GitHub Pages deployment keeps the same base `/obs-tally-pro/` and existing `/#/pair` and `/#/tally/:cameraId` routes. The v3.1 migrations are additive and safe to apply to an upgraded v3.0 database. Edge Functions `crew-ice` and `media-auth` are optional services for configured infrastructure. Set the version in desktop, website metadata, and Windows installer to 3.1.0.

**Developed by BUMBI Software Solutions.**