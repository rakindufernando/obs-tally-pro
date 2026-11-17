# OBS TALLY PRO 3.0 by BUMBI Software Solutions

This is an in-place update to the existing repository. It retains production IDs, camera mappings, legacy QR codes, Bridge token validation, installed software settings and existing tally screens. The original BUMBI black-and-white uploaded logo is used with the original colors, on a white background where necessary.

## Crew multiview

The director dashboard has a dedicated Crew operations page with 2, 4, 9 and custom (up to 16) tile layouts and a scene-switch request control. It displays OBS tally states from existing database tables. The screenshot service uploads *still JPEG images* of configured OBS sources using the registered Bridge. It is not a frame-rate video stream. The director can view all private images. The cameraman can read only their own assigned camera preview; other camera tiles intentionally show no image. Phone users enter the crew view from the same /tally/:cameraId pairing link.

The OBS Bridge obtains JPG images from GetSourceScreenshot at at most 1 screenshot/11 seconds across the entire camera list, to avoid degrading streaming performance. This service runs only while OBS is connected. It does not open any inbound PC ports. The image bucket is private. The signed preview URL expires after 35 seconds, and RLS checks each caller before issuing it.

## Operator messages

Directors can broadcast to the crew or target a specific camera. Cameramen can reply to directors. Messages and read acknowledgments are protected by production and pairing authorization and sent via constrained server-side RPCs. Database messages are visible for 14 days; hard deletion still requires a retention job. The messaging UI polls every few seconds and is not dependent on receiving a realtime notification.

## Mobile talkback

The /talkback director page and integrated cameraman tally talkback page support browser microphone permission, WebRTC audio, one-to-one director/cameraman calls and hold-to-talk muting. No audio is forwarded to OBS or intentionally recorded or stored. Incoming audio may require a user click on mobile due to autoplay restrictions.

**Known limitation** This is one-to-one WebRTC signaling using public STUN only. There is no TURN relay configuration in this build. Cross-network connections and group/broadcast audio calls are **not verified and not supported as production reliable**. They must not be described as completed features. Provision a TURN service, add temporary ICE configuration and test mobile-network calling before claiming full cross-network/group talkback.

## Director remote scene switching

Production operators can request a switch only to a scene currently listed by the authenticated Bridge. A registered Bridge polls pending commands and invokes SetCurrentProgramScene locally. There is no exposed OBS password or OBS WebSocket on the public Internet. Requests are rate limited. Camera operators cannot request scene changes.

## OBS health

The existing real OBS statistics are visualized as recent client-side history while the dashboard is open. Thresholds for CPU and FPS can be changed per browser. Browser notifications require explicit permission and are rate limited. Nothing is fabricated when OBS is offline.

## Windows app and software sharing

The existing installer retains its AppId, desktop settings, encrypted password handling, startup controls and STOP ALL & EXIT. The original BUMBI wordmark replaces recolored copies. The About screen has a SHARE SOFTWARE button that copies a **locally configured verified** HTTPS installer URL from `%LOCALAPPDATA%\OBS TALLY PRO\verified-installer-url.txt`. If no separately hosted public file exists, the app tells the operator that sharing is not configured. GitHub is for source and build artifacts only and does not publish a public installer URL.

An independent public installer hosting service has **not yet been set up** through these connectors, so this requirement remains incomplete. Do not set a GitHub source/README/Release download link.

## Security and testing

Always verify new migrations and operator RLS against a director session, a paired cameraman session, a revoked cameraman session, and an unauthenticated session. Avoid publishing private camera previews. The React builds, Windows installer, WebRTC cross-network calls, OBS source captures, and multiple camera load tests are separate checks. Automated checks do not substitute for actual hardware/network tests.

To deploy only the current source repository, use `.github/workflows/deploy.yml`. For the Windows installer use `.github/workflows/bumbi-windows-installer.yml`. No installer binary is committed to the repository.