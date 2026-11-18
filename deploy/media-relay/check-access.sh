#!/usr/bin/env bash
# Security acceptance smoke test against the deployed Supabase media-auth function.
# No fixture tokens, secret keys, mock video, or production mutations are committed.
set -euo pipefail
: "${PRODUCTION_ID:?Set the existing production UUID}"
: "${CAMERA_ID:?Set one existing camera UUID}"
: "${DIRECTOR_JWT:?Set a temporary assigned director session JWT}"
: "${CAMERAMAN_JWT:?Set a temporary currently paired cameraman JWT}"
AUTH_URL="${AUTH_URL:-https://lvzrhzlcyajhhgfqgdar.supabase.co/functions/v1/media-auth}"
if ! [[ "$PRODUCTION_ID" =~ ^[0-9a-fA-F-]{36}$ && "$CAMERA_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'Invalid production/camera ID format' >&2
  exit 2
fi
post() {
  local action="$1" path="$2" token="$3"
  curl -sS --connect-timeout 8 --max-time 20 \
    -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    --data "$(printf '{"action":"%s","path":"%s","protocol":"webrtc","token":"%s"}' "$action" "$path" "$token")" "$AUTH_URL"
}
check() {
  local description="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $description expected HTTP $expected, got $actual"
    exit 1
  fi
  echo "PASS $description HTTP $actual"
}
check 'unauthenticated program read denied' 403 "$(post read "program-$PRODUCTION_ID" '')"
check 'unauthenticated camera read denied' 403 "$(post read "camera-$CAMERA_ID" '')"
check 'invalid publisher denied' 403 "$(post publish "program-$PRODUCTION_ID" 'invalid-publisher-secret')"
check 'director can read own production program' 200 "$(post read "program-$PRODUCTION_ID" "$DIRECTOR_JWT")"
check 'paired cameraman can read own program' 200 "$(post read "program-$PRODUCTION_ID" "$CAMERAMAN_JWT")"
check 'paired cameraman camera multiview denied' 403 "$(post read "camera-$CAMERA_ID" "$CAMERAMAN_JWT")"
# Director camera access must be configured via Director Settings and match the production.
check 'director-only camera video accepted' 200 "$(post read "camera-$CAMERA_ID" "$DIRECTOR_JWT")"
echo 'Supabase authorization smoke checks passed. This is NOT a video or cross-network playback test.'
