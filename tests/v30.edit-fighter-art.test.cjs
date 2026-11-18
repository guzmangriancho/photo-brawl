'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/re0AAAAASUVORK5CYII=';
const different='data:image/png;base64,AAAA';
function fighter(id='mine'){
 return {id,fighterName:'ANTIGUO',createdAt:1730000000000,archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',
  stats:{hp:25,speed:30,power:18,technique:19},moveset:{
   lightNormal:{name:'JAB'},heavyNormal:{name:'SMASH'},specialNeutral:{name:'SHOT'},
   specialForward:{name:'RUSH'},specialUp:{name:'UP'},ultimateSuper:{name:'FIN'}},
  spriteSheetDataUrl:png,portraitDataUrl:png,spriteSheetLastCell:'KO',spriteSheetLayoutVersion:2,scaleMultiplier:1};
}
function storage(initial){
 const store=new Map(initial.map(x=>[x.id,structuredClone(x)]));let tx;
 const db={close(){},objectStoreNames:{contains:()=>true},transaction(){
  let outstanding=0,completed=false;
  tx={oncomplete:null,onerror:null,onabort:null,error:null,abort(){setImmediate(()=>tx.onabort?.())},objectStore(){return {
   get(id){const r={result:null,onsuccess:null};outstanding++;setImmediate(()=>{r.result=structuredClone(store.get(id));r.onsuccess?.();finish();});return r;},
   getAll(){const r={result:null,onsuccess:null};outstanding++;setImmediate(()=>{r.result=[...store.values()].map(x=>structuredClone(x));r.onsuccess?.();finish();});return r;},
   put(value){outstanding++;setImmediate(()=>{store.set(value.id,structuredClone(value));finish();});}
  };}};
  function finish(){outstanding--;if(!completed&&outstanding===0){completed=true;setImmediate(()=>tx.oncomplete?.());}}
  return tx;
 }};
 global.indexedDB={open(){const r={result:db,onsuccess:null};setImmediate(()=>r.onsuccess?.());return r;}};
 global.window={indexedDB:global.indexedDB};
 const code=ts.transpileModule(read('src/services/storageService.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};new Function('module','exports','require',code)(module,module.exports,require);
 return {api:module.exports,store};
}
function cloudMock(publicStatus=true,failBucket=''){
 const row={id:'cloud-1',owner_id:'owner',local_id:'mine',fighter_name:'ANTIGUO',archetype:'SHOTO_BALANCED',
  fighter_data:{...fighter(),artUpdatedAt:0},is_public:publicStatus,updated_at:'2026-11-18T00:00:00Z',
  private_portrait_path:'owner/cloud-1/portrait.png',private_sheet_path:'owner/cloud-1/sheet.png',
  public_portrait_path:publicStatus?'owner/cloud-1/portrait.png':null,public_sheet_path:publicStatus?'owner/cloud-1/sheet.png':null};
 const calls={uploads:[],deletes:[],updates:[]};
 const db={
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  storage:{from(bucket){return {
   upload:async(path,blob)=>{calls.uploads.push({bucket,path,size:blob.size});return {error:bucket===failBucket?new Error('Upload failed'):null};},
   remove:async(paths)=>{calls.deletes.push({bucket,paths});return {error:null};}
  };}},
  from(table){assert.equal(table,'fighters');return {
    select(){return this;},eq(key,value){this.filters??=[];this.filters.push([key,value]);return this;},
    update(fields){this.pending=fields;return this;},
    async maybeSingle(){
      if(this.pending){calls.updates.push({fields:this.pending,filters:this.filters});Object.assign(row,this.pending);return {data:{id:row.id},error:null};}
      return {data:structuredClone(row),error:null};
    }
  };}
 };
 const compiled=ts.transpileModule(read('src/services/communityService.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};new Function('module','exports','require',compiled)(module,module.exports,k=>{
  if(k==='./supabaseClient')return {supabase:db};throw Error('Unexpected require '+k);
 });
 return {...calls,row,api:module.exports};
}
test('edited portrait and sheet keep id, moves, stats, and the original createdAt',async()=>{
 const before=fighter();const {api,store}=storage([before]);
 const after=await api.editCustomFighter('mine',{fighterName:'NUEVO',portraitDataUrl:different,spriteSheetDataUrl:different,spriteSheetLastCell:'PROJECTILE'});
 assert.equal(after.id,before.id);assert.equal(after.createdAt,before.createdAt);
 assert.equal(after.fighterName,'NUEVO');assert.ok(after.nameUpdatedAt>0);assert.ok(after.artUpdatedAt>0);
 assert.equal(after.portraitDataUrl,different);assert.equal(after.spriteSheetDataUrl,different);
 assert.equal(after.spriteSheetKeyVersion,3);assert.equal(after.spriteSheetLastCell,'PROJECTILE');
 assert.deepEqual(after.stats,before.stats);assert.deepEqual(after.moveset,before.moveset);
 assert.equal(store.size,1);
});
test('portrait-only change retains sprites, and editor rejects presets and invalid artwork',async()=>{
 const {api,store}=storage([fighter(),{...fighter('preset_1'),isPreset:true}]);
 const after=await api.editCustomFighter('mine',{fighterName:'ANTIGUO',portraitDataUrl:different});
 assert.equal(after.spriteSheetDataUrl,png);assert.equal(after.portraitDataUrl,different);
 assert.equal(after.nameUpdatedAt,undefined);assert.ok(after.artUpdatedAt>0);
 await assert.rejects(api.editCustomFighter('mine',{fighterName:'ANTIGUO',portraitDataUrl:'bad'}),/PNG/);
 await assert.rejects(api.editCustomFighter('preset_1',{fighterName:'NO'}),/no se puede editar/);
 await assert.rejects(api.editCustomFighter('none',{fighterName:'NO'}),/no se puede editar/);
 assert.equal(store.size,2);
});
test('restoring revised artwork merges into the same fighter rather than duplicating it',async()=>{
 const original=fighter();const {api,store}=storage([original]);
 const revised={...original,portraitDataUrl:different,artUpdatedAt:1900000000000};
 const report=await api.mergeCustomFighters([revised]);
 assert.equal(report.updated.length,1);assert.equal(report.added.length,0);assert.equal(report.conflicts,0);
 assert.equal(store.size,1);assert.equal(store.get('mine').portraitDataUrl,different);
 const repeat=await api.mergeCustomFighters([original]);
 assert.equal(repeat.added.length,0);assert.equal(store.size,1);
});
test('restoring remote portrait and newer local name merges edit timestamps independently',async()=>{
 const local={...fighter(),fighterName:'LOCAL',nameUpdatedAt:1950000000000};
 const remote={...fighter(),portraitDataUrl:different,artUpdatedAt:1900000000000};
 const {api,store}=storage([local]);const result=await api.mergeCustomFighters([remote]);
 assert.equal(result.updated.length,1);
 assert.equal(store.get('mine').fighterName,'LOCAL');assert.equal(store.get('mine').portraitDataUrl,different);
});
test('published artwork updates the same cloud fighter and both bucket paths, preserving privacy',async()=>{
 const {api,row,uploads,updates}=cloudMock(true);
 const next={...fighter(),portraitDataUrl:different,artUpdatedAt:1900000000000};
 assert.equal(await api.syncFighterArtwork(next),'synced');
 assert.equal(uploads.length,4);assert.equal(uploads.filter(u=>u.bucket==='fighter-public').length,2);
 assert.equal(updates.length,1);assert.equal(row.id,'cloud-1');assert.equal(row.is_public,true);
 assert.ok(row.private_portrait_path.includes('edit-1900000000000'));
 assert.equal(row.public_portrait_path,row.private_portrait_path);
 assert.equal(row.fighter_data.artUpdatedAt,1900000000000);
 assert.ok(updates[0].filters.some(x=>x[0]==='owner_id'&&x[1]==='owner'));
 assert.ok(updates[0].filters.some(x=>x[0]==='updated_at'));
});
test('private fighter never uploads to the public bucket',async()=>{
 const {api,row,uploads}=cloudMock(false);
 const next={...fighter(),spriteSheetDataUrl:different,artUpdatedAt:1900000000000};
 assert.equal(await api.syncFighterArtwork(next),'synced');
 assert.equal(uploads.length,2);
 assert.ok(uploads.every(u=>u.bucket==='fighter-private'));
 assert.equal(row.is_public,false);assert.equal(row.public_portrait_path,null);
});
test('failed upload does not change old cloud references or publish private images',async()=>{
 const {api,row,updates,deletes}=cloudMock(true,'fighter-public');
 const oldPaths=[row.private_portrait_path,row.private_sheet_path,row.public_portrait_path,row.public_sheet_path];
 await assert.rejects(api.syncFighterArtwork({...fighter(),artUpdatedAt:1900000000000}),/Upload failed/);
 assert.equal(updates.length,0);
 assert.deepEqual([row.private_portrait_path,row.private_sheet_path,row.public_portrait_path,row.public_sheet_path],oldPaths);
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(deletes.every(x=>x.paths.every(p=>!oldPaths.includes(p))));
});
test('editor offers name, upload and clipboard paste for both assets, with original sprite processing',()=>{
 const ui=read('src/components/CharacterSelect.tsx');
 assert.match(ui,/CAMBIAR NOMBRE/);assert.match(ui,/EDITAR LUCHADOR/);
 assert.match(ui,/processSpriteSheet\(raw/);assert.match(ui,/processPortrait\(raw/);
 assert.match(ui,/navigator\.clipboard\?\.read/);assert.match(ui,/onPaste=\{e=>onEditedArtPaste/);
 assert.match(ui,/syncFighterArtwork\(updated\)/);
 assert.match(read('src/components/arcadeMenus.css'),/\.pb-edit-art-grid\{display:grid;grid-template-columns:repeat\(2/);
});
