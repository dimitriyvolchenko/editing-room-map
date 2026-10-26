/* v33: explicit bookmarks and custom-task badges. Executed inside the map closure.
   Only UI preferences are extended. Cloud projection and the existing storage key stay intact. */
function normalizeExperience(raw){
 const u=obj(raw)?raw:{},bookmarks={mobile:'',davinci:''};
 for(const n of ['mobile','davinci'])if(obj(u.bookmarks)&&TASK_BY[n].has(u.bookmarks[n]))bookmarks[n]=u.bookmarks[n];
 return {customBadges:u.customBadges!==false,pendingBadges:u.pendingBadges===true,homeBadge:u.homeBadge===true,resumeBookmark:u.resumeBookmark!==false,bookmarks,lastBookmarkMode:NAMES[u.lastBookmarkMode]?u.lastBookmarkMode:'mobile'};
}
const normalizeBeforeExperience=normalizeBackup;
normalizeBackup=function(raw){const s=normalizeBeforeExperience(raw);Object.assign(s.ui,normalizeExperience(raw.ui));return s;};
let savedExperience=null;
try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');savedExperience=raw&&raw.ui;}catch(e){}
Object.assign(state.ui,normalizeExperience(savedExperience));
// Legacy cursor also tracked ordinary navigation. Preserve it only as a one-time migration.
if(!savedExperience||!obj(savedExperience.bookmarks)){
 for(const n of ['mobile','davinci'])if(TASK_BY[n].has(state.workspaces[n].cursor))state.ui.bookmarks[n]=state.workspaces[n].cursor;
 state.ui.lastBookmarkMode=mode;
}
try{history.scrollRestoration='manual';}catch(e){}
const EXP_BUILD='33.0.0-bookmarks';
const appDirectory=new URL('.',location.href);
const offlinePrefix='er-map-shell:'+encodeURIComponent(appDirectory.pathname)+':';
const offlineCache=offlinePrefix+'33';
let experienceFrame=0,lastNativeBadge='',offlineReady=false,offlineRegistration=null;
function selectedBookmark(preferCurrent=false){
 const u=state.ui,first=preferCurrent?mode:u.lastBookmarkMode;
 for(const n of [first,mode,'mobile','davinci'])if(NAMES[n]&&TASK_BY[n].has(u.bookmarks[n]))return {mode:n,id:u.bookmarks[n]};
 return null;
}
function ownTaskCount(name,taskId){
 const lists=taskId?[state.workspaces[name].custom[taskId]||[]]:Object.values(state.workspaces[name].custom);
 return lists.reduce((sum,list)=>sum+list.filter(s=>!state.ui.pendingBadges||!s.done).length,0);
}
function queueExperience(){if(experienceFrame)return;experienceFrame=requestAnimationFrame(()=>{experienceFrame=0;paintExperience();});}
const saveBeforeExperience=save;
save=function(){saveBeforeExperience();queueExperience();};
const cardBeforeExperience=cardHTML;
cardHTML=function(t,...args){
 return cardBeforeExperience(t,...args).replace('<button class="task-check"',
  `<span class="er-own-badge" data-own-count="${t.id}" hidden></span><button type="button" class="er-bookmark" data-bookmark="${t.id}" aria-label="Поставить закладку: ${esc(t.title)}" aria-pressed="false">${icon('bookmark')}</button><button class="task-check"`);
};
const renderBeforeExperience=render;
render=function(){renderBeforeExperience();paintExperience();};
const detailsBeforeExperience=ensureDetails;
ensureDetails=function(d){detailsBeforeExperience(d);paintBookmarkButtons();};
const currentBeforeExperience=updateCurrent;
updateCurrent=function(){currentBeforeExperience();queueExperience();};
function paintBookmarkButtons(){
 for(const el of $$('.map-card')){
  const id=el.dataset.taskid,on=state.ui.bookmarks[mode]===id;
  el.classList.toggle('er-bookmarked',on);
  for(const button of $$('[data-bookmark],[data-cursor]',el)){
   button.setAttribute('aria-pressed',String(on));
   const label=on?'Снять закладку':'Поставить закладку';
   button.setAttribute('aria-label',label+': '+(TASK_BY[mode].get(id)?.title||id));button.title=label;
   if(button.hasAttribute('data-cursor'))button.innerHTML=icon('bookmark')+(on?'Закладка сохранена':'Поставить закладку');
  }
 }
}
function paintExperience(){
 paintBookmarkButtons();
 for(const badge of $$('[data-own-count]')){
  const count=ownTaskCount(mode,badge.dataset.ownCount);badge.hidden=!state.ui.customBadges||!count;badge.textContent=String(count);
  badge.title='Твоих задач: '+count;badge.setAttribute('aria-label','Твоих задач: '+count);
 }
 for(const n of ['mobile','davinci']){
  const tab=$('#tab-'+n);let b=$('.er-tab-badge',tab);
  if(!b){b=document.createElement('span');b.className='er-tab-badge';tab.appendChild(b);}
  const count=ownTaskCount(n);b.hidden=!state.ui.customBadges||!count;b.textContent=String(count);b.setAttribute('aria-label','Твоих задач: '+count);
 }
 const total=ownTaskCount('mobile')+ownTaskCount('davinci');
 $('#erOwnTotal').textContent=String(total);
 for(const [id,key] of [['erCustomBadges','customBadges'],['erPendingBadges','pendingBadges'],['erHomeBadge','homeBadge'],['erResumeBookmark','resumeBookmark']])$('#'+id).checked=state.ui[key];
 const bm=selectedBookmark(),label=$('#erBookmarkLocation');
 label.textContent=bm?NAMES[bm.mode]+' · '+TASK_BY[bm.mode].get(bm.id).title:'Закладка не выбрана. Нажми контур ленты на нужной карточке.';
 $('#erGoBookmark').disabled=!bm;
 if(bm){$('#resumeBtn').innerHTML='К закладке '+icon('bookmark');}
 updateNativeBadge(total);
}
function toggleBookmark(id){
 if(!TASK_BY[mode].has(id))return;
 const removed=state.ui.bookmarks[mode]===id;state.ui.bookmarks[mode]=removed?'':id;
 if(!removed){state.ui.lastBookmarkMode=mode;workspace().cursor=id;}
 save();paintExperience();scheduleEdges();
 if(!persistent||storageBlocked||storageConflict)toast('Закладка изменена в открытой странице, но не записана на устройство. Сохрани резервную копию.');
 else toast(removed?'Закладка снята.':'Закладка сохранена на устройстве. При следующем запуске откроется эта карточка.');
}
$('#routeEntries').addEventListener('click',e=>{
 const b=e.target.closest('[data-bookmark],[data-cursor]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();toggleBookmark(b.dataset.bookmark||b.dataset.cursor);
},true);
// The old resume handler was attached by reference; intercept only when a bookmark exists.
$('#resumeBtn').addEventListener('click',e=>{const b=selectedBookmark(true);if(!b)return;e.preventDefault();e.stopImmediatePropagation();jumpTo(b.mode,b.id);},true);
function restoreExperience(){
 const b=state.ui.resumeBookmark?selectedBookmark():null;
 if(!b){if(initialHash)jumpTo(initialHash.mode,initialHash.id);else{const y=workspace().scroll;requestAnimationFrame(()=>instantScroll(y));}return;}
 if(mode!==b.mode){mode=b.mode;state.ui.mode=mode;render();}
 const el=document.getElementById(b.mode+'-'+b.id),d=el&&$('.card-details',el);if(!d)return;
 ensureDetails(d);d.open=true;$('.detail-label',d).textContent='Свернуть шаги';workspace().cursor=b.id;
 setHash(b.mode,b.id);save();paintExperience();
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  instantScroll(Math.max(0,window.scrollY+el.getBoundingClientRect().top-$('.topbar').offsetHeight-20));
  $('h4',el)?.focus({preventScroll:true});scheduleEdges();
 }));
}
function instantScroll(y){const html=document.documentElement,old=html.style.scrollBehavior;html.style.scrollBehavior='auto';window.scrollTo({top:y,behavior:'instant'});html.style.scrollBehavior=old;}
async function updateNativeBadge(count,force=false){
 const hint=$('#erNativeBadgeStatus'),supported=typeof navigator.setAppBadge==='function';
 if(!supported){hint.textContent='Бейдж внутри карты работает. Для цифры на иконке нужен поддерживаемый установленный веб-сайт; на iPhone открой его с экрана «Домой».';return;}
 const granted=typeof Notification!=='undefined'&&Notification.permission==='granted';
 hint.textContent=!state.ui.homeBadge?'Цифра на иконке выключена.':granted?'Счётчик передан системе. Видимость бейджа зависит от настроек уведомлений устройства.':'На iPhone для цифры на иконке разреши уведомления кнопкой ниже. Приложение не отправляет push-уведомления.';
 const next=state.ui.homeBadge?count:0,key=next+':'+state.ui.homeBadge+':'+granted;
 if(!force&&lastNativeBadge===key)return;lastNativeBadge=key;
 try{if(next)await navigator.setAppBadge(next);else if(navigator.clearAppBadge)await navigator.clearAppBadge();else await navigator.setAppBadge(0);}
 catch(e){lastNativeBadge='';hint.textContent='Система не разрешила изменить бейдж. Счётчики внутри карты продолжают работать.';}
}
const personalStyle=document.createElement('style');personalStyle.textContent=`
.er-own-badge[hidden],.er-tab-badge[hidden]{display:none!important}.map-card .card-head{justify-content:flex-start;gap:8px}.card-head .task-code{margin-right:auto}.er-own-badge,.er-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:23px;padding:0 6px;background:#c25348;color:#fff;border-radius:999px;font:650 11px/1 system-ui;font-variant-numeric:tabular-nums;flex:none}.er-tab-badge{height:20px;min-width:20px;font-size:10px;padding:0 5px}.er-bookmark{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;border-radius:12px;border:1px solid transparent;background:transparent;color:#929589}.er-bookmark:hover{background:#f5eee5}.er-bookmark .ico{fill:none;stroke-width:1.25}.er-bookmark[aria-pressed=true]{border:1px solid #bc4944;color:#bc4944;background:transparent}.map-card.er-bookmarked{border:1px solid #bc4944!important;outline:none;box-shadow:var(--shadow)}.set-cursor[aria-pressed=true]{color:#bc4944!important;border:1px solid #bc4944;background:transparent}.er-personal-settings{padding:16px;border:1px solid var(--line);border-radius:16px;background:#fbf8f0;margin:16px 0}.er-personal-settings h4{font-size:15px;margin:0 0 12px}.er-personal-settings .er-sync-check{margin:13px 0}.er-personal-settings p{font-size:11px;line-height:1.7}.er-own-total{display:flex;gap:10px;align-items:center;font-size:12px}.er-own-total b{border-radius:999px;background:#c25348;color:white;min-width:25px;min-height:25px;display:grid;place-items:center}.er-bookmark-location{margin:12px 0;border-left:1px solid #bc4944;padding-left:10px;color:#8c4540;overflow-wrap:anywhere}.er-personal-settings .secondary{font-size:12px}.er-local-status{font-size:11px;line-height:1.7;margin-top:12px;color:var(--muted)}#erBadgePermission{margin-top:7px}#cloudPanel .modal-section{margin-top:18px}button:disabled{cursor:default}@media(max-width:370px){.map-card .card-head{gap:4px}.er-bookmark{width:36px;height:40px}.er-own-badge{font-size:10px;min-width:20px;height:20px}.tab{gap:6px}.er-personal-settings{padding:13px}}`;
document.head.appendChild(personalStyle);
const personalPanel=document.createElement('section');personalPanel.className='er-personal-settings';
personalPanel.innerHTML=`<h4>Мои задачи и закладка</h4><label class="er-sync-check"><input id="erCustomBadges" type="checkbox"><span>Показывать бейджи моих задач на карточках и вкладках</span></label><label class="er-sync-check"><input id="erPendingBadges" type="checkbox"><span>Считать только невыполненные мои задачи</span></label><div class="er-own-total">Мои задачи в двух разделах <b id="erOwnTotal">0</b></div><p>Считаются только добавленные тобой «Свои шаги»: один — 1, два — 2. По умолчанию считаются и завершённые. Удаление уменьшает число; стандартные шаги не учитываются.</p><label class="er-sync-check"><input id="erHomeBadge" type="checkbox"><span>Показывать это число на иконке приложения</span></label><p id="erNativeBadgeStatus" role="status"></p><button class="secondary" id="erBadgePermission" type="button">Разрешить бейдж на иконке</button><label class="er-sync-check"><input id="erResumeBookmark" type="checkbox"><span>При новом запуске открывать последнюю поставленную закладку</span></label><p class="er-bookmark-location" id="erBookmarkLocation"></p><button class="secondary" id="erGoBookmark" type="button">К закладке</button><p>По одной закладке в Mobile и DaVinci. Запуск — на последней поставленной. Просмотр и отметки других карточек её не перемещают. Закладки и настройки бейджей сохраняются на этом устройстве и входят в резервный JSON.</p><p class="er-local-status" id="erOfflineStatus" role="status">Проверяю сохранение приложения…</p><button class="secondary" id="erKeepOffline" type="button">Сохранить для работы без сети</button>`;
$('#cloudPanel').insertBefore(personalPanel,$('#cloudStatus'));
for(const [id,key] of [['erCustomBadges','customBadges'],['erPendingBadges','pendingBadges'],['erHomeBadge','homeBadge'],['erResumeBookmark','resumeBookmark']])$('#'+id).addEventListener('change',e=>{state.ui[key]=e.target.checked;save();paintExperience();});
$('#erGoBookmark').addEventListener('click',()=>{const b=selectedBookmark();if(b){closeDialog($('#dataDialog'));jumpTo(b.mode,b.id);}});
$('#erBadgePermission').addEventListener('click',async()=>{
 if(!('setAppBadge' in navigator)){toast('Открой Editing Room с экрана «Домой». В этом браузере системный бейдж недоступен.');return;}
 try{
  if(typeof Notification!=='undefined'&&Notification.permission!=='granted'){
   const p=await Notification.requestPermission();if(p!=='granted'){toast('Разрешение не получено. Проверь уведомления приложения в настройках устройства.');return;}
  }
  state.ui.homeBadge=true;save();paintExperience();await updateNativeBadge(ownTaskCount('mobile')+ownTaskCount('davinci'),true);
 }catch(e){toast('Системное разрешение сейчас недоступно. Счётчики в карте работают независимо.');}
});
function offlineText(text){$('#erOfflineStatus').textContent=text;}
async function prepareOffline(requestPersistence=false){
 if(!/^https?:$/.test(location.protocol)||!window.isSecureContext||!('serviceWorker' in navigator)){offlineText('Прогресс сохраняется локально. Для повторного запуска сайта без сети открой HTTPS-адрес GitHub Pages.');return false;}
 try{
  offlineText('Сохраняю приложение на устройство…');
  const reg=await navigator.serviceWorker.register(new URL('sw.js',appDirectory).href,{scope:appDirectory.href,updateViaCache:'none'});offlineRegistration=reg;
  await new Promise((resolve,reject)=>{const end=Date.now()+15000;const poll=()=>{if(reg.active)return resolve();if(Date.now()>end)return reject(new Error('Офлайн-копия пока не готова. Повтори с интернетом.'));setTimeout(poll,120);};poll();});
  const cache=await caches.open(offlineCache),url=new URL('index.html',appDirectory).href;
  if(!await cache.match(url))throw new Error('Офлайн-копия не найдена. Обнови приложение при наличии сети.');
  offlineReady=true;
  let kept=false;
  if(requestPersistence&&navigator.storage?.persist)kept=await navigator.storage.persist();
  offlineText('Готово для запуска без сети. Прогресс и закладка сохраняются на устройстве.'+(kept?' Браузер разрешил устойчивое хранение.':''));return true;
 }catch(e){offlineReady=false;offlineText('Локальные отметки сохранены. '+(navigator.onLine?e.message:'Офлайн-копия приложения ещё не готова: один раз открой сайт с интернетом.'));return false;}
}
$('#erKeepOffline').addEventListener('click',()=>prepareOffline(true));
// Keep the existing refresh control, but make it prominent beside sync/preferences.
const refreshSection=$('#forceAppUpdate').closest('.modal-section');$('#cloudPanel').appendChild(refreshSection);
$('p',refreshSection).textContent='Версия '+EXP_BUILD+'. Получить свежую версию без удаления прогресса, ключа, иконки и закладки. Защитная копия создаётся перед обновлением.';
$('#forceAppUpdate').removeEventListener('click',forceAppUpdate);
forceAppUpdate=async function(){
 const button=$('#forceAppUpdate'),status=$('#updateStatus');if(button.disabled)return;button.disabled=true;
 try{
  save();cloudGuard();checkpoint('Перед обновлением v33');
  if(!/^https?:$/.test(location.protocol))throw new Error('Открой опубликованный сайт; скачанный index.html обновляется заменой файла.');
  if(!navigator.onLine)throw new Error('Нет сети. Приложение остаётся открытым; прогресс и закладка сохранены.');
  if(cloudFlight)await cloudFlight;
  const url=new URL(location.href);url.searchParams.set('er_update',String(Date.now()));
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);let response,html;
  status.textContent='Проверяю свежую версию…';
  try{response=await fetch(url.href,{cache:'no-store',redirect:'error',signal:abort.signal});html=await response.text();}finally{clearTimeout(timer);}
  const parsed=new DOMParser().parseFromString(html,'text/html'),data=parsed.querySelector('#app-data');
  if(!response.ok||!data||!html.includes('editing-room-map')||html.length<10000)throw new Error('Сервер не вернул корректное приложение. Обновление отменено.');
  const test=JSON.parse(data.textContent);if(!test.workspaces?.mobile||!test.workspaces?.davinci)throw new Error('Проверка новой версии не пройдена.');
  if('caches' in window){const cache=await caches.open(offlineCache);await cache.put(new URL('index.html',appDirectory).href,new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));}
  if(offlineRegistration)try{await offlineRegistration.update();}catch(e){/* A validated current shell is already cached. */}
  save();cloudGuard();status.textContent='Прогресс и закладка сохранены. Открываю обновление…';location.replace(url.href);
 }catch(e){status.textContent=e.name==='AbortError'?'Сервер не ответил вовремя. Карта остаётся открытой.':e.message;}finally{button.disabled=false;}
};
$('#forceAppUpdate').addEventListener('click',forceAppUpdate);
// A standalone manifest keeps the app identity stable; the selected image stays local.
function updateExperienceManifest(){
 if(!/^https?:$/.test(location.protocol))return;
 const image=APP_ICONS[currentIconKey()].src;
 const manifest={id:appDirectory.href,name:'Editing Room',short_name:'Editing Room',start_url:appDirectory.href,scope:appDirectory.href,display:'standalone',background_color:'#f7f5ef',theme_color:'#f7f5ef',icons:[{src:image,sizes:'256x256',type:'image/png',purpose:'any'}]};
 let link=$('#erExperienceManifest');if(!link){link=document.createElement('link');link.id='erExperienceManifest';link.rel='manifest';document.head.appendChild(link);}
 link.href='data:application/manifest+json,'+encodeURIComponent(JSON.stringify(manifest));
}
const iconBeforeExperience=applyAppIcon;
applyAppIcon=function(){iconBeforeExperience();updateExperienceManifest();};
$('#dataBtn').addEventListener('click',paintExperience);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){workspace().scroll=window.scrollY;save();}else{lastNativeBadge='';queueExperience();}});
// Do not infer a bookmark deletion from a mere render or cloud refresh.
const resetButton=$('#resetBtn');let beforeReset=null;resetButton.addEventListener('click',()=>{beforeReset=workspace();},true);resetButton.addEventListener('click',()=>{if(beforeReset!==workspace()){state.ui.bookmarks[mode]='';save();queueExperience();}});
const buildMeta=$('meta[name="editing-room-build"]');if(buildMeta)buildMeta.content=EXP_BUILD;
if(footer)footer.textContent='MAP EDITION · 33.0 · ЗАКЛАДКИ + БЕЙДЖИ · LOCAL + GITHUB';
const aboutTitle=$('#aboutDialog .dialog-body p b');if(aboutTitle)aboutTitle.textContent='Editing Room · Map Edition 33.0';
window.EditingRoomExperience=Object.freeze({build:EXP_BUILD,counts:()=>({mobile:ownTaskCount('mobile'),davinci:ownTaskCount('davinci')}),bookmark:()=>selectedBookmark(),offline:()=>offlineReady});
setTimeout(()=>prepareOffline(false),400);
