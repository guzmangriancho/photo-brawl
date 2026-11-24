'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function serviceHarness({phase='synced',migrationErrors=[],failed=[],cloudFighters=[{id:'from_cloud'}]}={}){
  const events=[];
  let uid='account_A';
  let releaseSync;
  const syncGate=new Promise(resolve=>releaseSync=resolve);
  let releaseRestore;
  const restoreGate=new Promise(resolve=>releaseRestore=resolve);
  const mock={
    './supabaseClient':{supabase:{auth:{async getUser(){events.push('verify:'+uid);return {data:{user:uid?{id:uid}:null},error:null};}}}},
    './automaticFighterMigration':{async runAutomaticMigrationNow(expected){events.push('sync:'+expected);await syncGate;return {phase,errors:migrationErrors,message:'La colección pertenece a otra cuenta.'};}},
    './communityService':{async restoreCloudFightersReport(){events.push('restore');await restoreGate;return {fighters:cloudFighters,failed};}},
    './storageService':{async mergeCustomFighters(rows){events.push('merge:'+rows.map(f=>f.id).join(','));return {added:rows,updated:[],conflicts:0,unchanged:0};}},
  };
  const source=read('src/services/startupCloudRestore.ts');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',js)(name=>mock[name],module,module.exports);
  return {svc:module.exports,events,releaseSync,releaseRestore,setUser:value=>{uid=value;}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('V49 requires verified sign-in before showing any game screen, without a dismissible modal',()=>{
  const app=read('src/App.tsx');
  const panel=read('src/components/AccountPanel.tsx');
  const account=read('src/services/usePlayerAccount.ts');
  assert.match(app,/if\(!user\|\|!supabase\)return/);
  assert.match(app,/<AccountPanel requiredLogin/);
  assert.ok(app.indexOf('if(!user||!supabase)')<app.indexOf("if (screen === 'FIGHT'"));
  assert.match(panel,/!requiredLogin&&<button type="button" disabled=\{busy\} onClick=\{onClose\}/);
  assert.match(panel,/!requiredLogin&&<nav/);
  assert.match(panel,/!requiredLogin&&<button className="pb-social-back"/);
  assert.match(account,/client\.auth\.getUser\(\)/);
});

test('V49 keeps Supabase null-safe in the login check and sign-out callback',()=>{
  const app=read('src/App.tsx');
  const account=read('src/services/usePlayerAccount.ts');
  assert.match(app,/supabase\?\.auth\.signOut\(\)/);
  assert.match(account,/const client=supabase;/);
  assert.match(account,/if\(!client\)\{setLoading\(false\);return;\}/);
  assert.match(account,/await client\.auth\.getUser\(\)/);
});

test('V49 launches with ordered sync THEN restore THEN merge; duplicate StrictMode calls share the same promise',async()=>{
  const h=serviceHarness();
  const steps=[];
  const first=h.svc.startStartupCloudRestore('account_A',step=>steps.push('first:'+step));
  const second=h.svc.startStartupCloudRestore('account_A',step=>steps.push('second:'+step));
  assert.equal(first.promise,second.promise);
  await tick();
  assert.deepEqual(h.events,['verify:account_A','sync:account_A']);
  h.releaseSync();await tick();
  assert.deepEqual(h.events,['verify:account_A','sync:account_A','restore']);
  assert.ok(steps.includes('first:restoring')&&steps.includes('second:restoring'));
  h.releaseRestore();
  const result=await first.promise;
  assert.deepEqual(h.events,['verify:account_A','sync:account_A','restore','verify:account_A','merge:from_cloud']);
  assert.equal(result.restored,1);
  first.unsubscribe();second.unsubscribe();
});

test('V49 stops before recovery if synchronization fails; local data is not overwritten',async()=>{
  const h=serviceHarness({phase:'different-account'});
  const {promise}=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();
  await assert.rejects(promise,/otra cuenta/);
  assert.deepEqual(h.events,['verify:account_A','sync:account_A']);
});

test('V49 must reject account switching mid-download before the local merge',async()=>{
  const h=serviceHarness();
  const {promise}=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();await tick();
  h.setUser('account_B');h.releaseRestore();
  await assert.rejects(promise,/sesión cambió/);
  assert.deepEqual(h.events,['verify:account_A','sync:account_A','restore','verify:account_B']);
});

test('V49 reports per-fighter restore errors without locking users out of all valid fighters',async()=>{
  const h=serviceHarness({failed:['Luchador 2: imagen ausente']});
  const {promise}=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();h.releaseRestore();
  const report=await promise;
  assert.deepEqual(report.failed,['Luchador 2: imagen ausente']);
  assert.ok(h.events.includes('merge:from_cloud'));
});

test('V49 can start a new run on a subsequent open, and PWA shell cache is versioned',async()=>{
  const h=serviceHarness();
  const first=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();h.releaseRestore();await first.promise;
  const second=h.svc.startStartupCloudRestore('account_A',()=>{});
  assert.notEqual(first.promise,second.promise);
  await second.promise;
  assert.equal(h.events.filter(e=>e==='restore').length,2);
  assert.match(read('public/sw.js'),/pb-shell-v\d+[\w-]*/);
});


test('slot-only pending uploads preserve local fighters and allow access to the shop',async()=>{
  const h=serviceHarness({phase:'error',migrationErrors:['[SLOTS_FULL] QA: Sin espacio']});
  const {promise}=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();await tick();h.releaseRestore();
  assert.equal((await promise).pendingSlots,1);
  assert.ok(h.events.includes('merge:from_cloud'));
});
test('mixed slot and network upload failures still stop startup',async()=>{
  const h=serviceHarness({phase:'error',migrationErrors:['[SLOTS_FULL] QA: Sin espacio','Connection failed']});
  const {promise}=h.svc.startStartupCloudRestore('account_A',()=>{});
  h.releaseSync();await assert.rejects(promise,/otra cuenta/);
  assert.ok(!h.events.includes('restore'));
});