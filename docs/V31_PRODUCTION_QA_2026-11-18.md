# OBS TALLY PRO v3.1 | Production QA audit

**Audit date** 18 November 2026

**Repository** rakindufernando/obs-tally-pro

**Tested website** https://rakindufernando.github.io/obs-tally-pro/

**Production Supabase** OBS TALLY PRO in ap-southeast-1

## Executive verdict

**Web guest routes and security denial tests passed. Full production acceptance NOT YET VERIFIED.**

The running OBS Bridge is offline, no real Program WHEP endpoint is configured, and no individual camera WHEP endpoint is configured. Therefore director live multiview, cameraman real Program video, actual OBS command execution, network ICE connectivity, and physical Windows installation cannot honestly be certified in this audit.

## Automated checks and evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Public GitHub Pages deployment | Passed | Latest successful deploy workflow |
| Existing guest browser smoke tests | 12/12 passed | GitHub Actions 44264590197 |
| Live Chromium browser audit | 37/37 passed | GitHub Actions 44275947939 |
| Live Firefox browser audit | 37/37 passed | GitHub Actions 44275947939 |
| Live WebKit browser audit | 37/37 passed | GitHub Actions 44275947939 |
| Total browser matrix | **111/111 passed** | GitHub Actions 44275947939 |
| Installed production dependency advisory scan | **0 reported vulnerabilities** | GitHub Actions 44275947939 |
| Actual live Edge Function negative authorization checks | 10/10 passed | GitHub Actions 44275947939 |
| Project TypeScript, OBS tally logic and build | Passed | GitHub Actions 44274701195 |
| Native Windows build and self-tests on release commit | Passed | GitHub Actions 44239119263 |
| MediaMTX and Caddy container startup/config | Passed in CI only | GitHub Actions 44237619960 |
| Physical Windows setup and upgrade | NOT TESTED | Real Windows user/session required |
| Physical OBS switching and scene changes | NOT TESTED | Actual OBS Bridge not connected |
| Continuous live program/camera video | NOT TESTED | No published media or relay endpoints |
| Inter-network ICE and device reconnection | NOT TESTED | Requires actual remote clients and relay |
| SHARE SOFTWARE verified public download link | NOT VERIFIED | Separately hosted shareable installer URL not yet configured |

Each of the Chromium, Firefox and WebKit browser suites checks five screen widths (320, 390, 820, 1440, 1920 pixels) and seven routes per size plus unauthenticated tally behavior and public JS/CSS/PWA assets. It checks page JS exceptions, image loading, no horizontal overflow, protected-route redirects, director login presentation, pairing submission safeguards, the absence of retired call UI and TLS-delivered assets. It uses no live sessions or fake camera frames.

The Edge Function suite sends unauthenticated/invalid requests only. It verifies media-auth denies unauthenticated Program/camera reads, invalid publisher tokens and invalid paths, crew-ice rejects missing authentication, and the registered OBS Bridge endpoint refuses unsigned commands. It does not prove valid-token playback.

## Supabase transactional integration tests

Tests were performed using real role assignments in **transactions that were rolled back**. No camera mappings, pairings, messages, director assignments, stream credentials or OBS commands were permanently altered.

| Check | Result |
| --- | --- |
| Director can access own multiview RPC snapshot | PASS |
| Paired cameraman denied director multiview RPC | PASS |
| Paired cameraman denied private camera feed RPC | PASS |
| Paired cameraman denied OBS scene switching | PASS |
| Administrator retains ordinary operator role but denied director multiview | PASS |
| Anonymous role denied media/messaging functions | PASS |
| Targeted camera receives direct message and can acknowledge | PASS |
| Other cameraman cannot read targeted message or acknowledgement | PASS |
| Two cameras both receive group and broadcast messages | PASS |
| Director receives crew reply while other cameraman cannot read it | PASS |
| Scene command queued correctly under simulated fresh bridge heartbeat | PASS, database-only |
| Queued scene command rolled back before OBS delivery | PASS |
| Historical voice-call signalling table removed | PASS |

## Production data preservation snapshot

Read-only snapshot taken on 18 November 2026.

| Item | Count |
| --- | ---: |
| Production records | 1 |
| Cameras | 2 |
| Camera mappings | 2 |
| Active paired devices | 5 |
| Director profiles | 1 |
| Director production assignments | 1 |
| Operator messages | 9 |
| Read receipts | 5 |
| Configured Program WHEP URLs | 0 |
| Configured camera WHEP URLs | 0 |
| Fresh OBS Bridge connections | 0 |
| Active scene commands | 0 |

All post-audit data counts reflect the live database, not simulated test data.

## Supply-chain note

The repository does not currently contain a committed `package-lock.json`. The dependency scan generated a temporary lockfile within CI and reported zero known advisories for the installed production dependency set. For reproducible releases, generate, review, and commit an npm lockfile and switch the build workflows to `npm ci` in a separately tested change.

## Blocking issues

**P0 live video infrastructure absent**

No Program or per-camera HTTPS WHEP playback URLs are configured. The repository has a tested Docker Compose + Caddy + MediaMTX template, but does not create a remotely reachable media server. Add a verified relay host, DNS, TLS, secure publisher credential and real video encoders, then repeat playback tests across networks and verify stable moving video.

**P0 OBS Bridge not online**

No production heartbeat within 30 seconds. Remote scene switching, tally accuracy under actual OBS transitions, cross-machine status synchronization, and stream health telemetry cannot be tested end-to-end. Start OBS with the installed Bridge and its registered token, then inspect live state and execute controlled scene changes.

**P1 Windows physical installation not exercised**

The Windows EXE compiled and self-tested under GitHub Actions but has not been manually installed/upgraded on the actual production computer. Verify persisted credentials and mappings, auto-start, graceful stop, uninstall/upgrade, and that STOP ALL does not terminate OBS.

**P1 Public installer sharing not configured**

Previous workflows generated a Windows v3.1 installer artifact, but SHARE SOFTWARE requires an independently verified HTTPS download URL outside GitHub. Confirm external file hosting, sharing permissions and the EXE SHA-256 before distributing.

## Security advisory review

Supabase security advisor reports informational RLS-without-policy entries on intentionally private bridge/pairing tables and warnings about authenticated SECURITY DEFINER functions, anonymous sign-ins, and leaked-password protection. Such warnings require manual review against the actual intended privileges and pairing workflow. They do not by themselves prove exploitation or justify changing working authentication without an impact analysis.

Review https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and Supabase Authentication settings.

## Release acceptance checklist

Production acceptance should occur on the **actual OBS PC** and **at least one phone using a different internet connection**. Confirm all actual scene mappings and camera tally changes, director-only 2/4/9/custom multiview, secure Program video on cameraman tally, message banner/acknowledgement across devices, realtime recovery after disconnect, revoke/expiry, stream health, installer persistence, and shutdown leaving OBS running.

Do not claim everything works perfectly until these unverified physical tests pass.

## How to rerun

GitHub Actions workflow **Deep Production Website Audit** runs on deployment completion, weekly, and on manual trigger. All three browser engines are audited independently, and Chromium also tests Edge Function authorization and npm production dependencies. It publishes `deep-audit-results.json`, `deep-edge-results.json`, and any failure screenshots as an Actions artifact. Source scripts are `scripts/deep-audit-public-pages.mjs` and `scripts/deep-audit-edge-auth.mjs`.

The older Public Website Browser Smoke workflow remains in place and is not replaced.
