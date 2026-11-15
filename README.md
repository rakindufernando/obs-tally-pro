# OBS TALLY PRO Cloud Edition

A real OBS WebSocket 5.x tally bridge, private Supabase real-time signaling and a static GitHub Pages React app. Intended for directors, OB teams and camera operators. The **OBS computer must run the local Bridge**. GitHub Pages alone cannot connect to OBS or relay private camera statuses.

## Status and verification

This source package implements the principal integration paths, not a preverified live-production deployment. Automated mapper tests and TypeScript syntax/static analysis are included; actual OBS, Android/iOS, Supabase authorization and GitHub Pages tests must be performed using your own production equipment and accounts. See `docs/VALIDATION.md`.

## Architecture

```text
OBS Studio (local ws://127.0.0.1:4455)
    |
    v
OBS Bridge on Windows (Node.js, OBS password, private bridge token)
    | outbound HTTPS requests only
    v
Supabase Edge Function /bridge
    | authorized PostgreSQL RPC, monotonic sequence checks
    v
PostgreSQL tally_states + RLS + realtime.send private Broadcast
    | private authorized Realtime subscriptions
    v
GitHub Pages React UI --> Director, OBS Browser Dock, paired cameraman phones
```

The OBS WebSocket password and the Supabase service role credentials must **never** go in the GitHub Pages repository variables or the Vite environment. The bridge receives a scoped bearer credential from a one-time registration code. The Edge Function alone uses privileged Supabase credentials. The browser receives only a Supabase public publishable key, plus personal Auth sessions.

## Included project

- `apps/web` mobile/desktop React and TypeScript app, HashRouter, PWA, QR pairing and full-screen tally lights
- `apps/obs-bridge` local OBS WebSocket bridge with scene/source traversal, reconnects, health checks and cloud HTTP publisher
- `packages/shared` camera source mapping, priority rules and heartbeat freshness checks
- `supabase/migrations` PostgreSQL tables, RLS, private channels, atomic pairing, bridge identity and versioned tally RPCs
- `supabase/functions/bridge` trusted cloud ingress for bridge registration, configuration, heartbeats and authoritative state updates
- `.github/workflows` public GitHub Pages deployment, CI, optional Windows bridge packaging
- `docs` setup, security and acceptance test notes

## Prerequisites

- Node.js 22 or compatible Node 20.19+, npm, Git
- OBS Studio 28+ with built-in WebSocket 5.x
- A free Supabase project with PostgreSQL, Auth, Edge Functions and Realtime enabled
- A GitHub repository called `obs-tally-pro`
- Access to OBS production PC and phones, with stable internet service for the cloud mode
- Supabase CLI for the database and function deployment

## 1. Install locally

```bash
npm install
npm run build -w @tally/shared
npm test
npm run typecheck
```

No generated `package-lock.json` is included because the package registry was inaccessible while preparing this archive. Run `npm install`, check dependency versions, then commit the generated lockfile and optionally switch GitHub Actions to `npm ci` for reproducibility. Do not commit `.env` files or `bridge-config.json`.

## 2. Create a Supabase project

**Existing OBS TALLY PRO users:** The cloud project `lvzrhzlcyajhhgfqgdar` has already been created and configured. Do not run this bundled initial SQL migration against the existing live Supabase project. The live database may have subsequent permission/security migrations not reflected in the initial SQL snapshot.


1. Open https://supabase.com/dashboard and create a free project.
2. In **Authentication > Providers > Anonymous**, enable **Anonymous Sign-ins** to let paired phone users have camera-scoped Supabase Auth identities.
3. In Auth settings, enable Email/Password for directors. Do not allow untrusted users to become directors by signing up; new Auth users start with the `cameraman` role.
4. In **Realtime Settings**, disable **Allow public access** and require private channels.
5. In **API Keys**, copy the project URL and current `sb_publishable_...` key. This key is safe in the browser **only because RLS is enforced**.
6. Install the Supabase CLI following https://supabase.com/docs/guides/local-development/cli/getting-started .

