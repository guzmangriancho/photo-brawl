'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/services/automaticFighterMigration.ts'),'utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function harness(initial){
 const fighters=[...initial];
 const store=new Map();
 const listeners={};
 let onAuth=null;
 let signedIn=null;
 const observed=[];
 const fakeSupabase={auth:{async getUser(){return {data:{user:signedIn?{id:signedIn}:null},error:null};},onAuthStateChange(callback){onAuth=callback;return{data:{subscription:{unsubscribe(){onAuth=null;}}}};}}};
 const win={addEventListener(event,cb){(listeners[event]??=new Set()).add(cb);},removeEventListener(event,cb){listeners[event]?.delete(cb);},fire(event){for(const cb of listeners[event]||[])cb();}};
 const modules={
   './supabaseClient':{supabase:fakeSupabase},
   './storageService':{async getAllCustomFighters(){return [...fighters];}},
   './communityService':{async backupMissingLocalFighters(rows,progress,uid){
     observed.push({ids:rows.map(x=>x.id),uid});
     rows.forEach((_,i)=>progress?.(i+1,rows.length));
     return{uploaded:rows.length,existing:0,failed:[]};
   }},
 };
 const sandbox=new Function('require','module','exports','window','localStorage','navigator','setTimeout','clearTimeout',transpiled);
 const mod={exports:{}};
 sandbox(k=>modules[k],mod,mod.exports,win,{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}, {onLine:true},setTimeout,clearTimeout);
 return {svc:mod.exports,observed,fighters,store,win,auth(uid){assert.ok(onAuth);signedIn=uid;onAuth('SIGNED_IN',uid?{user:{id:uid}}:null);}};
}
const sample=(id)=>({id,fighterName:`PERSONAJE ${id}`,createdAt:1234,isPreset:false});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('V16.2 migrates legacy IndexedDB fighters automatically on sign-in without user clicking anything',async()=>{
 const h=harness([sample('old_a'),sample('old_b'),{...sample('preset_demo'),isPreset:true}]);
 const close=h.svc.startAutomaticFighterMigration();
 h.auth('account_A');
 await sleep(520);
 assert.deepEqual(h.observed,[{ids:['old_a','old_b'],uid:'account_A'}]);
 assert.equal(h.svc.getAutomaticMigrationStatus().phase,'synced');
 assert.equal(h.svc.getAutomaticMigrationStatus().uploaded,2);
 assert.equal(h.store.get('pb-local-fighters-cloud-owner-v16-2'),'account_A');
 assert.equal(h.fighters.length,3); // data never deleted or altered
 close();
});

test('V16.2 does not upload anonymous fighter collections and prevents migration to different account on shared device',async()=>{
 const h=harness([sample('old_a')]);const close=h.svc.startAutomaticFighterMigration();
 await sleep(440);
 assert.equal(h.observed.length,0);
 assert.equal(h.svc.getAutomaticMigrationStatus().phase,'waiting-login');
 h.auth('account_A');await sleep(450);
 assert.equal(h.observed.length,1);
 h.auth('account_B');await sleep(450);
 assert.equal(h.observed.length,1);
 assert.equal(h.svc.getAutomaticMigrationStatus().phase,'different-account');
 close();
});

test('V16.2 uploads new locally saved fighters without losing existing fighters',async()=>{
 const h=harness([sample('old_a')]);const close=h.svc.startAutomaticFighterMigration();
 h.auth('account_A');await sleep(460);
 h.fighters.push(sample('new_b'));
 h.win.fire('pb-fighters-changed');await sleep(460);
 assert.deepEqual(h.observed.at(-1).ids,['old_a','new_b']);
 assert.equal(h.fighters.length,2);
 close();
});

test('corrected SQL has complete public_asset_ownership constraint and re-runnable policies',()=>{
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/202611170001_photo_brawl_community.sql'),'utf8');
 assert.match(sql,/constraint public_asset_ownership check\s*\(\s*\(public_portrait_path[\s\S]*?\n\s*\)\s*\n\s*\);/);
 assert.match(sql,/drop policy if exists "Perfiles públicos" on public\.player_profiles/);
 assert.match(sql,/drop policy if exists "Leer mis archivos privados" on storage\.objects/);
 assert.doesNotMatch(sql,/drop table public\.fighters/i);
});
