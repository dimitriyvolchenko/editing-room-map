/* Cache only the Editing Room HTML shell. No GitHub API, credentials or progress. */
'use strict';
const ROOT=new URL(self.registration.scope);
const PREFIX='er-map-shell:'+encodeURIComponent(ROOT.pathname)+':';
const CACHE=PREFIX+'33';
const INDEX=new URL('index.html',ROOT).href;
async function validShell(response){
 if(!response||!response.ok)return false;
 const text=await response.clone().text();
 return text.length>10000&&text.includes('id="app-data"')&&text.includes('editing-room-map');
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const response=await fetch(INDEX,{cache:'reload'});
 if(!await validShell(response))throw new Error('Invalid Editing Room shell');
 const cache=await caches.open(CACHE);await cache.put(INDEX,response);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==ROOT.origin)return;
 if(url.pathname!==ROOT.pathname&&url.pathname!==new URL(INDEX).pathname)return;
 // Force refresh must fail offline rather than quietly return the previous build.
 if(url.searchParams.has('er_update')&&event.request.mode!=='navigate'){event.respondWith(fetch(event.request,{cache:'no-store'}));return;}
 if(event.request.mode!=='navigate')return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
  try{
   const response=await fetch(event.request,{cache:'no-cache',signal:abort.signal});
   if(!await validShell(response))throw new Error('Invalid server response');
   await cache.put(INDEX,response.clone());return response;
  }catch(e){const saved=await cache.match(INDEX);if(saved)return saved;throw e;}
  finally{clearTimeout(timer);}
 })());
});
