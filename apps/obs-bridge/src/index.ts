import 'dotenv/config';
import {CloudBridge} from './cloud.js';
import {OBSConnector} from './obs.js';
const cloudUrl=process.env.SUPABASE_URL;
if(!cloudUrl||!/^https:\/\//.test(cloudUrl))throw new Error('Set HTTPS SUPABASE_URL in the bridge environment');
const cloud=new CloudBridge(cloudUrl);
await cloud.initialize();
const obs=new OBSConnector(process.env.OBS_URL||'ws://127.0.0.1:4455',process.env.OBS_PASSWORD||'',s=>cloud.publish(s));
obs.start();
// Config refresh also triggers a new authoritative snapshot if camera mappings change.
setInterval(async()=>{try{await cloud.refreshConfig();}catch(e){console.error('Bridge config sync',e instanceof Error?e.message:e);}},15000);
setInterval(async()=>{await cloud.heartbeat();},10000);
console.log(`OBS TALLY PRO bridge started. Cameras ${cloud.getCameraCount()}. No inbound ports opened.`);
process.once('SIGINT',()=>{obs.stop();process.exit(0);});
process.once('SIGTERM',()=>{obs.stop();process.exit(0);});
