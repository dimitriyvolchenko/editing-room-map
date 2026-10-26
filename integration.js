/* Runs inside the existing Editing Room closure. Storage key and all task IDs stay unchanged. */
const SYNC_BUILD='32.0.0-sync';
DATA.build=SYNC_BUILD;
const Merge=window.ERMapMerge;
const CONFIG_KEY=STORAGE_KEY+':cloud.config.v1';
const BASE_KEY=STORAGE_KEY+':cloud.baseline.v1';
const SAFETY_KEY=STORAGE_KEY+':cloud.recovery.v1';
const TOKEN_KEY=STORAGE_KEY+':cloud.token.v1';
const API='https://api.github.com';
let cloudConfig={repo:'dimitriyvolchenko/planner-data',branch:'main',path:'editing-room-map-progress.json',auto:true,enabled:false,publicOK:false,remember:false};
let cloudToken='',cloudBase=null,cloudFlight=null,cloudTimer=0,cloudPause=0,cloudConflict=null,cloudApplying=false,cloudError='';
let observedCore=Merge.project(state),cloudLast=0;
try{const c=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');if(c&&typeof c==='object')for(const k of Object.keys(cloudConfig))if(typeof c[k]===typeof cloudConfig[k])cloudConfig[k]=c[k];
 cloudToken=sessionStorage.getItem(TOKEN_KEY)||'';if(cloudConfig.remember)cloudToken=localStorage.getItem(TOKEN_KEY)||cloudToken;
 const b=JSON.parse(localStorage.getItem(BASE_KEY)||'null');if(b&&typeof b.target==='string'&&b.core)cloudBase=b;
}catch(e){cloudError='Не удалось прочитать настройки синхронизации. Локальная карта не изменена.';}
if(cloudBase&&cloudBase.at)cloudLast=Number(cloudBase.at)||0;
function cloudTarget(c=cloudConfig){return [c.repo.toLowerCase(),c.branch,c.path].join('\n');}
function usableBase(){return cloudBase&&cloudBase.target===cloudTarget()?cloudBase.core:null;}
function cloudDirty(){return !Merge.equal(Merge.project(state),usableBase()||Merge.empty());}
function cloudGuard(){if(storageBlocked||storageConflict||!persistent)throw new Error('Запись в браузер недоступна или остановлена другой вкладкой. Сначала экспортируй резервную копию; синхронизация приостановлена.');}
function storeCloudConfig(){localStorage.setItem(CONFIG_KEY,JSON.stringify(cloudConfig));}
function checkpoint(reason,remote){
 const item={at:new Date().toISOString(),reason,local:JSON.parse(JSON.stringify(state))};if(remote)item.remote=remote;
 let ring=[];try{ring=JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]');if(!Array.isArray(ring))ring=[];}catch(e){}
 ring.push(item);while(ring.length>3)ring.shift();
 try{localStorage.setItem(SAFETY_KEY,JSON.stringify(ring));}catch(e){throw new Error('Не хватает места для защитной копии. Скачай JSON и освободи место, не удаляя данные этого сайта.');}
}
function cloudMessage(text,bad=false){cloudError=bad?text:'';const e=$('#cloudStatus');if(e){e.textContent=text;e.dataset.bad=String(bad);}paintCloudBadge();}
function paintCloudBadge(){
 const e=$('#cloudBadge');if(!e)return;
 let text='GitHub не подключён',bad=false;
 if(cloudConfig.enabled){
  if(!cloudToken){text='Нужен ключ GitHub';bad=true;}
  else if(cloudFlight)text='Синхронизация…';
  else if(storageBlocked||storageConflict||!persistent){text='Сохранение приостановлено';bad=true;}
  else if(cloudConflict){text='Нужно согласовать изменения';bad=true;}
  else if(!navigator.onLine)text='Без сети · данные на устройстве';
  else if(cloudError){text=cloudDirty()?'Есть неотправленные изменения':'Ошибка связи с GitHub';bad=true;}
  else if(cloudDirty())text=cloudConfig.auto?'Ожидает отправки в GitHub':'Есть локальные изменения';
  else text=cloudLast?'GitHub · '+new Date(cloudLast).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'GitHub подключён';
 }
 e.textContent=text;e.dataset.bad=String(bad);
}
function queueCloud(delay=2200){
 clearTimeout(cloudTimer);paintCloudBadge();
 if(!cloudConfig.enabled||!cloudConfig.auto||!cloudToken||cloudConflict||Date.now()<cloudPause)return;
 cloudTimer=setTimeout(()=>{if(navigator.onLine)syncCloud(false);else paintCloudBadge();},delay);
}
const saveBeforeCloud=save;
save=function(){
 saveBeforeCloud();const now=Merge.project(state);
 if(!cloudApplying&&!Merge.equal(now,observedCore)){
  observedCore=now;if(cloudConflict){cloudConflict=null;$('#cloudConflictBox').hidden=true;}
  queueCloud();
 }
 paintCloudBadge();
};
function validateTarget(c){
 if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(c.repo))throw new Error('Репозиторий укажи как владелец/название.');
 if(!c.branch||c.branch.length>150||/[\x00-\x20?#]/.test(c.branch))throw new Error('Проверь название ветки.');
 const parts=c.path.split('/');
 if(c.path.length>240||!c.path.endsWith('.json')||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||['__proto__','prototype','constructor'].includes(p))||/[\x00-\x20\\?#]/.test(c.path))throw new Error('Укажи отдельный JSON-файл, например editing-room-map-progress.json.');
}
function endpoint(c){return API+'/repos/'+c.repo+'/contents/'+c.path.split('/').map(encodeURIComponent).join('/');}
function encode64(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function decode64(text){const binary=atob(text.replace(/\s/g,''));return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
async function cloudRequest(url,c,opts={}){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
 try{
  const response=await fetch(url,{...opts,cache:'no-store',redirect:'error',signal:abort.signal,headers:{Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(opts.body?{'Content-Type':'application/json'}:{})}});
  const text=await response.text();let result;try{result=JSON.parse(text);}catch(e){throw new Error('GitHub вернул неожиданный ответ. Локальные данные сохранены.');}
  if(!response.ok){
   const error=new Error(response.status===401?'GitHub не принял ключ. Проверь срок действия и доступ к выбранному репозиторию.':response.status===403?'GitHub отказал в доступе: проверь Contents — Read and write или лимит запросов.':response.status===404?'Репозиторий, ветка или файл недоступны этому ключу.':response.status===409||response.status===422?'Файл изменён другим устройством.':'Ошибка GitHub: '+response.status);
   error.status=response.status;
   if(response.status===429||response.headers.get('x-ratelimit-remaining')==='0'){
    cloudPause=Math.max(Date.now()+60000,Number(response.headers.get('x-ratelimit-reset'))*1000||0,Date.now()+(Number(response.headers.get('retry-after'))||0)*1000);
    error.message='Лимит GitHub. Повторная попытка — после '+new Date(cloudPause).toLocaleTimeString('ru-RU')+'. Изменения сохранены на устройстве.';
   }throw error;
  }return result;
 }catch(e){if(e.name==='AbortError')throw new Error('GitHub не ответил вовремя. Изменения остаются на устройстве.');if(e instanceof TypeError)throw new Error('Нет связи с GitHub. Изменения остаются на устройстве.');throw e;}finally{clearTimeout(timer);}
}
function cloudPayload(core){
 return {format:'editing-room-map',schema:1,syncVersion:1,build:SYNC_BUILD,savedAt:new Date().toISOString(),workspaces:Merge.copy(core)};
}
function validateRemote(raw){
 if(!raw||raw.format!=='editing-room-map'||raw.schema!==1||raw.syncVersion>1)throw new Error('Это файл другого приложения или неподдерживаемой версии. Он не будет перезаписан.');
 if(!raw.workspaces||Object.keys(raw.workspaces).sort().join(',')!=='davinci,mobile')throw new Error('В файле нет двух корректных маршрутов. Он не будет перезаписан.');
 for(const name of ['mobile','davinci']){
  const w=raw.workspaces[name];if(!obj(w))throw new Error('Повреждён маршрут '+name+'.');
  if(Object.keys(w).some(k=>!['marks','notes','fields','custom','goal','cursor','scroll'].includes(k)))throw new Error('В файле есть новые поля. Сначала обнови приложение на всех устройствах.');
  for(const k of ['marks','notes','fields','custom'])if(!obj(w[k]))throw new Error('Неверное поле '+name+'/'+k+'.');
  if(typeof w.goal!=='string')throw new Error('Неверная цель сессии в файле.');
 }
 const normalized=normalizeBackup(raw),core=Merge.project(normalized);
 if(!Merge.equal(core,Merge.project(raw)))throw new Error('Файл содержит неизвестные шаги или неверные значения. Для защиты данных синхронизация остановлена.');
 return core;
}
function applyCloudCore(core){
 const before=Merge.project(state);if(Merge.equal(before,core))return;
 const open=$$('.card-details[open]').map(d=>d.dataset.detail),y=window.scrollY,active=document.activeElement;
 let focus=null;if(active){for(const attr of ['data-note','data-field'])if(active.hasAttribute(attr))focus={selector:'['+attr+'="'+active.getAttribute(attr)+'"]',start:active.selectionStart,end:active.selectionEnd};if(active.id==='sessionGoal')focus={selector:'#sessionGoal',start:active.selectionStart,end:active.selectionEnd};}
 for(const name of ['mobile','davinci'])Object.assign(state.workspaces[name],Merge.copy(core[name]));
 cloudApplying=true;saveBeforeCloud();cloudApplying=false;observedCore=Merge.project(state);
 render();applyAppIcon();
 for(const id of open){const d=$('[data-detail="'+id+'"]');if(d){ensureDetails(d);d.open=true;const l=$('.detail-label',d);if(l)l.textContent='Свернуть шаги';}}
 if(focus){const el=$(focus.selector);if(el){el.focus({preventScroll:true});try{el.setSelectionRange(focus.start,focus.end);}catch(e){}}}
 window.scrollTo({top:y,behavior:'auto'});scheduleEdges();
}
function showCloudConflict(conflicts,local,remote,base,c){
 cloudConflict={conflicts,local,remote,base,target:cloudTarget(c)};
 $('#cloudConflictBox').hidden=false;
 $('#cloudConflictList').textContent=conflicts.slice(0,10).map(x=>x.path).join('\n')+(conflicts.length>10?'\n…':'' );
 cloudMessage('Оба устройства изменили одно и то же поле. Ничего не перезаписано. Выбери вариант для спорных полей ниже.',true);
}
async function syncCloud(manual=true,resolution=null){
 if(cloudFlight)return cloudFlight;
 clearTimeout(cloudTimer);
 if(!cloudConfig.enabled||!cloudToken){if(manual)cloudMessage('Заполни настройки и нажми «Подключить и синхронизировать».',true);return false;}
 if(!navigator.onLine){cloudMessage('Без сети: прогресс сохранён в браузере. При возвращении связи повторим отправку.',true);return false;}
 if(Date.now()<cloudPause){paintCloudBadge();return false;}
 const c={...cloudConfig,token:cloudToken};
 cloudFlight=(async()=>{
  try{
   cloudGuard();validateTarget(c);cloudMessage('Проверяю доступ и объединяю изменения…');
   const repo=await cloudRequest(API+'/repos/'+c.repo,c);
   if(repo.private!==true&&repo.private!==false)throw new Error('Не удалось проверить приватность репозитория.');
   if(!repo.private&&!c.publicOK)throw new Error('Репозиторий публичный. Выбери приватный или явно разреши публикацию прогресса и заметок в настройках.');
   await cloudRequest(API+'/repos/'+c.repo+'/branches/'+encodeURIComponent(c.branch),c);
   for(let attempt=0;attempt<3;attempt++){
    cloudGuard();
    let file=null;try{file=await cloudRequest(endpoint(c)+'?ref='+encodeURIComponent(c.branch)+'&t='+Date.now(),c);}catch(e){if(e.status!==404)throw e;}
    if(!file&&usableBase())throw new Error('Ранее сохранённый файл исчез или недоступен. Автоматически создавать его заново не буду. Проверь путь и права ключа.');
    if(!file&&!manual)throw new Error('Файл прогресса пока не создан. Нажми «Синхронизировать сейчас» для первого сохранения.');
    if(file&&(file.encoding!=='base64'||!file.content||file.size>950000))throw new Error('Файл слишком большой или имеет неподдерживаемый формат. Локальные данные не изменены.');
    const raw=file?JSON.parse(decode64(file.content)):null,remote=raw?validateRemote(raw):Merge.empty();
    const local=Merge.project(state),base=usableBase()||Merge.empty();
    const resolve=resolution&&resolution.target===cloudTarget(c)?issue=>{
     const old=resolution.conflicts.find(x=>x.path===issue.path);
     return old&&Merge.equal(old.local,issue.local)&&Merge.equal(old.remote,issue.remote)?resolution.choice:undefined;
    }:null;
    const merged=Merge.merge(base,local,remote,resolve);
    if(merged.conflicts.length){showCloudConflict(merged.conflicts,local,remote,base,c);return false;}
    if(!file&&!confirm('Создать '+c.repo+'/'+c.path+'?\n\nВ файл войдут отметки, заметки, цели и свои шаги обоих маршрутов. Ключ доступа и выбранная иконка не отправляются.')){cloudConfig.auto=false;storeCloudConfig();$('#cloudAuto').checked=false;cloudMessage('Создание отменено. Автосинхронизация выключена.');return false;}
    const payload=cloudPayload(merged.value),text=JSON.stringify(payload);
    if(new TextEncoder().encode(text).length>900000)throw new Error('Прогресс превышает 900 КБ. Экспортируй JSON; автоматическая запись остановлена.');
    if(!Merge.equal(local,merged.value)||!file)checkpoint('Перед синхронизацией',raw);
    let sha=file&&file.sha;
    if(!file||!Merge.equal(remote,merged.value)){
     const body={branch:c.branch,message:'Editing Room: sync both routes',content:encode64(text)};if(sha)body.sha=sha;
     try{const saved=await cloudRequest(endpoint(c),c,{method:'PUT',body:JSON.stringify(body)});if(!saved.content||!saved.content.sha)throw new Error('GitHub не подтвердил версию сохранённого файла. Повтори проверку.');sha=saved.content.sha;}
     catch(e){if((e.status===409||e.status===422)&&attempt<2)continue;throw e;}
    }
    cloudGuard();
    // Preserve edits made while GET/PUT was in flight; they remain pending for the next round.
    const latest=Merge.project(state),rebased=Merge.merge(local,latest,merged.value,()=> 'local').value;
    const nextBase={target:cloudTarget(c),sha,core:merged.value,at:Date.now()};
    // Write the combined local model before acknowledging its cloud baseline.
    applyCloudCore(rebased);cloudGuard();
    localStorage.setItem(BASE_KEY,JSON.stringify(nextBase));cloudBase=nextBase;cloudLast=nextBase.at;
    observedCore=Merge.project(state);cloudConflict=null;$('#cloudConflictBox').hidden=true;
    cloudMessage(cloudDirty()?'Отправленная версия сохранена. Новые изменения ждут следующей отправки.':'Оба маршрута синхронизированы · '+new Date(cloudLast).toLocaleTimeString('ru-RU'));
    return true;
   }
  }catch(e){cloudMessage(e instanceof SyntaxError?'Файл GitHub не является корректным JSON. Ничего не перезаписано.':e.message,true);return false;}
 })();paintCloudBadge();
 try{return await cloudFlight;}finally{cloudFlight=null;paintCloudBadge();if(cloudDirty()&&!cloudError&&!cloudConflict)queueCloud();}
}
function fillCloudForm(){
 $('#cloudRepo').value=cloudConfig.repo;$('#cloudBranch').value=cloudConfig.branch;$('#cloudPath').value=cloudConfig.path;
 $('#cloudToken').value=cloudToken;$('#cloudRemember').checked=cloudConfig.remember;$('#cloudAuto').checked=cloudConfig.auto;$('#cloudPublic').checked=cloudConfig.publicOK;
 paintCloudBadge();
}
async function connectCloud(){
 if(cloudFlight){toast('Сначала дождись завершения текущей синхронизации.');return;}
 try{
  cloudGuard();
  const next={repo:$('#cloudRepo').value.trim(),branch:$('#cloudBranch').value.trim(),path:$('#cloudPath').value.trim(),remember:$('#cloudRemember').checked,auto:$('#cloudAuto').checked,publicOK:$('#cloudPublic').checked,enabled:true};
  validateTarget(next);const token=$('#cloudToken').value.trim();if(!token||/\s/.test(token))throw new Error('Вставь ключ GitHub в поле. Не отправляй его в чат.');
  if(cloudTarget(next)!==cloudTarget()&&cloudBase){checkpoint('Перед сменой места хранения');localStorage.removeItem(BASE_KEY);cloudBase=null;}
  cloudConfig=next;cloudToken=token;storeCloudConfig();
  localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
  (next.remember?localStorage:sessionStorage).setItem(TOKEN_KEY,token);
  cloudConflict=null;cloudError='';cloudPause=0;await syncCloud(true);
 }catch(e){cloudMessage(e.message,true);}
}
function disconnectCloud(){
 if(cloudFlight){toast('Ключ можно отключить после завершения текущего запроса.');return;}
 cloudConfig.enabled=false;cloudToken='';cloudConfig.remember=false;clearTimeout(cloudTimer);
 try{localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);storeCloudConfig();}catch(e){}
 fillCloudForm();cloudMessage('GitHub отключён. Локальный прогресс и файл в репозитории не удалены.');
}
async function forceAppUpdate(){
 const button=$('#forceAppUpdate'),status=$('#updateStatus');if(button.disabled)return;
 button.disabled=true;
 try{
  save();cloudGuard();checkpoint('Перед принудительным обновлением');
  if(!/^https?:$/.test(location.protocol))throw new Error('Для обновления открой опубликованный сайт. Локальный HTML нужно заменить новым файлом.');
  if(!navigator.onLine)throw new Error('Нет сети. Карта остаётся открытой, прогресс сохранён.');
  if(cloudDirty()&&cloudConfig.enabled&&!confirm('Есть локальные изменения, ещё не подтверждённые GitHub.\nОни сохранены на устройстве и останутся после обновления. Продолжить?'))return;
  if(cloudFlight)await cloudFlight;
  const url=new URL(location.href);url.searchParams.set('er_update',Date.now().toString());
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);let response;
  status.textContent='Проверяю свежую версию сайта…';
  try{response=await fetch(url.href,{cache:'reload',signal:abort.signal,redirect:'error'});}finally{clearTimeout(timer);}
  if(!response.ok)throw new Error('Сервер недоступен. Приложение не перезагружено.');
  const html=await response.text();if(!html.includes('editing-room-map')||!html.includes('id="app-data"')||html.length<10000)throw new Error('Сервер вернул не Editing Room. Обновление отменено.');
  // Only this application's workers/caches. Never clear storage or other GitHub Pages apps.
  const scope=new URL('.',location.href).href;
  if('serviceWorker' in navigator)for(const reg of await navigator.serviceWorker.getRegistrations())if(reg.scope===scope)await reg.unregister();
  if('caches' in window)for(const key of await caches.keys())if(key.startsWith('editing-room-map-')||key.startsWith('er-map-'))await caches.delete(key);
  save();cloudGuard();status.textContent='Прогресс сохранён. Открываю свежую версию…';location.replace(url.href);
 }catch(e){status.textContent=e.name==='AbortError'?'Сайт не ответил вовремя. Карта и прогресс сохранены.':e.message;}
 finally{button.disabled=false;}
}
const cloudStyle=document.createElement('style');cloudStyle.textContent=`
.er-sync-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.er-sync-fields label{font-size:12px;color:var(--muted);display:block;min-width:0}.er-sync-fields .wide{grid-column:1/-1}.er-sync-fields input{display:block;width:100%;font-size:16px;min-height:44px;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fffefa;color:var(--ink)}.er-sync-check{display:flex;gap:10px;align-items:flex-start;font-size:12px;line-height:1.6;margin:12px 0}.er-sync-check input{width:19px;height:19px;flex:none;accent-color:#d9824c;margin:2px 0}.er-sync-status{padding:12px 14px;margin:14px 0;border-radius:12px;background:#eef2e8;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.er-sync-status[data-bad=true]{background:#f8e9dd;color:#8d422a}.er-sync-actions{display:flex;gap:9px;flex-wrap:wrap}.er-sync-actions button{font-size:12px}.er-conflict{background:#fff2db;border:1px solid #edd5ac;border-radius:15px;padding:14px;margin-top:14px}.er-conflict[hidden]{display:none}.er-conflict pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 inherit}.cloud-badge{grid-column:2/-1;justify-self:end;display:block;max-width:100%;font-size:10px;line-height:1.5;margin-top:6px;color:#6b8061}.cloud-badge[data-bad=true]{color:#a45c37}.er-sync-note{font-size:11px!important;line-height:1.8!important}.er-cloud-details>summary{font-weight:650;cursor:pointer;padding:5px 0;min-height:40px}.er-cloud-details[open]>summary{margin-bottom:8px}@media(max-width:480px){.er-sync-fields{grid-template-columns:1fr}.er-sync-fields .wide{grid-column:auto}.er-sync-actions button{flex:1 1 140px}.cloud-badge{font-size:9px}.er-sync-check{font-size:11px}}`;
document.head.appendChild(cloudStyle);
const panel=document.createElement('div');panel.className='modal-section';panel.id='cloudPanel';
panel.innerHTML=`<h3>Сохранение между устройствами</h3><p>Сначала — на этом устройстве. Затем — в отдельный JSON-файл GitHub. Mobile и DaVinci передаются вместе; иконка, прокрутка и текущий раздел остаются локальными.</p><div id="cloudStatus" class="er-sync-status" role="status" aria-live="polite">Подключи GitHub один раз на каждом устройстве. Без подключения работает локальное сохранение.</div><div class="er-sync-actions"><button class="primary yellow" id="cloudNow" type="button">Синхронизировать сейчас</button><button class="secondary" id="cloudRecovery" type="button">Защитная копия</button></div><details class="er-cloud-details" id="cloudSettings"><summary>Настройки GitHub</summary><form id="cloudForm" autocomplete="off"><div class="er-sync-fields"><label class="wide">Репозиторий<input id="cloudRepo" autocomplete="off" spellcheck="false" required></label><label>Ветка<input id="cloudBranch" autocomplete="off" spellcheck="false" required></label><label>Файл прогресса<input id="cloudPath" autocomplete="off" spellcheck="false" required></label><label class="wide">Ключ доступа GitHub<input id="cloudToken" type="password" autocomplete="new-password" spellcheck="false" placeholder="github_pat_…" required></label></div><label class="er-sync-check"><input id="cloudRemember" type="checkbox"><span>Запомнить ключ в этом браузере. Другие скрипты того же сайта могут читать его; используй ключ с доступом только к выбранному репозиторию.</span></label><label class="er-sync-check"><input id="cloudAuto" type="checkbox"><span>Автосинхронизация после изменений и при возвращении в открытое приложение.</span></label><label class="er-sync-check"><input id="cloudPublic" type="checkbox"><span>Разрешаю сохранять заметки и прогресс в публичный репозиторий. Для приватного репозитория это разрешение не требуется.</span></label><p class="er-sync-note">Предложен твой отдельный planner-data, файл editing-room-map-progress.json. Существующие файлы других приложений не меняются. Для ключа: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → выбранный репозиторий → Contents: Read and write. Не вставляй ключ в код и не присылай его в чат. Без «Запомнить» ключ действует только в этой вкладке.</p><div class="er-sync-actions"><button class="primary" type="submit">Подключить и синхронизировать</button><button class="secondary" id="cloudDisconnect" type="button">Отключить ключ</button></div></form></details><div class="er-conflict" id="cloudConflictBox" hidden><h3>Нужен твой выбор</h3><p>Спорные поля:</p><pre id="cloudConflictList"></pre><p>Независимые изменения сохранятся в любом случае. Выбор касается только полей выше.</p><div class="er-sync-actions"><button class="secondary" type="button" data-resolve-cloud="local">В спорных — мои</button><button class="secondary" type="button" data-resolve-cloud="remote">В спорных — GitHub</button><button class="secondary" type="button" id="cloudConflictExport">Скачать обе версии</button></div></div><p class="er-sync-note">Закрытое приложение не синхронизируется гарантированно в фоне. После возвращения сети открой его и проверь статус. Очистка данных сайта может удалить неотправленные записи.</p>`;
const dataBody=$('#dataDialog .dialog-body');dataBody.insertBefore(panel,dataBody.children[1]||null);
const updatePanel=document.createElement('div');updatePanel.className='modal-section';updatePanel.innerHTML=`<h3>Обновление приложения</h3><p>Версия ${SYNC_BUILD}. Перезагрузка свежей страницы без удаления прогресса, ключа и иконки. Сначала автоматически создаётся локальная защитная копия.</p><button class="secondary" id="forceAppUpdate" type="button">Принудительно обновить</button><p id="updateStatus" class="er-sync-note" role="status" aria-live="polite"></p>`;
dataBody.insertBefore(updatePanel,dataBody.lastElementChild);
const badge=document.createElement('span');badge.id='cloudBadge';badge.className='cloud-badge';badge.setAttribute('role','status');$('#storageStatus').parentElement.appendChild(badge);
$('#cloudForm').addEventListener('submit',e=>{e.preventDefault();connectCloud();});
$('#cloudNow').addEventListener('click',()=>syncCloud(true));
$('#cloudAuto').addEventListener('change',()=>{cloudConfig.auto=$('#cloudAuto').checked;try{storeCloudConfig();}catch(e){cloudMessage('Не удалось сохранить настройку в браузере.',true);}queueCloud(300);});
$('#cloudDisconnect').addEventListener('click',disconnectCloud);
$('#forceAppUpdate').addEventListener('click',forceAppUpdate);
$('#cloudRecovery').addEventListener('click',()=>{try{const ring=JSON.parse(localStorage.getItem(SAFETY_KEY)||'[]'),last=ring[ring.length-1];if(!last){toast('Защитных копий пока нет. Используй «Сохранить копию».');return;}download('Editing_Room_recovery.json',JSON.stringify(last.local,null,2));toast('Последняя защитная копия подготовлена. Восстановление — через «Импорт JSON».');}catch(e){toast('Не удалось прочитать защитную копию. Экспортируй текущие данные.');}});
$('#cloudConflictExport').addEventListener('click',()=>{if(cloudConflict)download('Editing_Room_conflict.json',JSON.stringify({local:cloudPayload(cloudConflict.local),remote:cloudPayload(cloudConflict.remote)},null,2));});
$$('[data-resolve-cloud]').forEach(button=>button.addEventListener('click',()=>{if(cloudConflict)syncCloud(true,{...cloudConflict,choice:button.dataset.resolveCloud});}));
$('#dataBtn').addEventListener('click',fillCloudForm);
window.addEventListener('online',()=>queueCloud(300));window.addEventListener('offline',paintCloudBadge);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueCloud(300);});
setInterval(()=>{if(document.visibilityState==='visible')queueCloud(500);},60000);
fillCloudForm();if(!cloudConfig.enabled)$('#cloudSettings').open=true;
if(cloudConfig.enabled&&cloudConfig.auto&&cloudToken)queueCloud(1200);
const oldLocal=$('#dataDialog .modal-section p');if(oldLocal)oldLocal.textContent='Галочки, цели, заметки и свои шаги сразу сохраняются в этом браузере. После подключения GitHub они синхронизируются между устройствами. Скачивай резервный JSON перед очисткой данных браузера.';
const meta=document.createElement('meta');meta.name='editing-room-build';meta.content=SYNC_BUILD;document.head.appendChild(meta);
const about=$('#aboutDialog .dialog-body');if(about){const heading=$('p b',about);if(heading)heading.textContent='Editing Room · Map Edition 32.0 · Sync';for(const p of $$('p',about))if(p.textContent.includes('Автоматической синхронизации нет.'))p.textContent='Ключ локального прогресса не изменён: editing-room.map.v30. GitHub подключается в «Твои данные». Настройки и ключ доступа хранятся отдельно и не входят в резервный JSON. Локальная и облачная копии объединяются; спорные поля требуют выбора.';}
const footer=$('.footer-meta');if(footer)footer.textContent='MAP EDITION · 32.0 · MOBILE + DAVINCI · LOCAL + GITHUB';
// Read-only support surface: no state payloads or credentials are exposed.
window.EditingRoomCloud=Object.freeze({build:SYNC_BUILD,status:()=>({enabled:cloudConfig.enabled,auto:cloudConfig.auto,pending:cloudDirty(),busy:!!cloudFlight,conflict:!!cloudConflict,lastSuccess:cloudLast})});
