const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const pushServer=read('server/push.cjs');
const index=read('server/index.cjs');
const pushSql=read('supabase/migrations/202611240001_v58_push_subscriptions.sql');
const dailySql=read('supabase/migrations/202611240002_v58_daily_battles.sql');
const pushSvc=read('src/services/pushService.ts');
const dailySvc=read('src/services/dailyService.ts');
const sw=read('public/sw.js');
const panel=read('src/components/FriendsPanel.tsx');
const menu=read('src/components/CharacterSelect.tsx');
const arena=read('src/components/FightArena.tsx');
const app=read('src/App.tsx');
const pkg=JSON.parse(read('package.json'));

test('push usa la librería mantenida web-push con claves VAPID solo en variables de entorno',()=>{
 assert.ok(pkg.dependencies['web-push'],'web-push debe ser dependencia npm');
 assert.match(pushServer,/require\('web-push'\)/);
 assert.match(pushServer,/VAPID_PUBLIC_KEY/);
 assert.match(pushServer,/VAPID_PRIVATE_KEY/);
 assert.match(pushServer,/VAPID_SUBJECT/);
 assert.doesNotMatch(pushServer,/-----BEGIN/);
});
test('el servidor construye los textos y verifica la sesión; el cliente nunca decide el contenido',()=>{
 assert.match(pushServer,/verifyUser/);
 assert.match(pushServer,/friend_request/);
 assert.match(pushServer,/game_invitation/);
 assert.match(pushServer,/invitation_accepted/);
 assert.match(index,/pushApi\.configured\(\)/);
 assert.match(index,/safeOrigin/);
});
test('suscripciones push: RLS, solo lectura propia y escritura únicamente con rol de servicio',()=>{
 assert.match(pushSql,/create table if not exists public\.pb_push_subscriptions/i);
 assert.match(pushSql,/alter table public\.pb_push_subscriptions enable row level security/i);
 assert.match(pushSql,/revoke all on public\.pb_push_subscriptions from public, anon, authenticated/i);
 assert.doesNotMatch(pushSql,/grant (?:insert|update|delete) on public\.pb_push_subscriptions/i);
 assert.doesNotMatch(pushSql,/create or replace function/i);
});
test('avisos caducos se limpian y hay límites de abuso',()=>{
 assert.match(pushServer,/404/);
 assert.match(pushServer,/410/);
 assert.match(pushServer,/rateLimit|RATE/);
});
test('cliente push opt-in: deriva el host del WebSocket, SW con push/click y avisos silenciosos',()=>{
 assert.match(pushSvc,/VITE_ONLINE_WS_URL/);
 assert.match(pushSvc,/pushManager\.subscribe/);
 assert.match(pushSvc,/userVisibleOnly:true/);
 assert.match(sw,/addEventListener\('push'/);
 assert.match(sw,/addEventListener\('notificationclick'/);
 assert.match(panel,/PushBlock/);
 assert.match(menu,/notifySocial\('game_invitation'/);
 assert.match(menu,/notifySocial\('friend_request'/);
 assert.match(menu,/notifySocial\('invitation_accepted'/);
});
test('combate diario: selección determinista del mismo luchador publicado para todos',()=>{
 assert.match(dailySql,/create table if not exists public\.pb_daily_features/i);
 assert.match(dailySql,/day date primary key/i);
 assert.match(dailySql,/order by md5\(f\.id::text \|\| today::text\) limit 1/);
 assert.match(dailySql,/f\.is_public/);
 assert.match(dailySql,/at time zone 'utc'/);
});
test('resultados diarios: primera victoria cuenta, derrotas reintentables y coherencia de marcador',()=>{
 assert.match(dailySql,/primary key\(account_id,day\)/);
 assert.match(dailySql,/pb_daily_score_coherent/);
 assert.match(dailySql,/'already_won'/);
 assert.match(dailySql,/'already_lost'/);
 assert.match(dailySql,/for update/);
});
test('el diario no toca ELO, copas ni reglas Ultimate; recompensas solo cosméticas del mes',()=>{
 assert.doesNotMatch(dailySql,/player_profiles\.rating/i);
 assert.doesNotMatch(dailySql,/update public\.player_profiles/i);
 assert.doesNotMatch(dailySql,/trophies/i);
 assert.match(dailySvc,/LEYENDA DEL MES/);
 const peaks=JSON.parse(JSON.stringify(dailySvc.match(/wins:(\d+)/g))).map(x=>Number(x.split(':')[1]));
 assert.ok(Math.max(...peaks)<=28,'ningún hito puede pedir más de 28 victorias (meses de 28 días)');
});
test('UI diaria: tarjeta en inicio, luchador comunitario con arte público y registro único al terminar',()=>{
 assert.match(menu,/COMBATE DIARIO/);
 assert.match(menu,/readDaily\(\)/);
 assert.match(menu,/loadDailyFighter/);
 assert.match(menu,/onStartDaily\(featured,dailyFighter/);
 assert.match(app,/handleStartDaily/);
 assert.match(app,/daily:day/);
 assert.match(arena,/recordDailyResult\(/);
 assert.match(arena,/dailyReportedRef/);
 assert.match(arena,/pb-daily-refresh/);
});
