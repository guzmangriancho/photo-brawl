'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {MultiFightEngine}=require('../server/runtime/engine/MultiFightEngine.js');
const group=require('../server/group-rooms.cjs');
const modes=['2V2','FREE_FOR_ALL'];
const stages=['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
const moveset={
 lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'LONG_ROUNDHOUSE'},
 specialNeutral:{name:'BOLA',mechanic:'STRAIGHT_FIREBALL',visualAction:'',primaryHex:'#40d9f5'},
 specialForward:{name:'AVANCE',mechanic:'SLIDE_LOW_KICK',visualAction:''},
 specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:''},
 ultimateSuper:{name:'SUPER',mechanic:'GIANT_BEAM_LASER',visualAction:''},
};
const profile=i=>({id:'fighter-'+i,fighterName:'FIGHTER '+i,archetype:'SHOTO_BALANCED',
 stats:{hp:25,power:25,technique:25,speed:25},moveset,passiveTrait:'FAST_METER_GAIN',
 scaleMultiplier:1,portraitDataUrl:'data:image/png;base64,abc',spriteSheetDataUrl:'data:image/png;base64,abc'});
const team=()=>[profile(0),profile(1),profile(2),profile(3)];
const make=(mode='2V2',stage=stages[0])=>{const e=new MultiFightEngine(team(),mode,stage);e.remoteHumanControls=true;return e;};
const knockout=(e,winner,loser)=>{e.getFighters()[loser].hp=0;e.triggerKnockout(e.getFighters()[winner],e.getFighters()[loser]);};
test('only the four provided large arenas are permitted for both new modes',()=>{
 for(const mode of modes)for(const stage of stages){const e=make(mode,stage);assert.equal(e.getFighters().length,4);assert.equal(e.getSnapshot().multi.mode,mode);assert.equal(e.p1.scale,0.64);}
 for(const invalid of ['SKI_RESORT','TROPICAL_BEACH','NOT_FOUND'])assert.throws(()=>make('2V2',invalid),/mapas multinivel/);
});
test('four actors have unique positions, real hitboxes, independent inputs and three stocks',()=>{
 const e=make();const p=e.getFighters();assert.deepEqual(p.map(f=>f.index),[0,1,2,3]);
 assert.equal(new Set(p.map(f=>f.x)).size,4);assert.ok(p.every(f=>f.hurtbox.width>0));
 assert.deepEqual(e.getMultiSummary().players.map(f=>f.stocks),[3,3,3,3]);
 e.setSeatInput(2,{left:true});assert.equal(e.getSeatInput(2).left,true);
 assert.equal(e.getSeatInput(1).left,false);
 const packet=e.exportNetworkState();assert.equal(packet.fighters.length,4);assert.equal(packet.snapshot.multi.players.length,4);
});
test('teams cannot deal damage to teammates; FFA can damage any opponent',()=>{
 const duo=make('2V2');const ffa=make('FREE_FOR_ALL');
 assert.equal(duo.canDamage(duo.p1,duo.getFighters()[2]),false);
 assert.equal(duo.canDamage(duo.p1,duo.p2),true);
 assert.equal(ffa.canDamage(ffa.p1,ffa.getFighters()[2]),true);
});
test('2v2 victory is awarded only after both opposing teammates lose every stock',()=>{
 const e=make('2V2');
 for(let i=0;i<3;i++){e.respawnAt[1]=0;knockout(e,0,1);}
 assert.equal(e.getMultiSummary().players[1].stocks,0);assert.equal(e.roundOver,false);
 for(let i=0;i<3;i++){e.respawnAt[3]=0;knockout(e,2,3);}
 assert.equal(e.roundOver,true);assert.equal(e.winningTeam,'RED');assert.equal(e.getMultiSummary().teamKOs[0],6);
});
test('FFA last fighter with a life wins, each KO removes one stock',()=>{
 const e=make('FREE_FOR_ALL');
 for(const loser of [1,2,3])for(let i=0;i<3;i++){e.respawnAt[loser]=0;knockout(e,0,loser);}
 assert.equal(e.roundOver,true);assert.equal(e.winnerSeat,0);
 assert.equal(e.getMultiSummary().players[0].kos,9);
});
test('timer compares lives and proportional health; exact ties are draws',()=>{
 const a=make('2V2');a.stocks=[3,2,3,2];a.timeout();assert.equal(a.winningTeam,'RED');assert.equal(a.endReason,'TIME');
 const b=make('FREE_FOR_ALL');b.stocks=[2,2,1,1];b.getFighters()[0].hp=50;b.getFighters()[1].hp=10;
 b.timeout();assert.equal(b.winnerSeat,0);
 const c=make('2V2');c.timeout();assert.equal(c.isDraw,true);
});
test('KO, deaths, assists, reset and invulnerable respawns are tracked',()=>{
 const e=make();e.onDamage(e.p1,e.p2,15);e.onDamage(e.getFighters()[2],e.p2,10);knockout(e,0,1);
 const s=e.getMultiSummary();assert.equal(s.players[0].kos,1);assert.equal(s.players[2].assists,1);
 assert.equal(s.players[1].deaths,1);assert.equal(s.players[1].stocks,2);
 assert.ok(s.players[1].respawnIn>0);
 e.resetRound();assert.deepEqual(e.getMultiSummary().players.map(p=>[p.stocks,p.kos,p.assists]),[[3,0,0],[3,0,0],[3,0,0],[3,0,0]]);
});
test('reconnect state replication preserves four actors and tournament score',()=>{
 const host=make();host.getFighters()[2].x=371;host.stocks[3]=2;host.kos[0]=1;
 const peer=make();peer.applyNetworkState(host.exportNetworkState());
 assert.equal(peer.getFighters()[2].x,371);assert.equal(peer.getMultiSummary().players[3].stocks,2);
 assert.equal(peer.getMultiSummary().players[0].kos,1);
});
test('four-player lobbies validate capacity, team swaps, stage whitelist and ranked configuration',()=>{
 const makePeer=()=>({messages:[],send(m){this.messages.push(m);return true;},close(){}});
 const peers=Array.from({length:5},makePeer);
 group.handle(peers[0],{type:'create',profile:profile(0),battleMode:'2V2',stage:stages[0]});
 const room=peers[0].room;assert.ok(room,JSON.stringify(peers[0].messages.at(-1)));
 const code=room.code;
 for(let i=1;i<4;i++)group.handle(peers[i],{type:'join',code,profile:profile(i)});
 assert.equal(room.players.length,4);
 group.handle(peers[4],{type:'join',code,profile:profile(4)});
 assert.equal(peers[4].room,undefined);assert.equal(room.players.length,4);
 group.handle(peers[0],{type:'stage',stage:'SKI_RESORT'});assert.equal(room.stage,stages[0]);
 group.handle(peers[0],{type:'swap_seats',a:1,b:2});assert.equal(peers[2].player.seat,1);assert.equal(peers[1].player.seat,2);
 assert.deepEqual(room.players.map(p=>p.ready),[false,false,false,false]);
 group.handle(peers[0],{type:'leave'});assert.equal(group.rooms.has(code),false);
 const forbidden=makePeer();group.handle(forbidden,{type:'create',profile:profile(1),ranked:true,battleMode:'2V2'});
 assert.equal(forbidden.room,undefined);assert.match(forbidden.messages.at(-1).message,/ELO no configurado/);
});
test('UI exposes new modes, 4-seat result and reusable fighter-switch rematch',()=>{
 const read=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
 assert.match(read('src/components/CharacterSelect.tsx'),/FREE_FOR_ALL/);
 assert.match(read('src/components/OnlineLobby.tsx'),/swapTeams/);
 assert.match(read('src/components/GroupFightArena.tsx'),/RematchRoster/);
 assert.match(read('src/components/FightArena.tsx'),/RematchRoster/);
 assert.match(read('src/components/RematchRoster.tsx'),/onRematch/);
 assert.match(read('src/App.tsx'),/GroupFightArena/);
});
test('four players ready, authoritative match starts and rematch switches fighter with unanimous approval',async()=>{
 const makePeer=()=>({messages:[],send(m){this.messages.push(m);return true;},close(){}});
 const peers=Array.from({length:4},makePeer);
 group.handle(peers[0],{type:'create',profile:profile(0),battleMode:'FREE_FOR_ALL',stage:stages[1]});
 const room=peers[0].room,code=room.code;
 for(let i=1;i<4;i++)group.handle(peers[i],{type:'join',code,profile:profile(i)});
 try{
   for(const p of peers)group.handle(p,{type:'ready',ready:true});
   assert.equal(room.status,'countdown');
   await new Promise(r=>setTimeout(r,3130));
   assert.equal(room.status,'playing');assert.equal(room.engine.getFighters().length,4);
   assert.ok(peers.every(p=>p.messages.some(m=>m.type==='start'&&m.fighters.length===4)));
   // Simulate an authoritative final score; clients cannot manufacture the result through a packet.
   for(const loser of [1,2,3])for(let i=0;i<3;i++){room.engine.respawnAt[loser]=0;
     room.engine.triggerKnockout(room.engine.getFighters()[0],room.engine.getFighters()[loser]);}
   assert.equal(room.engine.roundOver,true);
   const updated={...profile(1),id:'new-fighter-1',fighterName:'NEW FIGHTER'};
   group.handle(peers[1],{type:'rematch',profile:updated});
   assert.equal(room.players[1].vote,true);assert.equal(room.engine.roundOver,true);
   for(const p of [peers[0],peers[2],peers[3]])group.handle(p,{type:'rematch',profile:p.player.profile});
   assert.equal(room.engine.roundOver,false);
   assert.equal(room.players[1].profile.fighterName,'NEW FIGHTER');
   assert.ok(peers.every(p=>p.messages.some(m=>m.type==='rematch'&&m.fighters[1].fighterName==='NEW FIGHTER')));
 }finally{group.handle(peers[0],{type:'leave'});assert.equal(group.rooms.has(code),false);}
});
