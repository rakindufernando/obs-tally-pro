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
    if (action === 'telemetry') {
      const { data: identity, error: authErr } = await admin.rpc('bridge_configuration', { p_token_hash });
      if (authErr || !identity || typeof identity.production_id !== 'string') return fail('Unauthorized bridge', 401);
      const t = body?.telemetry;
      if (!t || typeof t !== 'object' || Array.isArray(t) || JSON.stringify(t).length > 55000) return fail('Invalid telemetry', 400);
      const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(v,1e14)):0;
      const sourceRows=Array.isArray(t.sources)?t.sources:[];
      const sources=sourceRows.slice(0,350).filter((s:unknown)=>s&&typeof s==='object'&&!Array.isArray(s)&&
        ['SCENE','SOURCE'].includes((s as Record<string,unknown>).kind as string)&&
        typeof (s as Record<string,unknown>).name==='string'&&
        ((s as Record<string,unknown>).name as string).length<=150).map((s:Record<string,unknown>)=>({
          kind:s.kind,name:s.name,uuid:typeof s.uuid==='string'&&s.uuid.length<128?s.uuid:null
        }));
      const st=t.stats && typeof t.stats==='object' ? t.stats as Record<string,unknown> : {};
      const stream=t.stream && typeof t.stream==='object' ? t.stream as Record<string,unknown> : {};
      const record=t.record && typeof t.record==='object' ? t.record as Record<string,unknown> : {};
      const stats={
        cpu_pct:num(st.cpu_pct),fps:num(st.fps),memory_mb:num(st.memory_mb),disk_gb:num(st.disk_gb),
        render_ms:num(st.render_ms),render_skipped:num(st.render_skipped),render_total:num(st.render_total),
        output_skipped:num(st.output_skipped),output_total:num(st.output_total),
        stream:{active:stream.active===true,duration_ms:num(stream.duration_ms),bytes:num(stream.bytes),bitrate_kbps:num(stream.bitrate_kbps),
          congestion:num(stream.congestion),skipped_frames:num(stream.skipped_frames),total_frames:num(stream.total_frames)},
        record:{active:record.active===true,paused:record.paused===true,duration_ms:num(record.duration_ms),bytes:num(record.bytes)},
        studio_mode:t.studio_mode===true,program_scene:safeString(t.program_scene,150),
        preview_scene:safeString(t.preview_scene,150),obs_connected:t.obs_connected===true
      };
      const { error } = await admin.from('productions').update({
        obs_sources:sources,obs_stats:stats,obs_stats_at:new Date().toISOString()
      }).eq('id',identity.production_id);
      if (error) return fail('Telemetry unavailable', 500);
      return respond({ok:true});
    }
    if (action === 'preview') {
      const {data:identity,error:authError}=await admin.rpc('bridge_configuration',{p_token_hash});
      if(authError||typeof identity?.production_id!=='string')return fail('Unauthorized bridge',401);
      const cid=safeString(body.camera_id,64);
      const jpeg=safeString(body.image_base64,205000);
      if(!cid||!jpeg||!/^[a-zA-Z0-9+/]+={0,2}$/.test(jpeg)||jpeg.length>200000)return fail('Invalid JPEG preview',400);
      const assigned=(identity.cameras||[]).some((c:{id:string})=>c.id===cid);
      if(!assigned)return fail('Camera does not belong to this bridge',403);
      const bytes=Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0));
      if(bytes.length>150000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return fail('Invalid JPEG image',400);
      const path=identity.production_id+'/'+cid+'.jpg';
      const saved=await admin.storage.from('tally-private-previews').upload(path,bytes,{upsert:true,contentType:'image/jpeg',cacheControl:'5'});
      if(saved.error)return fail('Private preview storage error',503);
      const meta=await admin.from('camera_preview_assets').upsert({camera_id:cid,production_id:identity.production_id,updated_at:new Date().toISOString(),size_bytes:bytes.length},{onConflict:'camera_id'});
      return meta.error?fail('Preview metadata error',503):respond({ok:true});
    }
    if(action==='commands'){
      const {data:identity,error:authError}=await admin.rpc('bridge_configuration',{p_token_hash});
      if(authError||typeof identity?.production_id!=='string')return fail('Unauthorized bridge',401);
      const {data:pending,error}=await admin.from('obs_scene_commands').select('id,scene_name,created_at')
       .eq('production_id',identity.production_id).eq('status','pending').gte('created_at',new Date(Date.now()-30000).toISOString()).order('created_at').limit(3);
      if(error)return fail('Scene command sync error',503);
      const commands=[];
      for(const row of pending||[]){
        const updated=await admin.from('obs_scene_commands').update({status:'delivered'}).eq('id',row.id).eq('status','pending').select('id,scene_name').maybeSingle();
        if(updated.data)commands.push(updated.data);
      }
      return respond({commands});
    }
    if(action==='command-result'){
      const {data:identity,error:authError}=await admin.rpc('bridge_configuration',{p_token_hash});
      if(authError||typeof identity?.production_id!=='string')return fail('Unauthorized bridge',401);
      const id=safeString(body.id,64);
      if(!id||!/^[0-9a-f-]{36}$/.test(id))return fail('Invalid command',400);
      const result=await admin.from('obs_scene_commands').update({status:body.success===true?'completed':'failed',
       result_message:safeString(body.message,200)||'',processed_at:new Date().toISOString()})
       .eq('id',id).eq('production_id',identity.production_id).eq('status','delivered');
      return result.error?fail('Command result unavailable',503):respond({ok:true});
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
