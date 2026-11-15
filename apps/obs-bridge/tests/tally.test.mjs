import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateTally,sceneContains,freshness} from '../../../packages/shared/dist/index.js';
const snap={connected:true,studioMode:true,program:'MAIN',preview:'CAM 2',sceneUuids:{},streaming:false,recording:false,
 scenes:{MAIN:[{name:'SCREEN',enabled:true,kind:'scene',children:[{name:'Capture 1',enabled:true,kind:'source'}]}],
 'CAM 2':[{name:'Capture 2',enabled:true,kind:'source'}]}};
const camera=(id,kind,name)=>({id,number:1,name:id,enabled:true,mappings:[{kind,name}]});
test('nested source becomes PROGRAM',()=>assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),snap),'PROGRAM'));
test('preview source becomes PREVIEW',()=>assert.equal(calculateTally(camera('2','SOURCE','Capture 2'),snap),'PREVIEW'));
test('idle source remains IDLE',()=>assert.equal(calculateTally(camera('3','SOURCE','Other'),snap),'IDLE'));
test('PROGRAM wins when same camera also in PREVIEW',()=>{
 const mixed={...snap,scenes:{...snap.scenes,'CAM 2':[{name:'Capture 1',enabled:true,kind:'source'}]}};
 assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),mixed),'PROGRAM');
});
test('disconnected OBS overrides all camera states',()=>assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),{...snap,connected:false}),'OFFLINE'));
test('disabled nested item contributes no tally',()=>{
 const s={...snap,scenes:{...snap.scenes,MAIN:[{name:'SCREEN',enabled:false,kind:'scene',children:[{name:'Capture 1',enabled:true,kind:'source'}]}]}};
 assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),s),'IDLE');
});
test('preview ignored when studio mode is off',()=>assert.equal(calculateTally(camera('2','SOURCE','Capture 2'),{...snap,studioMode:false}),'IDLE'));
test('scene mapping returns PROGRAM',()=>assert.equal(calculateTally(camera('1','SCENE','MAIN'),snap),'PROGRAM'));
test('exclusion overrides included source',()=>{
 const c=camera('1','SOURCE','Capture 1');c.mappings.push({kind:'SOURCE',name:'Capture 1',excluded:true});
 assert.equal(calculateTally(c,snap),'IDLE');
});
test('freshness rejects untrusted signal',()=>{
 const now=Date.now();assert.equal(freshness(new Date(now-20_000).toISOString(),true,now),true);
 assert.equal(freshness(new Date(now-31_000).toISOString(),true,now),false);
 assert.equal(freshness(new Date(now).toISOString(),false,now),false);
});
test('multiple sources in same program are both PROGRAM',()=>{
 const dual={...snap,scenes:{...snap.scenes,MAIN:[...snap.scenes.MAIN,{name:'Capture 3',enabled:true,kind:'source'}]}};
 assert.equal(calculateTally(camera('3','SOURCE','Capture 3'),dual),'PROGRAM');
 assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),dual),'PROGRAM');
});
test('disabled camera is always IDLE when OBS online',()=>{
 const c=camera('1','SOURCE','Capture 1');c.enabled=false;
 assert.equal(calculateTally(c,snap),'IDLE');
});
test('old program camera is retained through active transition',()=>{
 const transitioning={...snap,program:'CAM 2',preview:'MAIN',transitionFrom:'MAIN'};
 assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),transitioning),'PROGRAM');
 assert.equal(calculateTally(camera('2','SOURCE','Capture 2'),transitioning),'PROGRAM');
 assert.equal(calculateTally(camera('1','SOURCE','Capture 1'),{...transitioning,transitionFrom:null}),'PREVIEW');
});
test('root scene exclusion overrides an include mapping',()=>{
 const c=camera('4','SCENE','MAIN');c.mappings.push({kind:'SCENE',name:'MAIN',excluded:true});
 assert.equal(calculateTally(c,snap),'IDLE');
});
test('group nested source is visible by metadata',()=>{
 const grouped={...snap,scenes:{...snap.scenes,MAIN:[{name:'Group 1',enabled:true,kind:'group',children:[{name:'Capture 4',enabled:true,kind:'source'}]}]}};
 assert.equal(calculateTally(camera('4','SOURCE','Capture 4'),grouped),'PROGRAM');
});
test('unknown scene is never presumed LIVE',()=>{
 assert.equal(sceneContains('MISSING',snap,[{kind:'SCENE',name:'CAM 01'}]),false);
});
test('scene UUID mapping is stable across rename',()=>{
 const renamed={...snap,sceneUuids:{MAIN:'scene-uuid-1'}};
 assert.equal(calculateTally({id:'1',enabled:true,name:'Camera',number:1,mappings:[{kind:'SCENE',name:'OLD NAME',uuid:'scene-uuid-1'}]},renamed),'PROGRAM');
});
test('nested source UUID works after source rename',()=>{
 const tree={...snap,scenes:{...snap.scenes,MAIN:[{name:'New HDMI Name',uuid:'source-uuid',enabled:true,kind:'source'}]}};
 assert.equal(calculateTally({id:'1',enabled:true,name:'Camera',number:1,mappings:[{kind:'SOURCE',name:'OLD HDMI Name',uuid:'source-uuid'}]},tree),'PROGRAM');
});
test('freshness rejects timestamps too far in future',()=>{
 const now=Date.now();assert.equal(freshness(new Date(now+40_000).toISOString(),true,now),false);
});
test('recursion terminates for cyclic source nesting',()=>{
 const cyclic={...snap,scenes:{MAIN:[{name:'MAIN',kind:'scene',enabled:true}]}};
 assert.equal(calculateTally(camera('1','SOURCE','Not Present'),cyclic),'IDLE');
});
