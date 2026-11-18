// Public, read-only Playwright smoke tests for actual GitHub Pages deployment.
// No credentials, private data, fake camera feeds, or production database writes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.PUBLIC_SITE_URL||'https://rakindufernando.github.io/obs-tally-pro/';
const routes=[
 {path:'login',heading:'Production starts here.',selector:'input[type="email"]'},
 {path:'director/login',heading:'Director Control Panel',selector:'input[type="password"]'},
 {path:'director',heading:'Director Control Panel',selector:'input[type="password"]'},
 {path:'pair',heading:'Pair your camera.',selector:'button:has-text("Pair this phone")'},
 {path:'dashboard',heading:'Production starts here.',redirect:'login'},
 {path:'dock',heading:'Production starts here.',redirect:'login'}
];
const screens=[{label:'desktop',width:1440,height:900},{label:'mobile',width:390,height:844}];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
const failures=[];let checked=0;
try{
 for(const screen of screens){
  for(const route of routes){
   const context=await browser.newContext({viewport:{width:screen.width,height:screen.height},serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const target=new URL('#/'+route.path,base).href;
   try{
    const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response?.ok(),`HTTP ${response?.status()||'no response'}`);
    await page.getByRole('heading',{name:route.heading}).first().waitFor({timeout:20000});
    if(route.redirect)assert.ok(page.url().includes('#/'+route.redirect),`Expected guest redirect to ${route.redirect}`);
    if(route.selector)await page.locator(route.selector).first().waitFor({timeout:10000});
    assert.equal(errors.length,0,`Uncaught browser errors ${errors.join(' | ')}`);
    const sizing=await page.evaluate(()=>({
     viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
     brokenImages:Array.from(document.images).filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.getAttribute('src'))
    }));
    assert.ok(sizing.scrollWidth<=sizing.viewport+2,`Horizontal overflow ${sizing.scrollWidth} > ${sizing.viewport}`);
    assert.equal(sizing.brokenImages.length,0,`Broken images ${sizing.brokenImages.join(',')}`);
    checked++;
    console.log(`PASS ${screen.label} #/${route.path} HTTP ${response.status()} headings/assets/layout`);
   }catch(error){
    const reason=error instanceof Error?error.message:String(error);
    failures.push(`${screen.label} #/${route.path} ${reason}`);
    console.error(`FAIL ${screen.label} #/${route.path} ${reason}`);
    try{await page.screenshot({path:`smoke-${screen.label}-${route.path.replaceAll('/','-')}.png`,fullPage:true});}catch{}
   }finally{await context.close();}
  }
 }
}finally{await browser.close();}
console.log(`Website smoke tests ${checked}/${screens.length*routes.length} passed`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
