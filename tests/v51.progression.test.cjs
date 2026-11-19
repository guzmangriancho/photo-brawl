'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/202611190001_progression_leagues_duos.sql');
const uid=i=>`00000000-0000-4000-8000-00000000000${i}`;
const match='20000000-0000-4000-8000-000000000001';

test('legacy account ELO RPCs remain intact; new RPC wraps them in same SQL transaction',()=>{
 assert.match(sql,/public\.record_ranked_match\(p_match_id,p_host_id,p_guest_id/);
 assert.match(sql,/public\.record_group_ranked_match\(p_match_id,p_mode,p_player_ids/);
 assert.match(sql,/if coalesce\(\(answer->>'recorded'\)::boolean,false\)=false then return answer/);
 assert.doesNotMatch(sql,/drop table (public\.)?(ranked_matches|group_ranked_matches|player_profiles)/);
 for(const rpc of ['record_ranked_progress_match','record_group_ranked_progress_match']){
  assert.match(sql,new RegExp('create or replace function public\\.'+rpc+'\\('));
  assert.match(sql,new RegExp('revoke all on function public\\.'+rpc));
 }
 assert.match(sql,/to service_role/);
});

test('fighter progression is tied to canonical cloud fighters and cannot be forged from JS',()=>{
 for(const table of ['fighter_progress','duo_progress','fighter_progress_events','duo_progress_events']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on public\\.[^\\n]*'+table));
 }
 assert.match(sql,/fighter_id uuid primary key references public\.fighters\(id\)/);
 assert.match(sql,/owner_id=p_account and local_id=p_local_id/);
 assert.match(sql,/delete from public\.fighter_progress where fighter_id=new\.id/);
 assert.match(sql,/on conflict\(fighter_id\) do nothing/);
 assert.match(sql,/primary key\(match_id,account_id\)/);
 assert.match(sql,/primary key\(match_id,player_a,player_b\)/);
 assert.match(sql,/p_player_ids\[1\],p_player_ids\[3\]/);
 assert.match(sql,/p_player_ids\[2\],p_player_ids\[4\]/);
 assert.match(sql,/p_mode='2V2'/);
 assert.match(sql,/p_mode='FREE_FOR_ALL'/);
 assert.match(sql,/pb_rotation_bonus/);
 assert.match(sql,/p_places\[i\]=1 and first_count<>1 then 0/);
});

test('tiers and thresholds are consistent between frontend and database',()=>{
 const model=read('src/services/progressionService.ts');
 for(const [name,min] of [['BRONCE',0],['PLATA',100],['ORO',300],['DIAMANTE',600],['MAESTRO',1000],['LEYENDA',1600]]){
  assert.match(model,new RegExp(`key:'${name}',min:${min}`));
  if(min)assert.match(sql,new RegExp(`p_cups>=${min} then '${name}'`));
 }
 assert.match(read('src/components/progression.css'),/image-rendering:pixelated/);
 assert.match(read('src/components/CommunityPage.tsx'),/DÚOS 2V2/);
 assert.match(read('src/components/VersusIntro.tsx'),/<LeagueFrame trophies=\{cups\(seat\)\}>/);
 assert.match(read('src/components/CommunityPage.tsx'),/LeagueFrame trophies=\{fighterCups\[f\.id\]/);
 assert.match(read('src/components/FightArena.tsx'),/rankedResult\.host_fighter\.change/);
 assert.match(read('src/components/GroupFightArena.tsx'),/groupRating\.duos/);
});

test('duel server sends real fighter identities only in authenticated ranked results',async()=>{
 const saved={...process.env};const native=global.fetch;
 try{
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='public';process.env.SUPABASE_SECRET_KEY='secret';
  const mod=require.resolve('../server/ranked.cjs');delete require.cache[mod];
  const ranked=require(mod);
  global.fetch=async(url,options)=>{
   assert.match(url,/rpc\/record_ranked_progress_match$/);
   const body=JSON.parse(options.body);
   assert.equal(body.p_host_fighter_local_id,'character-a');
   assert.equal(body.p_guest_fighter_local_id,'character-b');
   assert.equal(body.p_host_id,uid(1));assert.equal(body.p_guest_id,uid(2));
   assert.equal(options.headers.apikey,'secret');
   return {ok:true,json:async()=>({recorded:true,host_fighter:{change:26}})};
  };
  const result=await ranked.recordResult({id:match,hostId:uid(1),guestId:uid(2),
    hostRounds:2,guestRounds:0,stage:'SKI_RESORT',hostFighterId:'character-a',guestFighterId:'character-b'});
  assert.equal(result.host_fighter.change,26);
  await assert.rejects(()=>ranked.recordResult({id:match,hostId:uid(1),guestId:uid(2),
    hostRounds:2,guestRounds:0,stage:'SKI_RESORT',hostFighterId:'a'}),/inválidas/);
 }finally{global.fetch=native;process.env=Object.assign(process.env,saved);delete require.cache[require.resolve('../server/ranked.cjs')];}
});

test('group server sends four fighter IDs and 2V2 team IDs are player accounts, not characters',async()=>{
 const saved={...process.env};const native=global.fetch;
 try{
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='public';process.env.SUPABASE_SECRET_KEY='secret';
  const mod=require.resolve('../server/ranked.cjs');delete require.cache[mod];
  const ranked=require(mod);
  global.fetch=async(url,options)=>{
   assert.match(url,/rpc\/record_group_ranked_progress_match$/);
   const body=JSON.parse(options.body);
   assert.deepEqual(body.p_fighter_local_ids,['a','b','c','d']);
   assert.deepEqual(body.p_player_ids,[uid(1),uid(2),uid(3),uid(4)]);
   assert.equal(body.p_winning_team,'RED');
   return {ok:true,json:async()=>({recorded:true,fighters:[],duos:[]})};
  };
  assert.equal((await ranked.recordGroupResult({id:match,mode:'2V2',accountIds:[1,2,3,4].map(uid),
    places:[1,2,1,2],winningTeam:'RED',stage:'SPIRIT_FOREST',fighterIds:['a','b','c','d']})).recorded,true);
  await assert.rejects(()=>ranked.recordGroupResult({id:match,mode:'2V2',accountIds:[1,2,3,4].map(uid),
    places:[1,2,1,2],winningTeam:'RED',stage:'SPIRIT_FOREST',fighterIds:['a']}),/Luchadores/);
 }finally{global.fetch=native;process.env=Object.assign(process.env,saved);delete require.cache[require.resolve('../server/ranked.cjs')];}
});

test('new and changed TS/TSX parse without syntax errors',()=>{
 const ts=require('typescript');
 for(const file of ['src/services/progressionService.ts','src/components/LeagueEmblem.tsx',
  'src/components/CommunityPage.tsx','src/components/CharacterSelect.tsx','src/components/VersusIntro.tsx',
  'src/components/FightArena.tsx','src/components/GroupFightArena.tsx','src/App.tsx']){
  const tree=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length,0,file+' -> '+tree.parseDiagnostics.map(d=>d.messageText).join('/'));
 }
});
