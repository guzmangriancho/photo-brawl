'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/services/storageService.ts'),'utf8');

function fixture(id,name='LUCHADOR'){
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/re0AAAAASUVORK5CYII=';
 return {id,fighterName:name,createdAt:1730000000000,archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',
  stats:{hp:25,speed:25,power:25,technique:25},moveset:{
   lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'OVERHEAD_SMASH'},
   specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL'},specialForward:{name:'DASH',mechanic:'ARMORED_SHOULDER_DASH'},
   specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT'},ultimateSuper:{name:'FIN',mechanic:'MULTI_HIT_RUSH_COMBO'}},
  spriteSheetDataUrl:png,portraitDataUrl:png};
}

function setup(initial){
 const records=new Map(initial.map(row=>[row.id,structuredClone(row)]));
 const draft={id:'current',name:'MI BORRADOR'};
 const stores={custom_fighters:records,creator_drafts:new Map([[draft.id,draft]])};
 const db={close(){},objectStoreNames:{contains:key=>key in stores,},createObjectStore(){throw new Error('No debe recrear almacenes existentes');},
  transaction(name){
   const map=stores[name];if(!map)throw Error('unknown store');
   let pending=0,finished=false;
   const tx={oncomplete:null,onerror:null,onabort:null,error:null,
    objectStore(){return {
     getAll(){
      const req={result:null,onsuccess:null};pending++;
      setImmediate(()=>{req.result=[...map.values()].map(x=>structuredClone(x));req.onsuccess?.();done();});
      return req;
     },
     put(value){pending++;setImmediate(()=>{map.set(value.id,structuredClone(value));done();});},
     delete(id){pending++;setImmediate(()=>{map.delete(id);done();});},
    };},};
   function done(){pending--;if(pending===0&&!finished){finished=true;setImmediate(()=>tx.oncomplete?.());}}
   return tx;
  }};
 global.window={indexedDB:null};
 global.indexedDB={open(name,version){
  assert.equal(name,'PhotoBrawl16BitDB');assert.equal(version,2);
  const req={result:db,onsuccess:null,onblocked:null,onerror:null};
  setImmediate(()=>req.onsuccess?.());return req;
 }};
 window.indexedDB=global.indexedDB;
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};new Function('module','exports','require',js)(module,module.exports,require);
 return {svc:module.exports,records,stores};
}

test('V15 IndexedDB name, version and original rows survive V16.1',async()=>{
 const a=fixture('custom_one','P1');const b=fixture('custom_two','P2');
 const {svc,records,stores}=setup([a,b]);
 const before=await svc.getAllCustomFighters();
 assert.equal(before.length,2);
 const backup=await svc.exportLocalFightersBackup();
 assert.equal(backup.count,2);
 const fighters=svc.readLocalFightersBackup(await backup.blob.text());
 assert.deepEqual(fighters,[a,b]);
 const once=await svc.mergeCustomFighters(fighters);
 assert.equal(once.added.length,0);assert.equal(once.unchanged,2);
 assert.deepEqual(records.get('custom_one'),a);
 assert.equal(stores.creator_drafts.get('current').name,'MI BORRADOR');
});

test('a cloud restore or file import with conflicting ID NEVER overwrites old art or stats',async()=>{
 const a=fixture('custom_one','ORIGINAL');
 const {svc,records}=setup([a]);
 const changed={...fixture('custom_one','NUEVO'),stats:{hp:35,speed:15,power:25,technique:25}};
 const report=await svc.mergeCustomFighters([changed]);
 assert.equal(report.added.length,1);assert.equal(report.conflicts,1);
 assert.notEqual(report.added[0].id,'custom_one');
 assert.deepEqual(records.get('custom_one'),a);
 assert.equal(records.size,2);
 const repeat=await svc.mergeCustomFighters([changed]);
 assert.equal(repeat.added.length,0);assert.equal(repeat.unchanged,1);
 assert.equal(records.size,2);
});

test('malformed backup or tutorial fighters are rejected without deleting anything',async()=>{
 const a=fixture('custom_one');const {svc,records}=setup([a]);
 assert.throws(()=>svc.readLocalFightersBackup('{'),/JSON válido/);
 assert.throws(()=>svc.readLocalFightersBackup(JSON.stringify({format:'other',fighters:[a]})),/compatible/);
 const bad={...fixture('preset_foo'),isPreset:true};
 await assert.rejects(()=>svc.mergeCustomFighters([bad]),/inválidos/);
 assert.equal(records.size,1);assert.deepEqual(records.get(a.id),a);
});

test('V16 cloud restore and backup controls are non-destructive by design',()=>{
 const account=fs.readFileSync(path.join(root,'src/components/AccountPanel.tsx'),'utf8');
 const cloud=fs.readFileSync(path.join(root,'src/services/communityService.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(account,/mergeCustomFighters\(result\.fighters\)/);
 assert.match(account,/mergeCustomFighters\(fighters\)/);
 assert.match(account,/EXPORTAR ARCHIVO/);
 assert.match(account,/IMPORTAR ARCHIVO/);
 assert.match(cloud,/if\(await cloudEntry\(fighter\.id\)\)/); // skip existing remote records
 assert.doesNotMatch(app,/await saveCustomFighter\(repaired\)/); // preserve original art
});
