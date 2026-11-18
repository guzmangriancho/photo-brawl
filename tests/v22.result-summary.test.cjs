'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('V35 final summary retains both scores and offers shared rematch with fighter changes',()=>{
 const arena=read('src/components/FightArena.tsx');
 const component=read('src/components/RematchRoster.tsx');
 assert.match(arena,/className="arena-result-overlay pb-v35-rematch-overlay"/);
 assert.match(arena,/arena-match-summary/);
 assert.match(arena,/snapshot\.p1RoundWins/);
 assert.match(arena,/snapshot\.p2RoundWins/);
 assert.match(component,/PEDIR REVANCHA/);
 assert.match(component,/SALIR/);
 assert.match(component,/CAMBIAR/);
});

test('ranked summary continues to show both player ratings and their variations',()=>{
 const arena=read('src/components/FightArena.tsx');
 for(const term of ['host_rating_before','guest_rating_before','host_rating','guest_rating','eloLabel','CLASIFICATORIA REGISTRADA'])assert.ok(arena.includes(term));
});

test('friendly result explicitly promises unchanged ranking rating',()=>{
 assert.match(read('src/components/FightArena.tsx'),/AMISTOSO · SIN CAMBIOS DE ELO/);
});

test('V22 SQL response includes before and after rating values without removing V21 rematches',()=>{
 const sql=read('supabase/migrations/202611180002_ranked_result_details.sql');
 assert.match(sql,/host_rating_before',old_host/);
 assert.match(sql,/guest_rating_before',old_guest/);
 assert.match(sql,/host_rating',new_host/);
 assert.match(sql,/guest_rating',new_guest/);
 assert.doesNotMatch(sql,/same_opponent_cooldown|played_at\s*>\s*now\(\)\s*-\s*interval\s*'24 hours'/i);
 assert.match(sql,/where match_id=p_match_id/);
});

test('modified arena transpiles without JSX or TypeScript syntax errors',()=>{
 const file='src/components/FightArena.tsx';
 const out=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
 const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[],file);
});
