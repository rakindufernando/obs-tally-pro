// Read-only security, responsiveness and route audit against deployed GitHub Pages.
// Does not log in, pair cameras, send messages, alter production, or simulate video.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const base=process.env.PUBLIC_SITE_URL || 'https://rakindufernando.github.io/obs-tally-pro/';
const layouts=[
 {name:'small-phone',width:320,height:700},
 {name:'phone',width:390,height:844},
 {name:'tablet',width:820,height:1180},
 {name:'desktop',width:1440,height:900},
 {name:'wide',width:1920,height:1080}
];
const routes=[
 {path:'login',heading:'Production starts here.',selector:'input[type="password"]'},
 {path:'director/login',heading:'Director Control Panel',selector:'input[type="password"]'},
 {path:'director',heading:'Director Control Panel',selector:'input[type="password"]'},
 {path:'pair',heading:'Pair your camera.',selector:'button:has-text("Pair this phone")'},
 {path:'dashboard',heading:'Production starts here.',redirect:'login'},
 {path:'dock',heading:'Production starts here.',redirect:'login'},
 {path:'nonexistent-production-route',heading:'Production starts here.',redirect:'login'}
];
const report={site:base,started_at:new Date().toISOString(),checks:[],passed:0,failed:0,failures:[],coverage_limits:[
 'No director or cameraman credentials used',
 'No actual OBS Bridge / WHEP publisher / camera feed available to this browser test',
 'No device-specific installation or network switching tested'
]};
const record=(name,ok,detail={})=>{
 report.checks.push({name,ok,...detail});
 if(ok){report.passed++;console.log('PASS '+name);}
 else{report.failed++;report.failures.push(name+' '+(detail.error||''));console.error('FAIL '+name+' '+(detail.error||''));}
};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
try{
 for(const layout of layouts){
  for(const route of routes){
   const label=layout.name+' /#/'+route.path;
   const context=await browser.newContext({viewport:{width:layout.width,height:layout.height},serviceWorkers:'block',hasTouch:layout.width<=820,isMobile:layout.width<=390});
   const page=await context.newPage();
   const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(e.message));
   try{
    const target=new URL('#/'+route.path,base).href;
    const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response?.ok(),'Page HTTP '+String(response?.status()));
    await page.getByRole('heading',{name:route.heading}).first().waitFor({timeout:20000});
    await page.locator(route.selector||'body').first().waitFor({timeout:10000});
    if(route.redirect)assert.ok(page.url().includes('#/'+route.redirect),'Missing expected guest redirect to /'+route.redirect);
    assert.equal(pageErrors.length,0,'Uncaught JS '+pageErrors.join('; '));
    const state=await page.evaluate(()=>({
      w:window.innerWidth,scroll:document.documentElement.scrollWidth,
      images:Array.from(document.images).filter(im=>!im.complete||im.naturalWidth===0).map(im=>im.getAttribute('src')),
      bodyText:document.body.innerText||'',
      title:document.title,
      hasViewport:!!document.querySelector('meta[name="viewport"]'),
      password:Array.from(document.querySelectorAll('input')).some(x=>x.type==='password')
    }));
    assert.ok(state.scroll <= state.w+2,'Horizontal scroll '+state.scroll+' on viewport '+state.w);
    assert.equal(state.images.length,0,'Broken images '+state.images.join(','));
    assert.ok(state.hasViewport,'Missing viewport meta');
    assert.ok(state.title.toLowerCase().includes('tally'),'Unexpected page title '+state.title);
    assert.ok(!/\b(?:talkback|incoming voice call|start voice call|call cameraman)\b/i.test(state.bodyText),'Retired voice-calling UI visible');
    if(route.path==='pair'){
      const pairing=page.getByRole('button',{name:/Pair this phone/i});
      assert.ok(await pairing.isDisabled(),'Empty-code pairing can unexpectedly submit');
    }
    if(route.path==='login'||route.path.startsWith('director')){
      assert.ok(state.password,'Password field missing');
      const field=page.locator('input[type="password"]').first();
      assert.equal(await field.getAttribute('autocomplete'),'current-password','Password autocomplete incorrect');
    }
    record(label,true,{http_status:response.status(),viewport:state.w,scroll_width:state.scroll});
   }catch(e){
    record(label,false,{error:String(e).slice(0,450)});
    try{await page.screenshot({path:'deep-audit-'+layout.name+'-'+route.path.replaceAll('/','-')+'.png',fullPage:true});}catch{}
   }finally{await context.close();}
  }
 }
 // Additional protected route attempts and public static/PWA health.
 const ctx=await browser.newContext({serviceWorkers:'block'});
 const page=await ctx.newPage();
 try{
  const res=await page.goto(new URL('#/tally/00000000-0000-0000-0000-000000000000',base).href,
    {waitUntil:'domcontentloaded',timeout:30000});
  assert.ok(res?.ok(),'Tally route HTTP not OK');
  await page.waitForTimeout(2000);
  const body=await page.locator('body').innerText();
  assert.ok(body.length>30,'Blank tallies for unauthenticated camera request');
  assert.ok(!/ON AIR\s+LIVE VIDEO/i.test(body),'Unauthenticated tally falsely claims live video');
  record('Unpaired tally route fails closed',true);
 }catch(e){record('Unpaired tally route fails closed',false,{error:String(e).slice(0,450)});}
 try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  const assets=await page.evaluate(()=>({
   scripts:Array.from(document.scripts).map(s=>s.src).filter(Boolean),
   stylesheet:Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(a=>a.href),
   manifest:document.querySelector('link[rel="manifest"]')?.href||''
  }));
  assert.ok(assets.scripts.length>0,'Missing production JS bundle');
  assert.ok(assets.stylesheet.length>0,'Missing production styles');
  assert.ok(assets.manifest,'Missing PWA manifest');
  for(const [kind,urls] of [['script',assets.scripts],['css',assets.stylesheet],['manifest',[assets.manifest]]]){
   for(const url of urls){
    assert.ok(url.startsWith('https://'),'Non-HTTPS '+kind+' '+url);
    const res=await ctx.request.get(url,{timeout:30000});
    assert.ok(res.ok(),kind+' '+res.status()+' '+url);
    if(kind==='manifest'){
     const parsed=await res.json();
     assert.ok(parsed.name?.includes('OBS TALLY'),'Wrong PWA app identity');
     assert.ok(parsed.icons?.length>=2,'PWA icons are missing');
    }
   }
  }
  record('Public JS, CSS, PWA manifest reachable over HTTPS',true,{asset_count:assets.scripts.length+assets.stylesheet.length+1});
 }catch(e){record('Public JS, CSS, PWA manifest reachable over HTTPS',false,{error:String(e).slice(0,450)});}
 await ctx.close();
}finally{await browser.close();}
report.finished_at=new Date().toISOString();
fs.writeFileSync('deep-audit-results.json',JSON.stringify(report,null,2));
console.log('RESULT '+report.passed+'/'+(report.passed+report.failed)+' passed, '+report.failed+' failures');
if(report.failed)process.exitCode=1;
