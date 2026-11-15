// Supabase Edge Function. Public ingress is protected by one-time registration
// codes or a high-entropy per-bridge bearer secret, never a client API key.
import { createClient } from 'npm:@supabase/supabase-js@2';

const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const fail = (message: string, status = 400) => respond({ error: message }, status);
const hex = (data: Uint8Array) => Array.from(data).map(x => x.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
function secretKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const selected = keys.default;
  if (typeof selected === 'string' && selected.length) return selected;
  throw new Error('Edge Function service key not configured');
}
function safeString(value: unknown, len = 250) {
  return typeof value === 'string' ? value.slice(0, len) : null;
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('POST required', 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const body = await req.json();
    const action = body?.action;
    if (action === 'register') {
      const code = safeString(body.code, 100);
      if (!code || !/^[0-9a-f]{48}$/.test(code)) return fail('Invalid registration code', 401);
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      const { data, error } = await admin.rpc('register_bridge', { code, p_token_hash: await hash(token) });
      if (error) return fail('Registration was rejected or the code expired', 401);
      return respond({ ...data, token }); // Delivered once. Do not store in GitHub or cloud logs.
    }
    const auth = req.headers.get('authorization') || '';
    const match = /^Bearer ([0-9a-f]{64})$/.exec(auth);
    if (!match) return fail('A registered bridge bearer token is required', 401);
    const p_token_hash = await hash(match[1]);
    if (action === 'config') {
      const { data, error } = await admin.rpc('bridge_configuration', { p_token_hash });
      return error ? fail('Unauthorized bridge', 401) : respond(data);
    }
    if (action === 'heartbeat') {
      const { error } = await admin.rpc('bridge_heartbeat', { p_token_hash });
      return error ? fail('Unauthorized bridge', 401) : respond({ ok: true, server_time: new Date().toISOString() });
    }
    if (action === 'publish') {
      if (!Number.isSafeInteger(body.sequence) || body.sequence <= 0 || typeof body.obs_connected !== 'boolean'
        || !Array.isArray(body.states) || body.states.length > 512
        || !body.states.every((s: unknown) => typeof s === 'object' && s !== null
          && typeof (s as Record<string, unknown>).camera_id === 'string'
          && ['PROGRAM','PREVIEW','IDLE','OFFLINE'].includes((s as Record<string, unknown>).state as string))) {
        return fail('Invalid authoritative snapshot');
      }
      const { data, error } = await admin.rpc('apply_bridge_snapshot', {
        p_token_hash, p_sequence: body.sequence, p_obs_connected: body.obs_connected,
        p_studio_mode: Boolean(body.studio_mode), p_program_scene: safeString(body.program_scene),
        p_preview_scene: safeString(body.preview_scene), p_streaming: Boolean(body.streaming),
        p_recording: Boolean(body.recording), p_states: body.states,
      });
      if (error) {
        if (/Replay|out-of-order/i.test(error.message)) return fail('Rejected stale sequence', 409);
        return fail('Snapshot rejected by database validation', 403);
      }
      return respond({ ok: true, sequence: data });
    }
    return fail('Unknown bridge action', 404);
  } catch (err) {
    // Credentials and payload are intentionally excluded from logs and errors.
    console.error('bridge request failed', err instanceof Error ? err.name : 'unknown');
    return fail('Bridge request could not be processed', 500);
  }
});
