'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('social menu exposes accounts, actual public gallery and database ranking',()=>{
 const menu=read('src/components/CharacterSelect.tsx');
 const social=read('src/components/CommunityPage.tsx');
 assert.match(menu,/showAccount && <AccountPanel/);
 assert.match(menu,/go\('COMMUNITY'\)/);
 assert.match(menu,/go\('RANKING'\)/);
 assert.match(menu,/CommunityPage initialTab=/);
 assert.doesNotMatch(menu,/DEMO_LEADERS/);
 for(const needed of ['leaderboard()','listCommunity(query,page,PER_PAGE)','publishFighter(fighter)','unpublishFighter(fighter)','toggleFighterLike(detail.id'])assert.ok(social.includes(needed),needed);
});
test('ranked matches use server validation, never client supplied results',()=>{
 const rooms=read('server/rooms.cjs');
 const service=read('server/ranked.cjs');
 assert.match(rooms,/rankedApi\.verifyUser\(msg\.accessToken\)/);
 assert.match(rooms,/room\.engine\.roundOver && !room\.resultRecorded/);
 assert.match(rooms,/room\.resultRecorded=true/);
 assert.match(rooms,/rankedApi\.recordResult/);
 assert.match(service,/\/auth\/v1\/user/);
 assert.match(service,/\/rest\/v1\/rpc\/record_ranked_match/);
 assert.doesNotMatch(service,/console\.log\(.*(SECRET_KEY|accessToken)/);
});
test('ranked endpoint checks Supabase JWT and writes RPC with server key',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fake_test_key';
 process.env.SUPABASE_SECRET_KEY='sb_secret_fake_test_key';
 delete require.cache[require.resolve('../server/ranked.cjs')];
 const ranked=require('../server/ranked.cjs');
 assert.equal(ranked.available(),true);
 let calls=[];
 const realFetch=global.fetch;
 try{
  global.fetch=async (url,options)=>{
    calls.push({url,options});
    if(String(url).endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'550e8400-e29b-41d4-a716-446655440000'})};
    return {ok:true,json:async()=>({recorded:true})};
  };
  const token='a'.repeat(60);
  assert.equal(await ranked.verifyUser(token),'550e8400-e29b-41d4-a716-446655440000');
  const result=await ranked.recordResult({id:'550e8400-e29b-41d4-a716-446655440002',hostId:'550e8400-e29b-41d4-a716-446655440000',guestId:'550e8400-e29b-41d4-a716-446655440001',hostRounds:2,guestRounds:1,stage:'SKI_RESORT'});
  assert.equal(result.recorded,true);
  assert.equal(calls[0].options.headers.apikey,'sb_publishable_fake_test_key');
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
  assert.equal(calls[1].options.headers.apikey,'sb_secret_fake_test_key');
  assert.equal(calls[1].options.headers.Authorization,undefined,'opaque secret key cannot be sent as JWT');
  await assert.rejects(()=>ranked.recordResult({id:'550e8400-e29b-41d4-a716-446655440002',hostId:'550e8400-e29b-41d4-a716-446655440000',guestId:'550e8400-e29b-41d4-a716-446655440001',hostRounds:2,guestRounds:2,stage:'SKI_RESORT'}),/Marcador/);
 }finally{global.fetch=realFetch;}
});