Link your local Supabase directory to your project and apply the migration.

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy bridge --no-verify-jwt
```

The Edge Function is deliberately configured with `verify_jwt = false` at the gateway because the local bridge authenticates with a 256-bit opaque bearer token instead of a Supabase user JWT. Its registration code and every request are explicitly verified inside the function/SQL. The Edge Function uses the automatically supplied service-role / secret Supabase environment credentials. Do not give that credential to the bridge or web app.

To deploy migrations manually if the CLI is unavailable, run `supabase/migrations/202611150001_initial.sql` in the Supabase SQL editor, then deploy the Edge Function using the CLI.

## 3. Create the first administrator account

1. In Supabase Authentication users, create an email/password user manually, or register a user using an Auth admin flow. The browser sign-in screen intentionally does not implement unrestricted admin registration.
2. Copy that user's UUID from the Auth Users table.
3. Run the following SQL in Supabase SQL editor, replacing the placeholder with the actual UUID.

```sql
insert into public.profiles (id, role, display_name)
values ('PASTE_AUTH_USER_UUID_HERE', 'administrator', 'Broadcast Administrator')
on conflict (id) do update set role='administrator';
```

For additional directors, create their Auth user and associate them with the specific production after the production is created.

```sql
insert into public.profiles (id,role,display_name)
values ('DIRECTOR_USER_UUID_HERE','director','Director')
on conflict (id) do update set role='director';
insert into public.production_members (production_id,user_id,role)
values ('PRODUCTION_UUID_HERE','DIRECTOR_USER_UUID_HERE','director');
```

The admin can use every production. A director needs membership to access a particular production's resources.

## 4. Configure the React frontend

Create `apps/web/.env.local`.

```ini
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

For local development, the default Vite base is `/obs-tally-pro/`, so use `http://localhost:5173/obs-tally-pro/#/login`. For easier local root routing, set `GITHUB_PAGES_BASE=/` when launching Vite.

```bash
GITHUB_PAGES_BASE=/ npm run dev
```

On Windows PowerShell, use `$env:GITHUB_PAGES_BASE = '/'; npm run dev`.

## 5. Create a production and cameras

1. Sign in at `/#/login` with the administrator account.
2. Open **Productions** and create a production, such as `Sports Broadcast`.
3. Open **Cameras**, create one camera per cameraman, and supply its physical camera number/name.
4. In the camera editor add one or more `SCENE` or `SOURCE` mappings, for example `CAM 01` or `HDMI Capture Device 1`. Names must match OBS exactly, unless using the UUID field.
5. Mapping rules support nested scene/source traversal, exclusions, multiple sources, split screens and picture-in-picture based on OBS scene metadata. They cannot determine actual pixel contribution after cropping and compositing.

## 6. Start the local OBS Bridge

Enable OBS Studio **Tools > WebSocket Server Settings**. Turn on WebSocket, set a strong password, leave port `4455` unless deliberately customized.

In **Settings**, generate a **Bridge registration code**. Codes expire in 10 minutes, are single-use and are never OBS passwords.

Create `apps/obs-bridge/.env` on the production PC.

```ini
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
OBS_URL=ws://127.0.0.1:4455
OBS_PASSWORD=YOUR_LOCAL_OBS_WEBSOCKET_PASSWORD
BRIDGE_REGISTRATION_CODE=ONE_TIME_CODE_FROM_DASHBOARD
```

Run on the OBS PC.

```bash
npm install
npm run build -w @tally/shared
npm run dev:bridge
```

The first start registers the bridge using its one-time code. It then saves the private bearer credential and monotonic sequence number in the OS user's private directory `~/.obs-tally-pro/bridge-config.json`. Linux/macOS permission bits are restricted; on Windows use an appropriately protected Windows user account and filesystem ACLs. Move/secure this file using your OS credential protection policy. Once registered, remove `BRIDGE_REGISTRATION_CODE` from the `.env` file. Future launches reuse the private local registration file.

For production, after `npm run build` execute `npm run start -w @tally/obs-bridge`. The Windows launcher at `scripts/start-bridge-windows.cmd` starts development bridge mode if Node and dependencies are installed. Optional manual GitHub Actions workflow `Build Windows OBS Bridge` attempts to package an EXE using the project packaging config. **No compiled EXE is included or verified in this archive.**

Keep the bridge running while OBS is running. It makes outgoing HTTPS requests only. Do not forward local OBS WebSocket port `4455` to the internet.

## 7. Pair each cameraman phone

1. In **Cameras** select **Pair phone**.
2. Scan the QR code on the cameraman's Android/iOS phone. The link uses your GitHub Pages URL, not `localhost`.
3. On the phone select **Pair this phone**. Anonymous Supabase Auth creates a scoped identity and the single-use code binds it to exactly one camera.
4. The tally page opens and receives private realtime status via Supabase.
5. Enable sound, vibration, fullscreen and screen wake lock as permitted by that phone/browser.
6. To revoke a lost phone, open **Device access** and revoke. A new camera channel nonce is created, and the old private channel receives no new camera updates.

If you use an already signed-in director browser, open the QR invitation in an incognito/private tab or another browser profile. The phone uses its own Supabase Auth identity. Anonymous auth session data is stored in the phone browser, not in the URL.

## 8. Deploy on GitHub Pages

