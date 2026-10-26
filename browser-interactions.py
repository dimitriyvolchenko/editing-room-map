from pathlib import Path
import json,re,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
# Replace heavy embedded images only in the interaction harness; delivered images are unchanged.
HTML=re.sub(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7l8AAAAASUVORK5CYII=',HTML)
KEY='editing-room.map.v30'
reports=[]
def ok(name, condition):
 if not condition:raise AssertionError(name)
 reports.append(name);print('PASS',name,flush=True)
# Navigation is disabled by the container's managed-browser policy.
# Render the exact UI in about:blank; mock only origin/storage/network/platform APIs.
def boot(page,store=None,hash_=''):
 raw=json.dumps(store or {},ensure_ascii=False)
 injection='''<script>
window.__storage=Object.assign(Object.create(null),INIT_STORE);
function makeStore(data){return {getItem(k){return k in data?data[k]:null;},setItem(k,v){data[k]=String(v);},removeItem(k){delete data[k];},key(i){return Object.keys(data)[i]||null;},get length(){return Object.keys(data).length;}};}
Object.defineProperty(window,'localStorage',{value:makeStore(window.__storage),configurable:true});
Object.defineProperty(window,'sessionStorage',{value:makeStore(Object.create(null)),configurable:true});
window.__loc={href:'https://editing-room.test/map/'+HASH,protocol:'https:',hash:HASH,pathname:'/map/',search:'',replace(u){window.__navigation=u;}};
window.__history={scrollRestoration:'auto',replaceState(a,b,u){window.__loc.href=new URL(u,'https://editing-room.test').href;window.__loc.hash=new URL(window.__loc.href).hash;}};
window.__badges=[];Object.defineProperty(navigator,'setAppBadge',{value:async n=>window.__badges.push(n),configurable:true});Object.defineProperty(navigator,'clearAppBadge',{value:async()=>window.__badges.push(0),configurable:true});
Object.defineProperty(navigator,'onLine',{get:()=>window.__online!==false,configurable:true});
window.__permissions=0;Object.defineProperty(window,'Notification',{value:{permission:'default',async requestPermission(){window.__permissions++;this.permission='granted';return 'granted';}},configurable:true});
window.fetch=async()=>{throw new TypeError('Test network offline');};
</script>'''.replace('INIT_STORE',raw).replace('HASH',json.dumps(hash_))
 # Shadow origin/navigation only inside the original application closure.
 test_html=HTML.replace('<head>','<head>'+injection,1).replace("<script>(() => {","<script>(() => { const location=window.__loc,history=window.__history;",1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(test_html,wait_until='domcontentloaded',timeout=30000);page.wait_for_function('!!window.EditingRoomExperience');page.wait_for_timeout(150)
 if errors:raise AssertionError(errors)
 return errors

def snapshot(page):return page.evaluate('Object.assign({},window.__storage)')
def state(page):return json.loads(snapshot(page)[KEY])
def open_task(page,id):
 d=page.locator(f'[data-detail="{id}"]')
 if not d.get_attribute('open'):d.locator('summary').first.dispatch_event('click')
 page.wait_for_timeout(60)
def add(page,id,text):
 page.locator(f'[data-add-task="{id}"] input').fill(text)
 page.locator(f'[data-add-task="{id}"] button').dispatch_event('click');page.wait_for_timeout(60)
def close_settings(page):page.locator('#dataDialog [data-close]').dispatch_event('click')

with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce')
 ctx.set_default_timeout(5000)
 p=ctx.new_page();errors=boot(p)
 ok('170 actions and 916 base steps retained',p.evaluate('EditingRoomMap.counts().mobile.tasks+EditingRoomMap.counts().davinci.tasks')==170 and p.evaluate('EditingRoomMap.counts().mobile.total+EditingRoomMap.counts().davinci.total')==916)
 ok('No automatic notification prompt',p.evaluate('__permissions')==0)
 open_task(p,'mt1');add(p,'mt1','Моя первая задача');ok('First custom task badge = 1',p.locator('[data-own-count="mt1"]').inner_text()=='1')
 add(p,'mt1','Моя вторая задача');ok('Second custom task badge = 2',p.locator('[data-own-count="mt1"]').inner_text()=='2')
 ok('Route badge excludes standard steps',p.locator('#tab-mobile .er-tab-badge').inner_text()=='2')
 p.locator('[data-custom]').first.evaluate("e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.wait_for_timeout(80)
 ok('Default badge includes completed custom tasks',p.locator('[data-own-count="mt1"]').inner_text()=='2')
 p.locator('#dataBtn').dispatch_event('click');p.locator('#erPendingBadges').evaluate("e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.wait_for_timeout(80)
 ok('Pending-only setting changes the count',p.locator('#erOwnTotal').inner_text()=='1')
 p.locator('#erHomeBadge').evaluate("e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.wait_for_timeout(80)
 ok('Native badge receives number but permission not requested automatically',p.evaluate('__badges.at(-1)')==1 and p.evaluate('__permissions')==0)
 p.locator('#erBadgePermission').dispatch_event('click');p.wait_for_timeout(80)
 ok('Permission request is user-triggered only',p.evaluate('__permissions')==1)
 p.locator('#erCustomBadges').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.wait_for_timeout(80)
 ok('Map badges can be hidden',p.locator('[data-own-count="mt1"]').is_hidden())
 p.locator('#erCustomBadges').evaluate("e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.locator('#erPendingBadges').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));}");close_settings(p)
 p.locator('[data-bookmark="mt1"]').dispatch_event('click');p.wait_for_timeout(80)
 ok('Bookmark has thin red border',p.locator('#mobile-mt1').evaluate('(e)=>getComputedStyle(e).borderTopColor')=='rgb(188, 73, 68)' and p.locator('#mobile-mt1').evaluate('(e)=>getComputedStyle(e).borderTopWidth')=='1px')
 open_task(p,'mt2');p.locator('[data-step]').last.evaluate("e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}");p.wait_for_timeout(80)
 ok('Reading another card does not move bookmark',state(p)['ui']['bookmarks']['mobile']=='mt1')
 s=snapshot(p);p.close();p2=ctx.new_page();boot(p2,s,hash_='#mobile-mt2')
 ok('Reopen restores explicit bookmark, not incidental hash',p2.locator('#mobile-mt1 .card-details').get_attribute('open') is not None and p2.locator('#mobile-mt1').bounding_box()['y']<180)
 ok('Reopen keeps custom tasks and preference',state(p2)['ui']['bookmarks']['mobile']=='mt1' and len(state(p2)['workspaces']['mobile']['custom']['mt1'])==2)
 p2.locator('#tab-davinci').dispatch_event('click');open_task(p2,'t1');add(p2,'t1','Задача DaVinci');p2.locator('[data-bookmark="t1"]').dispatch_event('click');p2.wait_for_timeout(80)
 ok('Separate bookmarks for Mobile and DaVinci',state(p2)['ui']['bookmarks']=={'mobile':'mt1','davinci':'t1'})
 p2.locator('#tab-mobile').dispatch_event('click');s=snapshot(p2);p2.close();p3=ctx.new_page();boot(p3,s)
 ok('Last explicitly placed bookmark decides launch workspace',p3.evaluate('document.documentElement.dataset.workspace')=='davinci' and p3.locator('#davinci-t1 .card-details').get_attribute('open') is not None)
 p3.on('dialog',lambda d:d.accept());p3.locator('[data-remove-custom]').first.dispatch_event('click');p3.wait_for_timeout(80)
 ok('Deletion removes zero badge',p3.locator('[data-own-count="t1"]').is_hidden())
 p3.locator('#dataBtn').dispatch_event('click');ok('Exactly one force-update button located next to sync',p3.locator('#forceAppUpdate').count()==1 and p3.locator('#cloudPanel #forceAppUpdate').count()==1)
 p3.evaluate('window.__online=false');before=state(p3);p3.locator('#forceAppUpdate').dispatch_event('click');p3.wait_for_timeout(80)
 ok('Offline force refresh does not reload or remove progress',not p3.evaluate('!!window.__navigation') and state(p3)['workspaces']==before['workspaces'] and 'Нет сети' in p3.locator('#updateStatus').inner_text())
 p3.evaluate('window.__online=true; window.fetch=async()=>new Response("<html>bad</html>",{status:200})')
 p3.locator('#forceAppUpdate').dispatch_event('click');p3.wait_for_timeout(80)
 ok('Invalid server response cancels refresh',not p3.evaluate('!!window.__navigation') and 'Обновление отменено' in p3.locator('#updateStatus').inner_text())
 p3.evaluate('(html)=>{window.__shell=html;window.fetch=async()=>new Response(window.__shell,{status:200,headers:{"Content-Type":"text/html"}});Object.defineProperty(window,"caches",{value:{open:async()=>({put:async()=>{window.__cached=true}})},configurable:true});}',HTML)
 p3.locator('#forceAppUpdate').dispatch_event('click');p3.wait_for_timeout(100)
 ok('Force refresh validates, checkpoints and reloads with cache-buster',p3.evaluate('!!window.__navigation && window.__navigation.includes("er_update=") && __cached') and KEY+':cloud.recovery.v1' in snapshot(p3))
 ok('Bookmark survives force refresh',state(p3)['ui']['bookmarks']['davinci']=='t1')
 p3.locator('#erHomeBadge').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));}");p3.wait_for_timeout(80);ok('Disabling icon badge clears native counter',p3.evaluate('__badges.at(-1)')==0)
 p3.locator('#erCustomBadges').evaluate("e=>e.scrollIntoView({behavior:'instant',block:'center'})");p3.screenshot(path=str(ROOT/'test-settings-390.png'))
 close_settings(p3);p3.locator('#davinci-t1 h4').evaluate("e=>e.scrollIntoView({behavior:'instant',block:'center'})");p3.screenshot(path=str(ROOT/'test-bookmark-390.png'))
 for width in (320,390,768,1440):
  p3.set_viewport_size({'width':width,'height':900});p3.wait_for_timeout(70)
  ok(f'No horizontal page overflow at {width}px',p3.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  p3.locator('#dataBtn').dispatch_event('click');p3.locator('#erCustomBadges').evaluate("e=>e.scrollIntoView({behavior:'instant',block:'center'})")
  ok(f'No settings overflow at {width}px',p3.locator('#dataDialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'))
  close_settings(p3)
 # Legacy cursor migration and no data mutation at upgrade.
 legacy=dict(s);o=json.loads(legacy[KEY]);o['ui']={'mode':'mobile','appIcon':'retro'};legacy[KEY]=json.dumps(o)
 p3.close();p4=ctx.new_page();boot(p4,legacy)
 ok('Legacy state migrates without changing progress or icon',state(p4)['ui']['appIcon']=='retro' and state(p4)['workspaces']['mobile']['custom']==o['workspaces']['mobile']['custom'])
 # All application error collectors are still empty.
 ok('No application JavaScript errors',not errors)
 (ROOT/'browser-test-report.json').write_text(json.dumps({'engine':'Chromium','environment':'about:blank; simulated origin, storage, network and OS badge APIs; network navigation blocked by container policy','passed':reports},ensure_ascii=False,indent=2))
 b.close()
