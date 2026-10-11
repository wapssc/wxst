import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/episode-context.js',import.meta.url),'utf8');
function tab() {
 const data=new Map();const sandbox={window:{},sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},Date};
 vm.runInNewContext(code,sandbox);return sandbox.window.EpisodeContext;
}
test('episode lists are isolated by tab, source, video id and URL',()=>{
 const a=tab(),b=tab();
 a.write({source:'site-a',id:1,episodes:['episode-1','episode-2'],episodeNames:['一','二']});
 assert.equal(a.read({source:'site-a',id:1,url:'episode-2'}).episodeNames[1],'二');
 assert.equal(a.read({source:'site-b',id:1,url:'episode-2'}),null);
 assert.equal(a.read({source:'site-a',id:2,url:'episode-2'}),null);
 assert.equal(a.read({source:'site-a',id:1,url:'unrelated'}),null);
 assert.equal(b.read({source:'site-a',id:1,url:'episode-2'}),null);
});
