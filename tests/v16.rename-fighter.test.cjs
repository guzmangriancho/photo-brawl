'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/services/storageService.ts'),'utf8');
const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/re0AAAAASUVORK5CYII=';
function fighter(id='mine',name='ANTIGUO'){
 return {id,fighterName:name,createdAt:1730000000000,archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',
  stats:{hp:25,speed:25,power:25,technique:25},moveset:{
   lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'OVERHEAD_SMASH'},
   specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL'},specialForward:{name:'RUSH',mechanic:'ARMORED_SHOULDER_DASH'},
   specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT'},ultimateSuper:{name:'FIN',mechanic:'MULTI_HIT_RUSH_COMBO'}},
  spriteSheetDataUrl:tinyPng,portraitDataUrl:tinyPng,scaleMultiplier:1.1};
}
function service(initial){
 const store=new Map(initial.map(x=>[x.id,structuredClone(x)]));
 let tx;
 const db={close(){},objectStoreNames:{contains:()=>true},transaction(){
  let outstanding=0,completed=false;
  tx={oncomplete:null,onerror:null,onabort:null,error:null,abort(){setImmediate(()=>tx.onabort?.())},objectStore(){
   return {get(id){const req={result:null,onsuccess:null};outstanding++;setImmediate(()=>{req.result=structuredClone(store.get(id));req.onsuccess?.();finish();});return req;},
    getAll(){const req={result:null,onsuccess:null};outstanding++;setImmediate(()=>{req.result=[...store.values()].map(x=>structuredClone(x));req.onsuccess?.();finish();});return req;},
    put(value){outstanding++;setImmediate(()=>{store.set(value.id,structuredClone(value));finish();});}};
  }};
  function finish(){outstanding--;if(!completed&&outstanding===0){completed=true;setImmediate(()=>tx.oncomplete?.());}}
  return tx;
 }};
 global.window={indexedDB:{}};
 global.indexedDB={open(name,version){assert.equal(name,'PhotoBrawl16BitDB');assert.equal(version,2);const req={result:db,onsuccess:null};setImmediate(()=>req.onsuccess?.());return req;}};
 window.indexedDB=global.indexedDB;
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const m={exports:{}};new Function('module','exports','require',js)(m,m.exports,require);
 return {api:m.exports,store};
}
test('rename changes only display name + timestamp, preserving original assets, moves, stats, and id',async()=>{
 const before=fighter();const {api,store}=service([before]);
 const after=await api.renameCustomFighter('mine','  maga    neón ');
 assert.equal(after.fighterName,'MAGA NEÓN');assert.equal(after.id,before.id);assert.ok(after.nameUpdatedAt>0);
 const {fighterName:_,nameUpdatedAt:__,...rest}=after;
 const {fighterName:oldName,...originalRest}=before;
 assert.deepEqual(rest,originalRest);
 assert.deepEqual(store.get('mine'),after);
 assert.equal((await api.getAllCustomFighters())[0].fighterName,'MAGA NEÓN');
});
test('reject empty/too-long names, missing fighters and presets; do not delete records',async()=>{
 const {api,store}=service([fighter(),{...fighter('preset_0'),isPreset:true}]);
 await assert.rejects(()=>api.renameCustomFighter('mine','   '),/Escribe un nombre/);
 await assert.rejects(()=>api.renameCustomFighter('mine','A'.repeat(21)),/20 caracteres/);
 await assert.rejects(()=>api.renameCustomFighter('none','OTRO'),/no existe/);
 await assert.rejects(()=>api.renameCustomFighter('preset_0','OTRO'),/no se puede/);
 assert.equal(store.get('mine').fighterName,'ANTIGUO');assert.equal(store.size,2);
});
test('restoring a newer cloud name updates the matching fighter without creating a duplicate',async()=>{
 const old=fighter();const newer={...old,fighterName:'NUEVO',nameUpdatedAt:1700000000000};
 const {api,store}=service([old]);
 const report=await api.mergeCustomFighters([newer]);
 assert.equal(report.updated.length,1);assert.equal(report.added.length,0);assert.equal(report.conflicts,0);
 assert.equal(store.size,1);assert.equal(store.get('mine').fighterName,'NUEVO');
 assert.deepEqual(store.get('mine').stats,old.stats);
 const repeat=await api.mergeCustomFighters([old]);
 assert.equal(repeat.added.length,0);assert.equal(repeat.updated.length,0);
 assert.equal(store.get('mine').fighterName,'NUEVO');
});
test('a conflicting fighter with the same id but different combat stats is always preserved as a separate copy',async()=>{
 const old=fighter();const {api,store}=service([old]);
 const other={...old,fighterName:'OTRO',nameUpdatedAt:1900000000000,stats:{hp:35,speed:15,power:25,technique:25}};
 const report=await api.mergeCustomFighters([other]);
 assert.equal(report.conflicts,1);assert.equal(report.added.length,1);
 assert.equal(store.size,2);assert.deepEqual(store.get('mine'),old);
});
test('UI and cloud sync update display names without reuploading artwork or changing the fighter id',()=>{
 const ui=fs.readFileSync(path.join(root,'src/components/CharacterSelect.tsx'),'utf8');
 const cloud=fs.readFileSync(path.join(root,'src/services/communityService.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(ui,/CAMBIAR NOMBRE/);
 assert.match(ui,/renameCustomFighter\(renamingId,renamingValue\)/);
 assert.match(ui,/syncRenamedFighter\(updated\)/);
 assert.match(cloud,/\.update\(\{fighter_name:fighter\.fighterName,fighter_data,updated_at:/);
 assert.match(app,/onFighterRenamed=\{handleFighterRenamed\}/);
});

test('published Supabase fighter is renamed in place without uploading artwork',async()=>{
 const source=fs.readFileSync(path.join(root,'src/services/communityService.ts'),'utf8');
 const existing={id:'cloud-1',owner_id:'owner',local_id:'mine',fighter_name:'ANTIGUO',is_public:true,
  fighter_data:{...fighter(),nameUpdatedAt:0},public_portrait_path:'owner/cloud-1/portrait.png',public_sheet_path:'owner/cloud-1/sheet.png'};
 let updates=0;
 const db={
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  storage:{from(){throw new Error('No se deben volver a subir imágenes al renombrar.');}},
  from(table){
   assert.equal(table,'fighters');
   let result=existing;
   return {
    select(){return this;},eq(){return this;},
    update(fields){updates++;Object.assign(result,fields);return this;},
    async maybeSingle(){return {data:result,error:null};}
   };
  }
 };
 const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const m={exports:{}};
 new Function('module','exports','require',transpiled)(m,m.exports,name=>{
  if(name==='./supabaseClient')return {supabase:db};
  throw Error('Import inesperado: '+name);
 });
 const name=fighter('mine','MAGA NEÓN');name.nameUpdatedAt=1900000000000;
 const result=await m.exports.syncRenamedFighter(name);
 assert.equal(result,'synced');assert.equal(updates,1);
 assert.equal(existing.id,'cloud-1');assert.equal(existing.is_public,true);
 assert.equal(existing.fighter_name,'MAGA NEÓN');
 assert.equal(existing.fighter_data.fighterName,'MAGA NEÓN');
 assert.equal(existing.public_sheet_path,'owner/cloud-1/sheet.png');
});
