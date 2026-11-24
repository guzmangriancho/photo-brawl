'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const migration=read('supabase/migrations/202611180001_ranked_rematches.sql');
const fn=migration.split('create or replace function public.record_ranked_match(')[1]?.split('$$;')[0]||'';

test('every completed ranked match against the same rival is recorded and rated',()=>{
 assert.ok(fn,'the V21 migration must replace record_ranked_match');
 assert.doesNotMatch(fn,/same_opponent_cooldown|played_at\s*>\s*now\(\)\s*-\s*interval\s*'24 hours'/i);
 assert.match(fn,/where match_id=p_match_id/,'duplicate protection remains per match UUID');
 assert.match(fn,/insert into public\.ranked_matches/,'every distinct match enters ranked history');
 assert.match(fn,/update public\.player_profiles set rating=new_host/,'host ELO is updated');
 assert.match(fn,/update public\.player_profiles set rating=new_guest/,'guest ELO is updated');
 assert.match(migration,/grant execute on function public\.record_ranked_match\(uuid,uuid,uuid,integer,integer,text,text\) to service_role/);
});

test('a server rematch gets a fresh match ID and can be recorded independently',()=>{
 const rooms=read('server/rooms.cjs');
 const rematch=rooms.split("if(msg.type==='rematch')")[1]?.split("fail(peer,'Acción no reconocida.')")[0]||'';
 assert.match(rematch,/room\.resultRecorded=false/);
 assert.match(rematch,/room\.matchId=escrow\?\.id\|\|randomUUID\(\)/);
 assert.match(rematch,/new FightEngine\(/);
});

test('the arena listens for and displays the authoritative ranked result',()=>{
 const arena=read('src/components/FightArena.tsx');
 assert.match(arena,/online\.on\('ranked_result'/);
 assert.match(arena,/CLASIFICATORIA REGISTRADA/);
 assert.match(arena,/arena-match-summary/);
 assert.match(arena,/host_rating_before/);
});

test('PWA cache is versioned so installed clients receive the ranked fix',()=>{
 assert.match(read('public/sw.js'),/pb-shell-v\d+[\w-]*/);
});

test('modified React screens transpile without JSX or TypeScript syntax errors',()=>{
 for(const file of ['src/components/FightArena.tsx','src/components/CharacterSelect.tsx']){
  const out=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
  const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[],file);
 }
});
