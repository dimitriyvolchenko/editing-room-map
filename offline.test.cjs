'use strict';
// Worker behaviour in a simulated CacheStorage/network. Not a physical-device test.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8');
const events={},stores=new Map(),root='https://example.test/editing-room-map/';
let online=true,bad=false,stamp='first',skipped=false,claimed=false;
const shell=()=>'<html>editing-room-map <script id="app-data"></script>'+stamp+'x'.repeat(11000)+'</html>';
const caches={keys:async()=>[...stores.keys()],delete:async k=>stores.delete(k),open:async k=>{
 if(!stores.has(k))stores.set(k,new Map());const m=stores.get(k);
 return {put:async(k,r)=>m.set(String(k),r.clone()),match:async k=>m.get(String(k))?.clone()};
}};
const sandbox={URL,Response,Request,AbortController,setTimeout,clearTimeout,caches,
 fetch:async()=>{if(!online)throw new TypeError('offline');return new Response(bad?'not the app':shell(),{status:bad?503:200});},
 self:{registration:{scope:root},addEventListener:(k,v)=>events[k]=v,skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;}}}};
vm.runInNewContext(source,sandbox);
const life=type=>{let p;events[type]({waitUntil:x=>p=x});return p;};
const nav=(path='',mode='navigate',method='GET')=>{let p;events.fetch({request:{url:root+path,mode,method},respondWith:x=>p=x});return p;};
const pass=name=>console.log('PASS '+name);
(async()=>{
 await life('install');assert.ok(skipped);pass('install validates and caches shell');
 const own='er-map-shell:'+encodeURIComponent('/editing-room-map/')+':';
 await caches.open(own+'32');await caches.open('er-map-shell:%2Fother%2F:32');await caches.open('study-cache');
 await life('activate');assert.ok(claimed);assert.ok(!stores.has(own+'32'));assert.ok(stores.has('study-cache'));assert.ok(stores.has('er-map-shell:%2Fother%2F:32'));pass('activation clears only this application scope');
 stamp='updated';assert.ok((await(await nav()).text()).includes('updated'));pass('online navigation refreshes cached shell');
 online=false;assert.ok((await(await nav('index.html')).text()).includes('updated'));pass('offline reopen uses last valid shell');
 assert.ok((await(await nav('?other=1')).text()).includes('updated'));pass('query strings do not break offline launch');
 await assert.rejects(nav('?er_update=1','cors'));pass('force refresh never pretends cached version is new');
 assert.equal(nav('sync/core.js'),undefined);assert.equal(nav('../study/'),undefined);assert.equal(nav('', 'navigate','POST'),undefined);pass('other paths and writes are not intercepted');
 let p;events.fetch({request:{url:'https://api.github.com/repos/test/repo/contents/progress.json',method:'GET',mode:'cors'},respondWith:v=>p=v});assert.equal(p,undefined);pass('GitHub API and progress never enter shell cache');
 online=true;bad=true;assert.ok((await(await nav()).text()).includes('updated'));pass('server error falls back to valid copy');
 await assert.rejects(life('install'));assert.ok((await(await nav()).text()).includes('updated'));pass('failed install does not replace valid offline copy');
 assert.ok((await(await nav('?er_update=1')).text()).includes('updated'));pass('offline navigation after refresh keeps working');
 assert.equal(nav('index.html','cors'),undefined);pass('ordinary non-navigation fetch is not hijacked');
 console.log('12 service-worker tests passed');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
