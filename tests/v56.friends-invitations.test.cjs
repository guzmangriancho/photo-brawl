const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const sql=read('supabase/migrations/202611190003_v56_friends_invites.sql');
const menu=read('src/components/CharacterSelect.tsx');
const panel=read('src/components/FriendsPanel.tsx');
const lobby=read('src/components/OnlineLobby.tsx');
const svc=read('src/services/friendsService.ts');
const hook=read('src/services/useFriends.ts');
test('unique symmetric friendship; only recipient responds to friend request',()=>{
 assert.match(sql,/primary key\(user_a,user_b\)/i);
 assert.match(sql,/user_a < user_b/);
 assert.match(sql,/if st is distinct from 'pending' or sender=me/i);
 assert.match(sql,/if other_id=me/);
});
test('friendships + invitations readable only to participants; no direct writes from clients',()=>{
 assert.match(sql,/alter table public\.pb_friendships enable row level security/i);
 assert.match(sql,/alter table public\.pb_game_invitations enable row level security/i);
 assert.match(sql,/revoke all on public\.pb_friendships, public\.pb_game_invitations from public, anon, authenticated/i);
 assert.match(sql,/grant select on public\.pb_friendships, public\.pb_game_invitations to authenticated/i);
 assert.match(sql,/auth\.uid\(\)\) in \(user_a,user_b\)/i);
 assert.match(sql,/auth\.uid\(\)\) in \(inviter_id,invitee_id\)/i);
 assert.doesNotMatch(sql,/grant (?:insert|update|delete) on public\.pb_game_invitations to authenticated/i);
});
test('server-sided invitation validation: friends only; rate limit; expiry; correct target',()=>{
 assert.match(sql,/status='accepted'\) then/);
 assert.match(sql,/created_at > now\(\)-interval '10 minutes'/);
 assert.match(sql,/interval '15 minutes'/);
 assert.match(sql,/row_\.invitee_id<>me/);
 assert.match(sql,/row_\.expires_at<=now\(\)/);
 assert.match(sql,/p_battle_mode not in \('1V1','2V2','FREE_FOR_ALL'\)/);
});
test('all online formats and ranked modes use existing real online transport',()=>{
 assert.match(menu,/OnlineSession\.create\(chosen,arena,ranked/);
 assert.match(menu,/OnlineSession\.join\(invitation\.room_code,chosen\)/);
 assert.match(menu,/ensureRankedOwnFighter\(chosen\)/);
 assert.match(menu,/sendGameInvitation\(friendId,target\.code,battleMode,ranked\)/);
 assert.match(panel,/<option value="1V1">/);
 assert.match(panel,/<option value="2V2">/);
 assert.match(panel,/<option value="FREE_FOR_ALL">/);
 assert.match(panel,/RANKED/);
});
test('one-tap invitation receipt and entry from home, lobby and public profiles',()=>{
 assert.match(menu,/pb-friend-alert/);
 assert.match(menu,/acceptIncomingInvite\(social\.invitations\[0\]\)/);
 assert.match(menu,/setShowOnlineLobby\(true\)/);
 assert.match(lobby,/INVITAR AMIGOS SIN CÓDIGO/);
 assert.match(lobby,/onOpenFriends/);
 assert.match(read('src/components/CommunityPage.tsx'),/AÑADIR AMIGO/);
});
test('offline persistence via DB, realtime + polling fallback and active-only filtering',()=>{
 assert.match(svc,/\.from\('pb_game_invitations'\)/);
 assert.match(svc,/Date\.parse\(x\.expires_at\)>expiry/);
 assert.match(hook,/postgres_changes/);
 assert.match(hook,/setInterval\(\(\)=>\{void refresh\(\);\},12000\)/);
 assert.match(hook,/window\.addEventListener\('focus',focus\)/);
});
test('existing invites are not shown forever; no invented browser push',()=>{
 assert.match(svc,/x\.status==='pending'/);
 assert.doesNotMatch(hook,/Notification\.requestPermission/);
});
test('arcade pixel styling on portrait / landscape and legacy codes preserved',()=>{
 const css=read('src/components/friends.css');
 assert.match(css,/Pixelify Sans/);
 assert.match(css,/orientation:landscape/);
 assert.match(css,/border-radius:0/);
 assert.match(lobby,/CÓDIGO DE INVITACIÓN/);
 assert.match(lobby,/Copiar código/);
});
