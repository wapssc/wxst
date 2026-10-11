import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mediaDir = await mkdtemp(join(tmpdir(), 'libretv-media-'));
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','40','-c:v','libx264','-preset','ultrafast','-g','50','-c:a','aac','-f','hls','-hls_time','2','-hls_list_size','0',join(mediaDir,'index.m3u8')]);
const base = process.env.LIBRETV_BASE_URL || 'http://127.0.0.1:8080';
const hash = createHash('sha256').update(process.env.LIBRETV_TEST_PASSWORD || 'browser-test-only').digest('hex');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
async function scenario({mobile=false, series=false, history=false, ambiguous=false, failure=false, unmapped=false, adult=false, historyEntry=false, manualSwitch=false, allfail=false}) {
 const context=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,userAgent:mobile?'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36':undefined});
 const title=ambiguous?'同名测试':series?'体验测试剧集':'体验测试电影';
 await context.addInitScript(({hash,history,title,series,unmapped,allfail})=>{
  localStorage.setItem('passwordVerified',JSON.stringify({verified:true,timestamp:Date.now(),passwordHash:hash}));
  localStorage.setItem('proxyAuthHash',hash);localStorage.setItem('hasSeenDisclaimer','true');localStorage.setItem('firstRunGuideSeen','true');localStorage.setItem('doubanEnabled','false');
  localStorage.setItem('selectedAPIs',JSON.stringify(allfail?['ysgc','jszy','wujin','maoyan']:['ysgc','jszy']));localStorage.setItem('hasInitializedDefaults','true');localStorage.setItem('defaultApiMigrationVersion','20260511-sources-v2');
  if(history && !localStorage.getItem('viewingHistory'))localStorage.setItem('viewingHistory',JSON.stringify([{title,movieYear:'2026',movieKind:series?'tv':'movie',sourceName:'jszy',vod_id:unmapped?'retired':series?'series1':'movie1',episodeIndex:1,episodeName:unmapped?'':'第02集',playbackPosition:15,timestamp:Date.now()}]));
 },{hash,history,title,series,unmapped,allfail});
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let searches=0, details=0;
 await page.route('**/test-media/**',async route=>{
  const filename=new URL(route.request().url()).pathname.split('/').at(-1);
  if(filename==='broken.m3u8')return route.fulfill({status:404,body:'missing'});
  const body=await readFile(join(mediaDir,filename));
  return route.fulfill({status:200,contentType:filename.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t',body});
 });
 await page.route('**/proxy/**',async route=>{
  const u=new URL(route.request().url());const target=new URL(decodeURIComponent(u.pathname.slice('/proxy/'.length)));
  const source=target.hostname.includes('jszy')?'jszy':'ysgc';
  if(!target.searchParams.has('ac'))return route.fulfill({status:200,contentType:'application/json',body:'{"subjects":[],"list":[]}'});
  if(target.searchParams.has('wd'))searches++;
  const item=(id,year='2026')=>({vod_id:id,vod_name:title,vod_year:year,type_name:series?'国产剧':'剧情片',vod_content:'用于真实解码验收的视频',vod_play_from:'hls',vod_play_url:series?`第01集$${base}/test-media/index.m3u8?ep=1#第02集$${base}/test-media/index.m3u8?ep=2`:`正片$${base}/test-media/${allfail||(failure&&source==='ysgc')?'broken':'index'}.m3u8`});
  let list=ambiguous?[item('amb-old','1998'),item('amb-new','2026')]:[item(series?'series1':'movie1')];
  const id=target.searchParams.get('ids');if(id)details++;if(id)list=list.filter(x=>String(x.vod_id)===id);
  if(source==='jszy'&&!history)await new Promise(r=>setTimeout(r,100));
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:1,list})});
 });
 await page.goto(base,{waitUntil:'load'});
 await page.evaluate(({title,series,ambiguous,adult})=>{
   doubanMovieTvCurrentSwitch=series?'tv':'movie';
   const c=document.createElement('div');c.id='testCards';document.body.prepend(c);
   if(adult) renderAdultCards([{vod_name:title,vod_year:'2026',type_name:'剧情片',vod_id:'movie1',source_code:'jszy'}],c);
   else renderDoubanCards({subjects:[{title,year:ambiguous?'':'2026',rate:'8',cover:'',url:'#'}]},c);
 },{title,series,ambiguous,adult});
 await page.locator('#testCards button[data-quick-entry]').click();
 await page.waitForURL('**/player.html?**');
 if(ambiguous){await page.getByText('找到不同版本，请确认要观看的作品').waitFor();assert.equal(await page.locator('#quickPlayChoices button').count(),2);await page.locator('#quickPlayChoices button').filter({hasText:'2026'}).click();}
 if(allfail){
  try { await page.waitForFunction(()=>document.getElementById('error').style.display==='flex',{},{timeout:70000}); }
  catch(error) { console.log('exhausted diagnostics',JSON.stringify({details,status:await page.locator('#quickPlayStatus').innerText(),errors}));throw error; }
  assert.equal(details,3,'initial source plus at most two alternate details');
  assert.equal(await page.locator('video').evaluate(v=>v.currentTime),0);
  console.log(JSON.stringify({allfail,details}));await context.close();return;
 }
 if(unmapped){await page.getByText('无法确认上次观看的集数，请选择要播放的一集').waitFor();await page.locator('#quickPlayChoices button').filter({hasText:'第02集'}).click();}
 try { await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentTime>2&&v.videoWidth>0&&v.getVideoPlaybackQuality().totalVideoFrames>0&&v.webkitAudioDecodedByteCount>0;},null,{timeout:35000}); }
 catch(e){console.log('FAIL status',await page.locator('#quickPlayStatus').innerText(),'errors',errors,'url',page.url().replace(/url=[^&]+/,'url=REDACTED'));throw e;}
 const media=await page.evaluate(()=>{const v=document.querySelector('video');return {time:v.currentTime,width:v.videoWidth,frames:v.getVideoPlaybackQuality().totalVideoFrames,audio:v.webkitAudioDecodedByteCount,muted:v.muted};});
 assert.ok(media.frames>0);assert.ok(media.audio>0);assert.ok(searches>0);
 if(history&&!unmapped){assert.ok(media.time>=15);assert.equal(new URL(page.url()).searchParams.get('source'),'jszy');}
 if(unmapped){assert.equal(new URL(page.url()).searchParams.get('index'),'1');assert.equal(new URL(page.url()).searchParams.has('position'),false);}
 if(adult)assert.equal(new URL(page.url()).searchParams.get('source'),'jszy');
 if(manualSwitch){
  await page.locator('#switchResourceBtn').click();
  await page.locator('.resource-switch-row[data-current="true"]').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.resource-switch-row').length>=2);
  assert.equal(await page.locator('.resource-switch-row img').count(),0);
  await page.waitForFunction(()=>document.querySelector('.resource-switch-grid')?.textContent.includes('延迟'));
  await page.screenshot({path:'/tmp/libretv-source-list-mobile.png'});
  await page.evaluate(()=>closeModal());
  await page.evaluate(()=>switchToResource('jszy','movie1'));await page.waitForURL(u=>u.searchParams.get('source')==='jszy');await page.waitForFunction(()=>document.querySelector('video')?.currentTime>1);
 }
 if(historyEntry){
  await page.evaluate(()=>saveToHistory());
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('viewingHistory'))[0]);
  await page.goto(base);
  await page.evaluate(h=>playFromHistory(h.url,h.title,h.episodeIndex,h.playbackPosition),saved);
  await page.waitForURL('**/player.html?**');
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>1);
  await page.evaluate(()=>saveToHistory());
  const replay=await page.evaluate(()=>JSON.parse(localStorage.getItem('viewingHistory'))[0]);
  assert.equal(replay.movieYear,'2026');assert.equal(replay.movieKind,'movie');assert.equal(replay.episodeName,'正片');
 }
 if(failure)assert.equal(new URL(page.url()).searchParams.get('source'),'jszy');
 if(series){assert.equal(await page.locator('#episodesGrid').isVisible(),false);await page.locator('#quickEpisodesButton').click();assert.equal(await page.locator('#episodesGrid').isVisible(),true);await page.locator('#episode-0').click();}
 else assert.equal(await page.locator('#quickEpisodesButton').count(),0);
 if(mobile){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const orientation=await page.evaluate(async()=>{
   let locked=0,unlocked=0;const original=Object.getOwnPropertyDescriptor(document,'fullscreenElement');
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>document.getElementById('player')});
   Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async mode=>{if(mode==='landscape')locked++;}});
   Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>unlocked++});
   const success=await maybeLockLandscapeOrientation();
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>null});syncFullscreenOrientation();
   Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('unsupported'))});
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>document.getElementById('player')});
   const rejected=await maybeLockLandscapeOrientation();
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>null});
   return {success,rejected,locked,unlocked};
  });assert.equal(orientation.success,true);assert.equal(orientation.rejected,false);assert.ok(orientation.unlocked>0);
 }
 if(await page.locator('#quickMoreActions').isVisible())await page.locator('#quickSettingsButton').click();
 await page.locator('#quickSettingsButton').click();
 assert.equal(await page.locator('#quickMoreActions').isVisible(),true);
 await page.getByRole('button',{name:'播放设置',exact:true}).click();
 assert.equal(await page.locator('#playbackOptions').isVisible(),true);
 await page.locator('#quickSettingsButton').click();
 const detailCountBeforePause=details;
 assert.equal(await page.evaluate(()=>{document.querySelector('video').pause();return QuickPlay.onError();}),false);
 await page.waitForTimeout(150);
 assert.equal(details,detailCountBeforePause,'no source retries after playback or pause');
 await page.locator('#quickSettingsButton').click();
 await page.getByRole('button',{name:'影片详情',exact:true}).click();await page.locator('#modal').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('modalContent').textContent.includes('真实解码验收'));
 assert.match(await page.locator('#modalContent').innerText(),/真实解码验收/);
 await page.screenshot({path:`/tmp/quick-play-${mobile?'mobile':'desktop'}-${series?'series':ambiguous?'ambiguous':failure?'fallback':'movie'}.png`});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({mobile,series,history,ambiguous,failure,media}));await context.close();
}
const cases = {
 movie: {mobile:true,manualSwitch:true,historyEntry:true},
 series: {series:true,history:true,mobile:true},
 ambiguous: {ambiguous:true},
 fallback: {failure:true},
 unmapped: {series:true,history:true,unmapped:true},
 adult: {adult:true},
 exhausted: {allfail:true}
};
try {
 for (const [name, options] of Object.entries(cases)) {
  if (!process.env.QUICK_PLAY_CASE || process.env.QUICK_PLAY_CASE === name) await scenario(options);
 }
} finally { await browser.close(); await rm(mediaDir,{recursive:true,force:true}); }
