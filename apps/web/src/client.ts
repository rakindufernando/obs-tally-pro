import {createClient} from '@supabase/supabase-js';
export const configured=Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
export const supabase=createClient(
 import.meta.env.VITE_SUPABASE_URL || 'https://unconfigured.invalid',
 import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'not-configured',
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);
export type CameraRow={id:string;production_id:string;number:number;name:string;cameraman:string;enabled:boolean;channel_nonce:string;
 tally_states:{state:'PROGRAM'|'PREVIEW'|'IDLE'|'OFFLINE';version:number;updated_at:string}|null;
 camera_mappings:{id:string;kind:'SCENE'|'SOURCE';obs_name:string;obs_uuid:string|null;excluded:boolean}[];
 camera_devices:{id:string;revoked_at:string|null;device_name:string;user_id:string;last_seen_at:string|null}[]};
export type Production={id:string;name:string;obs_connected:boolean;studio_mode:boolean;streaming:boolean;recording:boolean;
 program_scene:string|null;preview_scene:string|null;last_bridge_at:string|null;last_sequence:number;created_at:string;
 obs_sources?:{kind:'SCENE'|'SOURCE';name:string;uuid:string|null}[];obs_stats_at?:string|null;
 obs_stats?:{cpu_pct?:number;fps?:number;memory_mb?:number;disk_gb?:number;render_ms?:number;
 render_skipped?:number;render_total?:number;output_skipped?:number;output_total?:number;
 stream?:{active:boolean;duration_ms:number;bytes:number;bitrate_kbps?:number;congestion:number;skipped_frames:number;total_frames:number};
 record?:{active:boolean;paused:boolean;duration_ms:number;bytes:number}}};
export type CameraSnapshot={camera_id:string;name:string;number:number;enabled:boolean;channel_nonce:string;state:string;version:number;
 state_at:string;last_bridge_at:string|null;obs_connected:boolean;studio_mode:boolean;streaming:boolean;recording:boolean;production_name:string};
export function unwrap<T>(result:{data:T|null;error:{message:string}|null},fallback='Operation failed'):T {
 if(result.error)throw new Error(result.error.message||fallback);if(result.data===null)throw new Error(fallback);return result.data;
}
