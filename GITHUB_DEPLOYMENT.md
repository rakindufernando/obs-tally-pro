# GitHub Pages deployment for OBS TALLY PRO

## Repository

Create a new public **empty** repository called `obs-tally-pro` under `rakindufernando`. Do not modify the portfolio or other repositories. Once the repository exists, the connected GitHub integration can upload the prepared source to its `main` branch.

## GitHub Pages

After the first source commit, open GitHub `Settings > Pages`, select `GitHub Actions` in `Build and deployment`. Push or manually dispatch the `Deploy OBS TALLY PRO to GitHub Pages` workflow. The website is expected at `https://rakindufernando.github.io/obs-tally-pro/#/` after the workflow succeeds. This is not a live URL until confirmed by the GitHub Actions deployment.

## Cloud configuration

The repository deployment workflow contains the **public**, browser-safe Supabase URL and publishable key. Never add your Supabase service secret, OBS password or bridge bearer token to GitHub. These must remain private. Changes to Supabase credentials require a deliberate workflow update/rebuild.

## Existing production

The previously deployed Supabase project is `lvzrhzlcyajhhgfqgdar` in Singapore. The `bridge` Edge Function and PostgreSQL tables already exist. Do not rerun `supabase db push` or deploy the bundled function just to host the website. This GitHub Pages workflow deploys only compiled `apps/web/dist`.

## Verification

1. Confirm the GitHub Actions `validate` job passes tests and TypeScript.
2. Confirm the `deploy` job succeeds, and check its Pages URL.
3. Open `https://rakindufernando.github.io/obs-tally-pro/#/login` and log in.
4. In the director dashboard, verify `Main Live Production` and Camera 1 appear.
5. Open the dock using `https://rakindufernando.github.io/obs-tally-pro/#/dock`.
6. In Supabase Auth, allow anonymous logins for camera pairing; ensure private-only Realtime configuration.
7. Pair the cameraman's phone via the director dashboard QR code and verify camera-scoped private Realtime updates.

The OBS Bridge process must continue running on the local streaming computer. GitHub Pages provides only the frontend.
