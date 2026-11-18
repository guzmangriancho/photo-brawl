'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('friendly lobby and friendly rematches use the same public community browser; ranked does not',()=>{
 const lobby=read('src/components/OnlineLobby.tsx');
 const rematch=read('src/components/RematchRoster.tsx');
 const duel=read('src/components/FightArena.tsx');
 const group=read('src/components/GroupFightArena.tsx');
 assert.match(lobby,/!effectiveRanked&&.*pb-online-roster-tabs/);
 assert.match(lobby,/source==='PUBLIC'&&!effectiveRanked\?<PublishedFighterPicker/);
 assert.match(lobby,/effectiveRanked&&next\.id\.startsWith\('community_'\)/);
 assert.match(rematch,/allowCommunity&&source==='PUBLIC'/);
 assert.match(duel,/allowCommunity=\{onlineMode&&!rankedOnline\}/);
 assert.match(group,/allowCommunity=\{!!online&&!online\.room\?\.ranked\}/);
});
test('public gallery only uses public storage paths and assigns a non-owned ID',()=>{
 const service=read('src/services/publishedFighters.ts');
 assert.match(service,/listCommunity\(query,\s*page,\s*COMMUNITY_PAGE_SIZE\)/);
 assert.match(service,/fighterPublicUrl\(entry\.public_sheet_path\)/);
 assert.match(service,/id: `community_\$\{entry\.id\}`/);
 assert.doesNotMatch(service,/fighter-private|downloadAdminFighterImage/);
 assert.match(read('src/components/CharacterSelect.tsx'),/featured\|\|mode==='ONLINE'/);
});
test('both authoritative online engines check ranked fighter ownership at create/join/choose/rematch',()=>{
 for(const file of ['server/rooms.cjs','server/group-rooms.cjs']){
  const code=read(file);
  assert.ok((code.match(/rankedApi\.verifyRankedFighter\(/g)||[]).length>=4,file);
  assert.match(code,/if\(room\.ranked/);
 }
});
test('ranked ownership check rejects community IDs and mismatched owner; accepts only matching own metadata',async()=>{
 const env={...process.env};const originalFetch=global.fetch;
 process.env.SUPABASE_URL='https://fake.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='public';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
 const modulePath=require.resolve('../server/ranked.cjs');delete require.cache[modulePath];
 const ranked=require(modulePath);
 const uid='11111111-1111-4111-8111-111111111111';
 const profile={id:'my-fighter',stats:{hp:25,speed:25,power:25,technique:25},archetype:'RUSHDOWN',passiveTrait:'DOUBLE_JUMP',moveset:{
  lightNormal:{style:'FAST_JAB'},heavyNormal:{style:'LOW_KICK'},specialNeutral:{mechanic:'STRAIGHT_FIREBALL'},
  specialForward:{mechanic:'TELEPORT_BEHIND'},specialUp:{mechanic:'INVINCIBLE_UPPERCUT'},ultimateSuper:{mechanic:'GIANT_BEAM_LASER'},
 }};
 let requested=[];let rows=[{fighter_data:profile}];
 try{
  global.fetch=async(url,options)=>{
   requested.push({url:String(url),options});
   assert.ok(new URL(url).searchParams.get('owner_id')===`eq.${uid}`);
   assert.ok(new URL(url).searchParams.get('local_id')===`eq.${profile.id}`);
   assert.equal(options.headers.apikey,'sb_secret_fake');
   assert.equal(options.headers.Authorization,undefined);
   return {ok:true,json:async()=>rows};
  };
  assert.equal(await ranked.verifyRankedFighter(uid,profile),true);
  assert.equal(requested.length,1);
  await assert.rejects(()=>ranked.verifyRankedFighter(uid,{...profile,id:'community_11111111-1111-4111-8111-111111111111'}),/solo puedes usar/);
  assert.equal(requested.length,1,'community ID must not even query private fighter rows');
  rows=[];
  await assert.rejects(()=>ranked.verifyRankedFighter(uid,profile),/aún no está sincronizado/);
  rows=[{fighter_data:profile}];
  await assert.rejects(()=>ranked.verifyRankedFighter(uid,{...profile,stats:{...profile.stats,power:35}}),/no coinciden/);
 }finally{global.fetch=originalFetch;process.env=Object.assign(process.env,env);delete require.cache[modulePath];}
});
test('new and modified TypeScript/TSX files transpile without parse errors',()=>{
 for(const filename of ['src/services/publishedFighters.ts','src/components/PublishedFighterPicker.tsx',
 'src/components/OnlineLobby.tsx','src/components/RematchRoster.tsx',
 'src/components/CharacterSelect.tsx','src/components/FightArena.tsx','src/components/GroupFightArena.tsx']){
  const output=ts.transpileModule(read(filename),{fileName:filename,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[],filename);
 }
});
