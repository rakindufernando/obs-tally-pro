# OBS TALLY PRO v3.1.1 | Messaging, Director Remote Login and No-Video Update

BUMBI Software Solutions

## Changes

- Video preview player removed from cameraman tally and all director pages. The old WHEP browser component is removed entirely from the web build. OBS Bridge no longer captures recurring JPEG screenshot thumbnails, reducing bandwidth and overhead.
- Director multiview is now a light camera status grid. It shows actual PROGRAM, PREVIEW, IDLE, and OFFLINE states from the OBS Bridge, with 2, 4, 9 and 16-camera layouts, fullscreen and authorized scene switching. **It is a tally state board, not a video wall.**
- Cameraman tally always shows the personal tally indicator and compact director instruction card. Messages no longer float over the main indicator or video. Urgent messages vibrate where supported.
- Director can send to one camera, a group, or all cameras using tap-friendly checkboxes and quick commands. Cameramen can reply. Periodic 3-second polling plus private Supabase Realtime updates make messaging resilient to dropped events.
- Director and administrators can delete single messages or clear all messages. Cameramen can delete their own replies but cannot delete director messages for everyone. Cameramen can acknowledge one instruction or all their currently visible instructions.
- Operator messages are short-lived. The database removes messages when OBS reports disconnection, after a stale 90-second bridge heartbeat through the minute-based cleanup job, or after 45 minutes. Read receipts cascade on deletion. The job replaces the broken legacy retention job referencing a removed voice table.
- Separate director login no longer waits for the primary administrator/cameraman session. Direct public links are provided.
- Improved responsive status board, updated cameraman alerts, director link copy and OBS connection diagnostics.

## Open director page on another PC

Use the following link **including the hash marker** in any HTTPS browser.

https://rakindufernando.github.io/obs-tally-pro/#/director/login

You can also use a regular web address that automatically redirects.

https://rakindufernando.github.io/obs-tally-pro/director.html

A director account must exist in Supabase Authentication, have `profiles.role='director'`, and have a `production_members` assignment for the relevant production. An administrator account does **not** inherit the separate director-only dashboard. Use the administrator Settings page to assign the director account and copy the link.

The streaming OBS PC needs the installed Bridge running and reporting a fresh heartbeat. A director on another PC never needs to open OBS WebSocket ports on the public internet. Scene commands are sent to Supabase and pulled by the secure Bridge on the streaming PC.

## Message cleanup

- **Delete one** in Director Messages removes the message immediately for all recipients.
- **Clear all messages** deletes all messages and acknowledgements for that production. This cannot be undone.
- **Automatic deletion** happens when OBS disconnects. If the Bridge disappears without a disconnect report, cron cleans up after its heartbeat is older than 90 seconds, with a maximum additional one-minute cron delay.
- All remaining messages expire after 45 minutes even when OBS stays connected.
- Existing production camera IDs, pairings, source mappings, streaming configuration, and OBS credentials are untouched by the migration.

The Supabase migration file is `202611200001_transient_messaging_and_disconnect_cleanup.sql`. It must be applied before deploying the new web code. The migration schedules the cleanup job using existing pg_cron. Do not apply it to another Supabase project without reviewing the project's roles and user data.

## Release acceptance

| Test | Expected |
| --- | --- |
| Cameraman tally, mobile portrait | No video block; main tally clearly visible; message card compact |
| Director status board, desktop/mobile | Camera states from OBS, no video, layout and fullscreen controls |
| Director login on different PC/network | Hash login and `director.html` both reach secure login |
| Director role, production assignment | Only assigned directors reach private dashboard |
| Cameraman without director permissions | Cannot access private status grid or switch OBS scenes |
| Message individual/group/broadcast | Correct recipients receive and can acknowledge, including after reconnect |
| Delete one/clear all | Authorized; rows and read receipts removed from all devices |
| OBS disconnect | Messages deleted at disconnect or after stale heartbeat grace |
| Reconnect | No old instructions resurrected; new messages deliver normally |
| OBS command queue | Director scene request produces completed/failed Bridge result |
| Windows installer upgrade | Keeps saved pairing and settings; stopping Bridge never closes OBS |

Tests using role-switched SQL transactions were rolled back. CI builds verify the frontend, OBS Bridge TypeScript and tally logic, Windows installer compilation and browser smoke. **Real remote browser sign-in, physical Windows installer upgrade and live OBS scene change confirmation still require real devices and accounts.** A successful build is not the same as proving those integration paths in production.