1. Create a new repository named `obs-tally-pro`. Do not replace existing unrelated repositories.
2. Push the unpacked project to the new repository after reviewing its configuration and generated lockfile. No GitHub repository has been created or modified by this archive generation.
3. Open **Settings > Pages** and choose **GitHub Actions** as the build/deploy source.
4. In **Settings > Secrets and variables > Actions > Variables**, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public frontend config values, not database service credentials.
5. Push to `main` or run the `Deploy OBS TALLY PRO to GitHub Pages` workflow manually.
6. Verify the browser URL `https://YOUR_GITHUB_USERNAME.github.io/obs-tally-pro/#/login`.
7. Open the mobile link or scan pairing QR from the published website.

`vite.config.ts` defaults to a base of `/obs-tally-pro/`, with `HashRouter` so URL refreshes work on GitHub Pages. If you rename the repository, update the Vite base and deployment workflow. GitHub Pages serves only compiled HTML, CSS and JavaScript. It does **not** run the Node bridge.

## 9. OBS Studio Browser Dock

In OBS Studio choose **Docks > Custom Browser Docks**, create `Tally Pro`, and paste your GitHub Pages `/#/dock` URL. Sign in using your authorized director account in the dock's browser context if requested. The dock currently monitors the first accessible production in the account. Change production through the main dashboard when needed. The dock is intentionally read-only to avoid accidental live scene cuts.

OBS browser docks have separate cookie/auth storage from your regular browser, so a dock may need its own login. If your installed OBS version has browser authentication restrictions, use a separate browser window or install a compatible OBS browser dock feature.

## 10. Test real camera switching

1. Enable OBS Studio Mode.
2. Select `CAM 01` or its mapped source as Program. Its phone, dashboard and dock should display red PROGRAM / ON AIR.
3. Select `CAM 02` as Preview. Its phone should display green PREVIEW / STANDBY.
4. Transition Camera 2 to Program. Camera 2 turns red and Camera 1 becomes Preview, Idle or remains Program depending on its actual OBS composition.
5. Disable Studio Mode. Preview must become unavailable, not a fabricated Preview camera.
6. Close OBS. The bridge publishes OFFLINE. A dead bridge or network interruption expires after the freshness timeout (30 seconds by default).
7. Test on Wi-Fi and mobile data using separate camera devices, with browser tabs in the foreground.
8. Revoke the Camera 2 device and verify it cannot retrieve a camera snapshot or join the new private channel.

See `docs/VALIDATION.md` for more comprehensive failure and RLS acceptance tests.

## Security

- Only authorized production admins/directors can create cameras/mappings or generate pairing credentials.
- The UI requires Supabase Auth and production membership; protected Postgres rows additionally have RLS.
- Device pairing codes are 192-bit random and single-use, with a five-minute expiry and SHA-256 verifiers in PostgreSQL.
- Bridge tokens are 256-bit random and have SHA-256 verifiers stored server-side; new registration revokes the previous bridge.
- All cloud tally writes go through the trusted Edge Function and restricted SQL RPC. Browser clients have **no** insert/update policy on `tally_states` and no Realtime Broadcast send policy.
- Each phone reads one camera and subscribes to a channel bound to that camera's changing secret nonce. Revoke rotates the nonce, preventing further broadcasts on previously authorized channels.
- The database refuses out-of-order and replayed bridge snapshots using a monotonic sequence counter.
- Stale state freshness, client socket failure and disconnected OBS override last-known red/green states. Free-tier internet reliability, background throttling and OS sleep constraints still apply.
- Public project metadata and camera IDs are not secrets. Never put private tokens in logs, QR codes beyond their short-lived single-use pairing code, or GitHub commit history.

## Free-tier and operational limitations

- GitHub Pages is free for suitable repositories but may have availability, size, traffic and acceptable-use restrictions.
- Supabase Free has quotas, possible inactivity pausing and limited realtime resources. Check your current plan dashboard and avoid assuming guaranteed uptime.
- Bridge connectivity depends on a running OBS PC and an internet connection. This cloud edition is not designed for offline LAN-only productions.
- End-to-end latency below 250ms is a goal under favorable conditions, not a guarantee. There is no live latency measurement dashboard in this edition.
- Camera status checks poll **health** every 15 seconds but normal tally changes arrive over event-driven private Broadcast.
- Browsers on iOS can restrict fullscreen, vibration, sound autoplay, background execution and wake lock. Tally screens should remain visible for best reliability.
- Direct OBS scene-switching controls, a GUI system tray, automated production preset application and full on-device push notifications are not included. The core system is read-only against OBS, which reduces the chance of live switching errors.

## Useful documentation

- OBS WebSocket protocol https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- Supabase Realtime authorization https://supabase.com/docs/guides/realtime/authorization
- Supabase database broadcasts https://supabase.com/docs/guides/realtime/broadcast
- Supabase Edge Function authentication https://supabase.com/docs/guides/functions/auth-headers
- GitHub Pages workflows https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## License

MIT. See `LICENSE`.
