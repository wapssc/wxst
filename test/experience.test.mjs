import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
async function setup() {
  const values = new Map();
  const sandbox = {window:{},URL,URLSearchParams,console,Date,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))}};
  vm.runInNewContext(await readFile(new URL('../js/quick-play.js',import.meta.url),'utf8'),sandbox);
  vm.runInNewContext(await readFile(new URL('../js/experience.js',import.meta.url),'utf8'),sandbox);
  return sandbox.window.LibreExperience;
}
test('search grouping keeps remakes and uncertain identities apart', async () => {
  const {groupResults}=await setup();
  const input=[
    {vod_name:'潜伏',vod_year:'2009',type_name:'国产剧',source_code:'a',vod_id:1},
    {vod_name:'潜伏',vod_year:'2009',type_name:'国产剧',source_code:'b',vod_id:2},
    {vod_name:'潜伏',vod_year:'2026',type_name:'国产剧',source_code:'c',vod_id:3},
    {vod_name:'潜伏',vod_year:'',type_name:'国产剧',source_code:'d',vod_id:4},
    {vod_name:'潜伏',vod_year:'',type_name:'国产剧',source_code:'e',vod_id:5},
    {vod_name:'潜伏[电影解说]',vod_year:'2009',type_name:'解说',source_code:'f',vod_id:6}
  ];
  assert.deepEqual(Array.from(groupResults(input),group=>group.length),[2,1,1,1,1]);
});
test('continue watching omits completed titles and orders newest first',async()=>{
 const {unfinishedHistory}=await setup();
 const records=[{title:'older',url:'x',playbackPosition:30,duration:100,timestamp:1},{title:'done',url:'y',playbackPosition:98,duration:100,timestamp:3},{title:'newer',url:'z',playbackPosition:20,duration:100,timestamp:2}];
 assert.deepEqual(Array.from(unfinishedHistory(records),item=>item.title),['newer','older']);
});
test('source preference uses recent real starts and respects known identity',async()=>{
 const experience=await setup();
 const request={title:'影片',year:'2026',kind:'movie'};
 const a={vod_name:'影片',vod_year:'2026',type_name:'剧情片',source_code:'a',vod_id:1};
 const b={...a,source_code:'b',vod_id:2};
 experience.recordQuality('a',{started:false});
 experience.recordQuality('b',{started:true,firstFrameMs:500});
 assert.equal(experience.chooseCandidate([a,b],request).source_code,'b');
 assert.equal(experience.chooseCandidate([{...b,vod_year:'2001'},a],request).source_code,'a');
});
test('watch later stays local, deduplicates identities and can be removed',async()=>{
 const experience=await setup();
 const item={title:'影片',year:'2026',kind:'movie'};
 experience.addWatchLater(item);experience.addWatchLater(item);
 assert.equal(experience.watchLater().length,1);
 experience.removeWatchLater(item);
 assert.equal(experience.watchLater().length,0);
});
