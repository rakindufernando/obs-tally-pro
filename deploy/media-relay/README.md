# OBS TALLY PRO v3.1 secure real-video relay deployment

This is deployable infrastructure, **not a running cloud server**. The live Supabase project and GitHub Pages do not themselves distribute low-latency camera video. A real VPS with public DNS, Docker, and sufficient bandwidth is required.

## 1. Provision the external relay

Use a Linux VPS with a public address and a domain such as `relay.yourdomain.com`. Create a DNS A/AAAA record to the VPS, then allow inbound TCP **80** and **443**, and UDP **8189** in both the provider firewall and the host firewall. Keep other ports private. Ensure the host can make outbound HTTPS requests to the Supabase Edge Function.

Copy this directory `deploy/media-relay/` to the VPS. Run these commands inside it.

```bash
cp .env.example .env
# Edit RELAY_DOMAIN in .env to the real public DNS name.
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 caddy mediamtx
```

Compose pins MediaMTX to **1.21.4**, terminates HTTPS through Caddy, and publishes only ICE UDP port 8189. Caddy obtains public TLS certificates after DNS and firewall routing work. MediaMTX authenticates EVERY publish/read through `media-auth` on the existing Supabase project, with no anonymous exception. Its camera media and program paths are not accessible without permission.

**DO NOT publish private OBS WebSocket, remote control, Supabase service keys, or camera credentials.** Do not publish the real VPS `.env` file or any tokens to GitHub.

The container configuration does **not** create video streams by itself. A real publisher is required for every active path.

## 2. Enable secure publishing without breaking the existing OBS stream

Generate a separate 32-byte+ media publisher secret on a trusted administrator computer.

```bash
openssl rand -hex 32
```

In the existing Supabase project settings, set an Edge Function secret named `MEDIA_PUBLISH_TOKEN` to this result. Do not place the value in a publicly committed file. `media-auth` requires this secret to accept WHIP publishers. Keep the original YouTube/Facebook/Twitch stream outputs and the OBS Bridge mapping unchanged.

For OBS PROGRAM video, configure an **additional parallel OBS output or an independent encoder** to publish the actual OBS Program output. The WHIP publisher should use

```text
Service     WHIP
Server      https://<RELAY_DOMAIN>/program-<PRODUCTION_UUID>/whip
Bearer      the private MEDIA_PUBLISH_TOKEN
```

Use OBS Studio's WHIP feature or another compatible publisher. Do **not** replace the existing primary live-stream service just to publish the tally feed. Hardware or OBS plugins may be required for a second concurrent output.

For each director camera preview, publish the actual **individual video source** (not a still image and not a copy of the Program feed) to

```text
https://<RELAY_DOMAIN>/camera-<CAMERA_UUID>/whip
```

Each camera requires a working camera-specific encoder/publisher. Existing OBS source mappings and tally identities do not automatically create independent media encoders. Choose H.264/Opus or other browser-supported codecs and budget CPU/bitrate for all simultaneous feeds.

Do not assume every OBS CAMERA source is a physical capture feed with an individually exportable stream. Determine the encoder path for each actual source and test its output before enabling the URL.

## 3. Configure the director panel

Once the corresponding publisher is online and the HTTPS relay works, sign in to the **separate Director Control Panel**.

- Under Settings, enter the real Program WHEP playback URL `https://<RELAY_DOMAIN>/program-<PRODUCTION_UUID>/whep`.
- Under each camera, enter `https://<RELAY_DOMAIN>/camera-<CAMERA_UUID>/whep` for the matching stream only.
- Save the changes. Role-based Supabase policies restrict camera entries and playback to the assigned director.
- Cameramen automatically see only the actual Program WHEP stream on the tally screen, never the private camera streams.

The web player shows **VIDEO UNAVAILABLE** whenever there is no authenticated publisher, no configured relay, or the OBS Bridge heartbeat is stale. It must never substitute cached still frames.

## 4. Security and real-media acceptance

After provisioning a test director login and a paired cameraman on an actual production, set temporary credentials in the shell (do not save them in files or terminal history) and run `bash check-access.sh`.

```text
PRODUCTION_ID   UUID of production
CAMERA_ID       UUID of one production camera with a configured WHEP endpoint
DIRECTOR_JWT    current session JWT of a director assigned to production
CAMERAMAN_JWT   current JWT of a cameraman paired to that production
```

The script checks that authorized director and paired cameraman users may read the program stream, that cameramen cannot read camera multiview, and that unauthenticated users and invalid publishers cannot access streams. It prints no tokens. A passed auth check **does not** prove actual ICE connectivity or video.

Then test on devices on different public networks. Verify actual moving frames on every director tile, Program video plus tally on the phone, full-screen, 2/4/9/custom layout selection, urgent message banners/acknowledgement, OBS scene-switch confirmations, disconnected/reconnected states, and browser retries. Observe video frame counts and codec negotiation. Check that revoked phones and removed directors are denied on their next authorization request.

Test without breaking existing OBS outputs, pairing links, bridge credentials, scene mapping or recording. Physically verify the Windows installer, upgrade and STOP behavior leaves OBS running.

## 5. Separate installer hosting

The installer workflow compiles the EXE and calculates a SHA-256 digest on Windows. A GitHub Actions success is not a publicly distributed installer.

After **manual Windows install and upgrade verification**, upload the EXE to an independently controlled HTTPS file host outside GitHub and confirm its SHA-256 digest. Then configure the trusted download URL under the desktop app's local `verified-installer-url.txt` as supported by the existing SHARE SOFTWARE action. A URL is not invented or populated before the real file is hosted.

## 6. Release gate

Do not merge and release the draft repair branch until the real media server, publishers, and remote OBS production pass the tests above. GitHub Actions validates source, builds, and Windows desktop smoke tests. It cannot verify physical sources, multi-network ICE, live OBS, production bandwidth, or the EXE after installation.
