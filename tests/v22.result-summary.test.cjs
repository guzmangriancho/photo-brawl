'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('final summary stays in the existing rematch/exit result popup',()=>{
 const arena=read('src/components/FightArena.tsx');
 const popup=arena.split('className="arena-result-overlay"')[1]?.split('className="arena-pause-overlay"')[0]||'';
 assert.match(popup,/arena-match-summary/);
 assert.match(popup,/arena-result-actions/);
 assert.match(popup,/PEDIR REVANCHA|REVANCHA/);
 assert.match(popup,/SALIR DEL ONLINE|CAMBIAR LUCHADOR/);
});

test('ranked summary displays both players before/after ratings and deltas',()=>{
 const arena=read('src/components/FightArena.tsx');
 assert.match(arena,/host_rating_before/);
 assert.match(arena,/guest_rating_before/);
 assert.match(arena,/host_rating/);
 assert.match(arena,/guest_rating/);
 assert.match(arena,/arena-elo-delta/);
});

test('friendly summary explicitly states ELO is unchanged',()=>{
 const arena=read('src/components/FightArena.tsx');
 assert.match(arena,/El ELO de ambos jugadores no cambia en esta modalidad/);
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
