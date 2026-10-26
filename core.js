/* Editing Room Map: baseline-based, deletion-aware three-way merge. No credentials. */
(function(root){
'use strict';
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safe=k=>!['__proto__','prototype','constructor'].includes(k);
function stable(v){
 if(v===undefined)return 'undefined';
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
const equal=(a,b)=>stable(a)===stable(b);
function project(state){
 const out={};
 for(const name of ['mobile','davinci']){
  const w=state.workspaces[name],r={marks:{},notes:{},fields:{},custom:{},goal:w.goal||''};
  for(const k of Object.keys(w.marks||{}))if(w.marks[k])r.marks[k]=true;
  for(const field of ['notes','fields'])for(const [k,v] of Object.entries(w[field]||{}))if(v!=='')r[field][k]=v;
  for(const [k,v] of Object.entries(w.custom||{}))if(v.length)r.custom[k]=copy(v);
  out[name]=r;
 }
 return out;
}
function empty(){return project({workspaces:{mobile:{},davinci:{}}});}
/* Only competing edits of the same value require a choice. All other edits survive. */
function merge(base,local,remote,resolver){
 const conflicts=[];
 function walk(b,l,r,path){
  if(equal(l,r))return copy(l);
  if(equal(l,b))return copy(r);
  if(equal(r,b))return copy(l);
  if(object(l)&&object(r)&&(object(b)||b===undefined)){
   const out={};b=b||{};
   for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
    if(!safe(k))throw new Error('Недопустимое имя поля в файле прогресса.');
    const v=walk(b[k],l[k],r[k],path.concat(k));if(v!==undefined)out[k]=v;
   }
   return out;
  }
  if(Array.isArray(l)&&Array.isArray(r)&&(Array.isArray(b)||b===undefined)){
   const keyed=a=>a.every((v,i)=>object(v)&&typeof v.id==='string'&&safe(v.id)&&a.findIndex(x=>x.id===v.id)===i);
   b=b||[];
   if(keyed(b)&&keyed(l)&&keyed(r)){
    const bm=new Map(b.map(v=>[v.id,v])),lm=new Map(l.map(v=>[v.id,v])),rm=new Map(r.map(v=>[v.id,v]));
    const out=new Map();
    for(const id of new Set([...bm.keys(),...lm.keys(),...rm.keys()])){
     const v=walk(bm.get(id),lm.get(id),rm.get(id),path.concat(id));if(v!==undefined)out.set(id,v);
    }
    /* This app adds/removes custom steps, but has no reordering control. Keep local order; append remote additions. */
    const ids=[...new Set([...l.map(x=>x.id),...r.map(x=>x.id)])];
    return ids.filter(id=>out.has(id)).map(id=>out.get(id));
   }
  }
  const issue={path:path.join(' / '),base:copy(b),local:copy(l),remote:copy(r)};
  const choice=resolver&&resolver(issue);
  if(choice==='local')return copy(l);
  if(choice==='remote')return copy(r);
  conflicts.push(issue);return copy(l);
 }
 const value=walk(base,local,remote,[]);
 return {value,conflicts};
}
const api={copy,stable,equal,project,empty,merge};
if(typeof module==='object'&&module.exports)module.exports=api;else root.ERMapMerge=api;
})(typeof window==='object'?window:globalThis);
