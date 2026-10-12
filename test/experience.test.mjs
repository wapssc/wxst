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

test('other seasons are grouped across sources and ordered by release date',async()=>{
 const experience=await setup();
 const current={title:'权力的游戏 第三季',year:'2013',kind:'tv'};
 const items=[
  {vod_name:'权力的游戏 第四季',vod_year:'2014',type_name:'欧美剧',source_code:'a',vod_id:'4'},
  {vod_name:'权力的游戏 第一季',vod_year:'2011',type_name:'欧美剧',source_code:'a',vod_id:'1'},
  {vod_name:'权力的游戏 第一季',vod_year:'2011',type_name:'欧美剧',source_code:'b',vod_id:'1b'},
  {vod_name:'权力的游戏 第二季',vod_year:'2012',type_name:'欧美剧',source_code:'b',vod_id:'2'},
  {vod_name:'权力的游戏 第三季',vod_year:'2013',type_name:'欧美剧',source_code:'a',vod_id:'3'},
  {vod_name:'权力的游戏 预告',vod_year:'2015',type_name:'预告片',source_code:'a',vod_id:'trailer'},
  {vod_name:'游戏王 第一季',vod_year:'2011',type_name:'动漫',source_code:'a',vod_id:'other'}
 ];
 assert.deepEqual(Array.from(experience.franchiseRecommendations(items,current),item=>item.vod_name),
  ['权力的游戏 第一季','权力的游戏 第二季','权力的游戏 第四季']);
});

test('film sequels match a title stem without admitting unrelated suffixes',async()=>{
 const experience=await setup();
 const current={title:'速度与激情3',year:'2006',kind:'movie'};
 const items=[
  {vod_name:'速度与激情2',vod_year:'2003',type_name:'动作片',source_code:'a',vod_id:'2'},
  {vod_name:'速度与激情1',vod_year:'2001',type_name:'动作片',source_code:'a',vod_id:'1'},
  {vod_name:'速度与激情3',vod_year:'2006',type_name:'动作片',source_code:'a',vod_id:'3'},
  {vod_name:'速度与激情电影解说',vod_year:'2004',type_name:'电影解说',source_code:'a',vod_id:'commentary'}
 ];
 assert.deepEqual(Array.from(experience.franchiseRecommendations(items,current),item=>item.vod_name),
  ['速度与激情1','速度与激情2']);
});

test('related titles prefer actual heat, then rating, then newest release',async()=>{
 const experience=await setup();
 const current={title:'本片',year:'2025',kind:'movie',type:'剧情片'};
 const items=[
  {vod_name:'新片',vod_year:'2025',type_name:'剧情片',source_code:'a',vod_id:'new'},
  {vod_name:'高分',vod_year:'2020',type_name:'剧情片',vod_score:'8.8',source_code:'a',vod_id:'rating'},
  {vod_name:'热片',vod_year:'2018',type_name:'剧情片',vod_hits:'1500',source_code:'a',vod_id:'hot'},
  {vod_name:'次热',vod_year:'2019',type_name:'剧情片',vod_hits:'500',source_code:'a',vod_id:'warm'},
  {vod_name:'本片',vod_year:'2025',type_name:'剧情片',vod_hits:'9999',source_code:'a',vod_id:'current'},
  {vod_name:'别类',vod_year:'2026',type_name:'爱情片',vod_hits:'9999',source_code:'a',vod_id:'other'}
 ];
 assert.deepEqual(Array.from(experience.relatedRecommendations(items,current),item=>item.vod_name),
  ['热片','次热','高分','新片']);
});

test('a popularity feed can supply the missing rating for a playable source card',async()=>{
 const experience=await setup();
 const current={title:'当前电影',year:'2025',kind:'movie',type:'剧情片'};
 const items=[
  {vod_name:'高分电影',vod_year:'2020',type_name:'剧情片',source_code:'a',vod_id:'playable'},
  {vod_name:'一般电影',vod_year:'2024',type_name:'剧情片',vod_score:'8.0'},
  {vod_name:'高分电影',vod_year:'2020',type_name:'剧情片',vod_score:'9.0'}
 ];
 const ranked=experience.relatedRecommendations(items,current);
 assert.deepEqual(Array.from(ranked,item=>item.vod_name),['高分电影','一般电影']);
 assert.equal(ranked[0].vod_id,'playable');
});

test('a later playable source replaces the same title from the popularity feed',async()=>{
 const experience=await setup();
 const current={title:'当前电影',year:'2025',kind:'movie',type:'剧情片'};
 const ranked=experience.relatedRecommendations([
  {vod_name:'推荐电影',vod_year:'2024',type_name:'剧情片',vod_score:'9.0'},
  {vod_name:'推荐电影',vod_year:'2024',type_name:'剧情片',source_code:'a',vod_id:'playable'}
 ],current);
 assert.equal(ranked.length,1);
 assert.equal(ranked[0].vod_id,'playable');
 assert.equal(ranked[0].vod_score,9);
});

test('zero reported plays do not outrank a rated title',async()=>{
 const experience=await setup();
 const current={title:'当前电影',year:'2025',kind:'movie',type:'剧情片'};
 const ranked=experience.relatedRecommendations([
  {vod_name:'零播放',vod_year:'2024',type_name:'剧情片',vod_hits:'0',vod_score:'7.0'},
  {vod_name:'高评分',vod_year:'2020',type_name:'剧情片',vod_score:'9.0'}
 ],current);
 assert.deepEqual(Array.from(ranked,item=>item.vod_name),['高评分','零播放']);
});
