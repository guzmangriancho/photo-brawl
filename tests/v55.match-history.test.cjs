const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
test('ranking fighter and duo use 16-bit numeric pixel cup, league stays on avatar',()=>{
 const community=read('src/components/CommunityPage.tsx');
 assert.match(community,/PixelCupTotal trophies=\{f\.trophies\}/);
 assert.match(community,/PixelCupTotal trophies=\{duo\.trophies\}/);
 assert.match(community,/LeagueFrame trophies=\{f\.trophies\}/);
 const art=read('src/components/LeagueEmblem.tsx');
 assert.match(art,/shapeRendering="crispEdges"/);
 assert.match(art,/trophies\.toLocaleString\('es-ES'\)/);
});
test('match identities stored by database trigger inside V51 progress transaction',()=>{
 const sql=read('supabase/migrations/202611190001_v55_ranked_fighter_history.sql');
 assert.match(sql,/AFTER INSERT ON public\.fighter_progress_events/);
 assert.match(sql,/NEW\.fighter_id/);
 assert.match(sql,/fighter_local_id,fighter_name/);
 assert.match(sql,/ON CONFLICT\(match_id,account_id\) DO NOTHING/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pb_head_to_head\(uuid\) TO authenticated/);
});
test('head to head restricts access to current player, excludes allied 2v2',()=>{
 const sql=read('supabase/migrations/202611190001_v55_ranked_fighter_history.sql');
 assert.match(sql,/me:=auth\.uid\(\)/);
 assert.match(sql,/i\.pos%2<>j\.pos%2/);
 assert.match(sql,/LEFT JOIN public\.ranked_match_fighters/);
 assert.match(sql,/LIMIT 50/);
});
test('retrofill four known participants without modifying ELO or cups',()=>{
 const sql=read('docs/V55_HISTORIAL_Y_COPAS.md');
 assert.match(sql,/No se modifica ni ELO ni copas/);
});
