'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('admin UID fixed by a one-time SQL assignment of guzmangriancho, not by editable username in policies',()=>{
 const sql=read('supabase/migrations/202611180003_admin_fighter_gallery.sql');
 assert.match(sql,/username\s*=\s*'guzmangriancho'/);
 assert.match(sql,/photo_brawl_internal\.admin_users/);
 assert.match(sql,/user_id\s*=\s*\(select auth\.uid\(\)\)/);
 assert.match(sql,/security definer/i);
 assert.match(sql,/not exists \(select 1 from photo_brawl_internal\.admin_users\)/);
 assert.match(sql,/revoke all on photo_brawl_internal\.admin_users from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public\.pb_is_admin\(\) to authenticated/i);
 assert.doesNotMatch(sql,/grant\s+(update|delete|insert|all)\s+on\s+public\.fighters\s+to\s+authenticated/i);
});

test('RLS authorizes admin read-only for fighters and private images, and keeps objects private',()=>{
 const sql=read('supabase/migrations/202611180003_admin_fighter_gallery.sql');
 assert.match(sql,/on public\.fighters for select to authenticated\s+using \(\(select public\.pb_is_admin\(\)\)\)/);
 assert.match(sql,/on storage\.objects for select to authenticated\s+using \(bucket_id = 'fighter-private' and \(select public\.pb_is_admin\(\)\)\)/);
 const old=read('supabase/migrations/202611170001_photo_brawl_community.sql');
 assert.match(old,/using \(is_public or owner_id=\(select auth\.uid\(\)\)\)/);
 assert.match(old,/on public\.fighters for update to authenticated\s+using \(owner_id=/);
 assert.match(old,/on public\.fighters for delete to authenticated\s+using \(owner_id=/);
});

test('settings switch is hidden from non-admin accounts, reset on account changes and off by default',()=>{
 const menu=read('src/components/CharacterSelect.tsx');
 assert.match(menu,/currentUserIsAdmin\(\)/);
 assert.match(menu,/accountUser\?\.id && accountUser\.id===verifiedAdminId/);
 assert.match(menu,/setShowAllFighters\(false\)/);
 assert.match(menu,/adminAllowed&&<div className="pb-setting-row pb-admin-setting"/);
 assert.match(menu,/role="switch"/);
 assert.match(menu,/adminView=\{adminAllowed && showAllFighters\}/);
 assert.doesNotMatch(menu,/localStorage\.getItem\('pb-admin/);
});

test('gallery switches between normal public list and admin read-only archive without exposing images publicly',()=>{
 const service=read('src/services/communityService.ts');
 const page=read('src/components/CommunityPage.tsx');
 const artwork=read('src/components/CommunityArtwork.tsx');
 assert.match(service,/listCommunity\(search='',page=0,pageSize=6\)/);
 assert.match(service,/\.eq\('is_public',true\)/);
 assert.match(service,/listAllFightersForAdmin/);
 assert.match(service,/\.rpc\('pb_is_admin'\)/);
 assert.match(service,/storage\.from\('fighter-private'\)\.download\(path\)/);
 assert.match(page,/adminView\?listAllFightersForAdmin\(query,page,PER_PAGE\):listCommunity\(query,page,PER_PAGE\)/);
 assert.match(page,/listState\.admin===adminView\?listState\.items:\[\]/);
 assert.match(page,/detail\.is_public!==false \|\| adminView/);
 assert.match(artwork,/URL\.revokeObjectURL/);
 assert.doesNotMatch(artwork,/createSignedUrl|getPublicUrl\(privatePath\)/);
});
