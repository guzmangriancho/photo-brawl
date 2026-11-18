'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MultiFightEngine}=require('../server/runtime/engine/MultiFightEngine.js');
const {FightEngine}=require('../server/runtime/engine/FightEngine.js');
const fs=require('node:fs');
const blank=()=>({left:false,right:false,up:false,down:false,guard:false,light:false,heavy:false,spNeutral:false,spForward:false,spUp:false,superBtn:false,romanCancel:false,dashLeft:false,dashRight:false});
const moveset={lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#fff'},specialForward:{name:'RUSH',mechanic:'SLIDE_LOW_KICK',visualAction:''},specialUp:{name:'ANTI',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''}};
const profile=i=>({id:`p${i}`,fighterName:`FIGHTER ${i}`,archetype:'SHOTO_BALANCED',stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'FAST_METER_GAIN',scaleMultiplier:1,portraitDataUrl:'data:image/png;base64,abc',spriteSheetDataUrl:'data:image/png;base64,abc'});
const group=(mode='2V2')=>{const e=new MultiFightEngine([0,1,2,3].map(profile),mode,'SUNKEN_ATLANTIS');e.remoteHumanControls=true;return e;};
function eliminate(e,winner,loser){for(let i=0;i<3;i++){e.respawnAt[loser]=0;e.triggerKnockout(e.getFighters()[winner],e.getFighters()[loser]);}}

test('group countdown is 3 2 1 YA and prevents actions and timer consumption',()=>{
 const e=group();const startX=e.p1.x;const t=e.roundTimerFrames;
 e.setSeatInput(0,{...blank(),left:true,light:true});
 assert.equal(e.getMultiSummary().countdown,'3');
 for(let i=0;i<60;i++)e.step();assert.equal(e.getMultiSummary().countdown,'2');
 for(let i=0;i<60;i++)e.step();assert.equal(e.getMultiSummary().countdown,'1');
 for(let i=0;i<60;i++)e.step();assert.equal(e.getMultiSummary().countdown,'YA');
 for(let i=0;i<30;i++)e.step();assert.equal(e.getMultiSummary().countdown,null);
 assert.equal(e.p1.x,startX);assert.equal(e.roundTimerFrames,t);
 assert.equal(e.p1.currentAttack,null);
 e.setSeatInput(0,{...blank(),left:true});e.step();assert.ok(e.p1.x<startX);assert.equal(e.roundTimerFrames,t-1);
});
test('2v2 and FFA face joystick direction, not opponent; 1v1 still auto-faces',()=>{
 const e=group('2V2');e.countdownFrames=0;e.setSeatInput(0,{...blank(),left:true});e.step();
 assert.equal(e.p1.facing,-1);
 e.queueNetworkAction(0,'LIGHT');e.step();
 assert.equal(e.p1.facing,-1,'attacking must not turn around toward nearest rival');
 const d=group('FREE_FOR_ALL');d.countdownFrames=0;d.setSeatInput(0,{...blank(),left:true});d.step();assert.equal(d.p1.facing,-1);
 const classic=new FightEngine(profile(0),profile(1),'1P_VS_2P','SKI_RESORT');classic.p1.facing=-1;classic.p1Input={...blank(),left:true};classic.step();assert.equal(classic.p1.facing,1);
});
test('once airborne, second UP-special is discarded until actual landing',()=>{
 const e=new FightEngine(profile(0),profile(1),'1P_VS_2P','SUNKEN_ATLANTIS');
 const f=e.p1;f.y=360;f.vy=-2;
 e.queueNetworkAction(0,'SP_UP');e.step();assert.equal(f.currentAttack?.slot,'SP_UP');assert.equal(f.airUpSpecialUsed,true);
 // Simulate a cancel/recovery while still airborne: the ability is still unavailable.
 f.state='JUMP';f.currentAttack=null;f.bufferedActions=[];f.y=310;f.vy=0;
 e.queueNetworkAction(0,'SP_UP');e.step();assert.equal(f.currentAttack,null);
 f.y=482-3;f.vy=7;e.applyPhysics(f);assert.equal(f.airUpSpecialUsed,false);
 e.queueNetworkAction(0,'SP_UP');e.step();assert.equal(f.currentAttack?.slot,'SP_UP');
});
test('FFA scoring orders elimination exits, including a shared position for same-frame KOs',()=>{
 const e=group('FREE_FOR_ALL');
 e.frameCount=100;eliminate(e,0,2);
 e.frameCount=120;eliminate(e,0,1);
 e.frameCount=150;eliminate(e,0,3);
 const s=e.getMultiSummary();assert.equal(s.winnerSeat,0);assert.deepEqual(s.players.map(p=>p.place),[1,3,4,2]);
 const tie=group('FREE_FOR_ALL');tie.frameCount=100;eliminate(tie,0,1);eliminate(tie,0,2);tie.frameCount=120;eliminate(tie,0,3);
 assert.deepEqual(tie.getMultiSummary().players.map(p=>p.place),[1,3,3,2]);
});
test('team winning is based on combined lives, and positions never use individual KOs',()=>{
 const e=group('2V2');eliminate(e,0,1);assert.equal(e.roundOver,false);
 // Blue teammate has all 3 lives, so fight continues regardless of individual P2 KO.
 eliminate(e,2,3);assert.equal(e.roundOver,true);
 assert.equal(e.winningTeam,'RED');assert.deepEqual(e.getMultiSummary().players.map(p=>p.place),[1,2,1,2]);
});
test('FFA timeout placement uses stocks then remaining HP percentage',()=>{
 const e=group('FREE_FOR_ALL');e.stocks=[2,2,1,0];
 e.getFighters()[0].hp=90;e.getFighters()[1].hp=50;e.getFighters()[2].hp=900;
 e.timeout();assert.deepEqual(e.getMultiSummary().players.map(p=>p.place),[1,2,3,4]);
});
test('network snapshots include the airborne anti-air gate and group countdown',()=>{
 const a=group(),b=group();a.p1.airUpSpecialUsed=true;
 b.applyNetworkState(a.exportNetworkState());
 assert.equal(b.p1.airUpSpecialUsed,true);assert.equal(b.getMultiSummary().countdown,'3');
});
test('UI has thin ring, pixel hearts, floating seat markers and visible countdown',()=>{
 const ui=fs.readFileSync(require('node:path').join(__dirname,'../src/components/GroupFightArena.tsx'),'utf8');
 const css=fs.readFileSync(require('node:path').join(__dirname,'../src/components/groupFightArena.css'),'utf8');
 assert.match(ui,/className="pb-group-countdown"/);assert.match(css,/\.pb-group-countdown/);
 assert.match(ui,/className=\{i<lives\?'is-active':'is-lost'\}/);assert.match(css,/\.pb-group-lives svg\.is-lost/);
 assert.match(css,/inset: 4px; width: calc\(100% - 8px\)/);
 assert.match(fs.readFileSync(require('node:path').join(__dirname,'../src/engine/MultiFightEngine.ts'),'utf8'),/drawFighterIndicator/);
});
test('group ranked RPC accepts four distinct verified participants and server-supplied places',async()=>{
 const saved={...process.env};const originalFetch=global.fetch;
 try{
  process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='public';process.env.SUPABASE_SECRET_KEY='secret';
  const path=require.resolve('../server/ranked.cjs');delete require.cache[path];const ranked=require(path);
  const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-00000000000${i}`);
  global.fetch=async(url,options)=>{assert.match(url,/rpc\/record_group_ranked_match$/);
    assert.equal(options.headers.apikey,'secret');const data=JSON.parse(options.body);
    assert.deepEqual(data.p_places,[1,2,1,2]);assert.deepEqual(data.p_player_ids,ids);
    return {ok:true,json:async()=>({recorded:true,players:[]})};};
  assert.equal((await ranked.recordGroupResult({id:'10000000-0000-4000-8000-000000000000',mode:'2V2',
    accountIds:ids,places:[1,2,1,2],stage:'SUNKEN_ATLANTIS',winningTeam:'RED'})).recorded,true);
  await assert.rejects(()=>ranked.recordGroupResult({id:'10000000-0000-4000-8000-000000000000',mode:'FREE_FOR_ALL',
    accountIds:[ids[0],ids[0],ids[2],ids[3]],places:[1,2,3,4],stage:'SUNKEN_ATLANTIS'}),/inválido/);
 }finally{global.fetch=originalFetch;process.env=Object.assign(process.env,saved);delete require.cache[require.resolve('../server/ranked.cjs')];}
});

test('server checks four distinct account tokens and records team ELO exactly once',async()=>{
 const ranked=require('../server/ranked.cjs');
 const originals={available:ranked.available,verifyUser:ranked.verifyUser,recordGroupResult:ranked.recordGroupResult};
 const ids=Array.from({length:5},(_,i)=>`00000000-0000-4000-8000-00000000001${i}`);
 let submissions=[];
 const {setTimeout:delay}=require('node:timers/promises');
 const groupRooms=require('../server/group-rooms.cjs');
 const peer=()=>({messages:[],send(m){this.messages.push(m);return true;},close(){}});
 const peers=Array.from({length:5},peer);
 try{
  ranked.available=()=>true;
  ranked.verifyUser=async token=>{const n=Number(String(token).replace('token',''));
    if(!Number.isInteger(n)||n<0||n>4)throw Error('Token inválido');return ids[n];};
  ranked.recordGroupResult=async data=>{submissions.push(data);return {recorded:true,players:[]};};
  groupRooms.handle(peers[0],{type:'create',profile:profile(0),battleMode:'2V2',ranked:true,accessToken:'token0'});
  await delay(0);const room=peers[0].room;assert.equal(room.ranked,true);
  groupRooms.handle(peers[1],{type:'join',code:room.code,profile:profile(1),accessToken:'token0'});
  await delay(0);assert.equal(peers[1].room,undefined,'same account cannot enter twice');
  assert.match(peers[1].messages.at(-1).message,/propia cuenta/);
  for(let i=1;i<4;i++){
    groupRooms.handle(peers[i],{type:'join',code:room.code,profile:profile(i),accessToken:'token'+i});
    await delay(0);
  }
  assert.equal(room.players.length,4);
  for(const p of peers.slice(0,4))groupRooms.handle(p,{type:'ready',ready:true});
  await delay(700);assert.equal(room.status,'playing');
  // The only input to rankedApi is the authoritative engine's final result.
  const e=room.engine;
  for(const seat of [1,3])for(let n=0;n<3;n++){e.respawnAt[seat]=0;e.triggerKnockout(e.getFighters()[0],e.getFighters()[seat]);}
  assert.equal(e.roundOver,true);
  await delay(50);
  assert.equal(submissions.length,1);
  assert.deepEqual(submissions[0].accountIds,ids.slice(0,4));
  assert.deepEqual(submissions[0].places,[1,2,1,2]);
  assert.equal(submissions[0].winningTeam,'RED');
  assert.equal(peers[0].messages.some(m=>m.type==='ranked_result'&&m.result.recorded),true);
  await delay(80);assert.equal(submissions.length,1,'server cannot score same match twice');
 }finally{
  if(peers[0].room)groupRooms.handle(peers[0],{type:'leave'});
  Object.assign(ranked,originals);
 }
});

test('normal and heavy fighters can still jump onto the first platform in the tallest forest layout',()=>{
 for(const archetype of ['SHOTO_BALANCED','GRAPPLER_TANK']){
  const first={...profile(0),archetype};
  const e=new FightEngine(first,profile(1),'1P_VS_2P','SPIRIT_FOREST');
  e.p1.x=100;e.queueNetworkJump(0);let landed=false;
  for(let i=0;i<110;i++){e.step();if(e.p1.y===302){landed=true;break;}}
  assert.equal(landed,true,`${archetype} must reach the forest first platform`);
 }
});
