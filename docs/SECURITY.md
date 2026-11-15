# Security and threat boundaries

- **Threat** a cameraman scans another camera's QR link. Pairing code is an opaque 192-bit credential, expires in five minutes and is single-use. Protect QR codes and rotate immediately if exposed.
- **Threat** a camera ID guess. Camera IDs are not authorization. Both `camera_snapshot` RPC and private Realtime channel `SELECT` policy enforce Auth user/device permission.
- **Threat** a revoked connected phone stays on an already authorized Realtime channel. Revocation rotates `channel_nonce` and future updates are published only to a new topic. The old phone cannot obtain fresh snapshots. Realtime's cached join authorization alone is not sufficient for instant revocation.
- **Threat** forged LIVE updates from a browser. No authenticated client role has `UPDATE` on `tally_states` or `INSERT` broadcast permission. Trusted Edge Function holds server-only credentials and calls verified bridge token/sequence SQL RPC.
- **Threat** replayed bridge snapshots. SQL rejects any sequence not strictly greater than its previously accepted value, with `SELECT ... FOR UPDATE` transaction-level serialization. The bridge saves its next sequence to disk before sending.
- **Threat** expired heartbeat. Mobile and dashboard compare server-supplied `last_bridge_at` to current clock, and handle channel disconnect. They never trust a cached red/green status during an unavailable connection.
- **Threat** leaking OBS password. The OBS password stays only in the local bridge `.env`, never inside the GitHub Pages assets or Supabase messages. OBS WebSocket remains bound to localhost.
- **Threat** Supabase project pausing. The phone must display a warning after Realtime loses the channel and freshness times out. Supabase Free tier is not a guaranteed broadcast service. Use redundancy/testing for high-stakes live coverage.
- **Threat** privileged setup credentials committed accidentally. `.gitignore` excludes `.env` and bridge credential JSON. GitHub Actions only gets public project URL/publishable key; production secrets are provisioned by the Supabase platform.

Remaining hardening work includes gateway-layer request rate limits, auditing auth sign-ins and rate-limiting initial bridge registration attempts, production-scoped operator invitation management and device session expiry/rotation beyond simple revocation.
