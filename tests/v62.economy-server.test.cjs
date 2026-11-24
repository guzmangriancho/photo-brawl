'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
process.env.ONLINE_START_COUNTDOWN_MS='300';
const ranked=require('../server/ranked.cjs');
const economy=require('../server/economy.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/re0AAAAASUVORK5CYII=';
function profile(name){return {id:name,fighterName:name,subtitle:'PRUEBA',archetype:'SHOTO_BALANCED',passiveTrait:'FAST_METER_GAIN',
  stats:{hp:25,speed:25,power:25,technique:25},traitDescription:'demo',
  moveset:{lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'OVERHEAD_SMASH'},
    specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL',visualAction:'x',primaryHex:'#55eaff'},
    specialForward:{name:'RUSH',mechanic:'ARMORED_SHOULDER_DASH',visualAction:'x'},
    specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:'x'},ultimateSuper:{name:'SUPER',mechanic:'MULTI_HIT_RUSH_COMBO',visualAction:'x'}},
  spriteSheetDataUrl:png,portraitDataUrl:png,createdAt:1};}
const calls=[];let lockResult={ok:true};const coins={A:500,B:500};
ranked.verifyUser=async token=>token.slice(0,1);
ranked.verifyRankedFighter=async()=>true;ranked.getFighterTrophies=async()=>0;
ranked.recordResult=async()=>({recorded:true});ranked.available=()=>true;
economy.available=()=>true;
economy.wallet=async id=>({coins:coins[id]});
economy.lockWager=async a=>{calls.push(['lock',a]);return lockResult;};
economy.settleMatch=async a=>{calls.push(['settle',a]);return {settled:true,winner:'host',stake:a.hostRounds===2?50:0,host:{reward:25,wager:50,balance:1},guest:{reward:10,wager:-50,balance:1}};};
economy.forfeitWager=async a=>{calls.push(['forfeit',a]);return {settled:true};};
economy.refundWager=async id=>{calls.push(['refund',id]);return {refunded:true};};
const rooms=require('../server/rooms.cjs');
function peer(){const p={msgs:[],send(m){this.msgs.push(m);return true;},close(){}};return p;}
const last=(p,type)=>[...p.msgs].reverse().find(m=>m.type===type);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(){
  calls.length=0;lockResult={ok:true};
  const host=peer(),guest=peer();
  rooms.handle(host,{type:'create',profile:profile('H'),ranked:true,stage:'SKI_RESORT',accessToken:'A'.repeat(40)});
  await wait(20);
  const code=last(host,'welcome').code;
  rooms.handle(guest,{type:'join',code,profile:profile('G'),accessToken:'B'.repeat(40)});
  await wait(20);
  return {host,guest,code};
}
test('apuesta: solo el anfitrion, valores validos y saldo suficiente',async()=>{
  const {host,guest,code}=await setup();
  rooms.handle(guest,{type:'wager',amount:50});
  assert.match(last(guest,'error').message,/apuesta/i);
  rooms.handle(host,{type:'wager',amount:33});
  assert.match(last(host,'error').message,/no válida/);
  coins.A=20;rooms.handle(host,{type:'wager',amount:50});await wait(20);
  assert.match(last(host,'error').message,/monedas suficientes/);
  coins.A=500;rooms.handle(host,{type:'wager',amount:50});await wait(20);
  assert.equal(last(host,'room').room.wager,50);assert.equal(last(guest,'room').room.wager,50);
  rooms.handle(host,{type:'leave'});
  assert.equal(rooms.rooms.has(code),false);
});
test('apuesta: se bloquea al empezar, se liquida y se muestra el resultado',async()=>{
  const {host,guest,code}=await setup();
  rooms.handle(host,{type:'wager',amount:50});await wait(20);
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});
  await wait(700);
  const lock=calls.find(c=>c[0]==='lock');
  assert.ok(lock,'debe bloquear la apuesta');assert.equal(lock[1].stake,50);assert.equal(lock[1].hostId,'A');assert.equal(lock[1].guestId,'B');
  assert.ok(last(host,'start'));
  const room=rooms.rooms.get(code);
  room.engine.roundOver=true;room.engine.p1RoundWins=2;room.engine.p2RoundWins=0;
  await wait(250);
  const settle=calls.find(c=>c[0]==='settle');
  assert.ok(settle);assert.equal(settle[1].reward,true);assert.equal(settle[1].hostRounds,2);
  assert.equal(last(guest,'economy').economy.winner,'host');
  rooms.handle(host,{type:'leave'});
  assert.equal(calls.some(c=>c[0]==='forfeit'),false,'tras liquidar no hay abandono');
});
test('apuesta: monedas insuficientes cancelan el inicio y reinician el listo',async()=>{
  const {host,guest,code}=await setup();
  rooms.handle(host,{type:'wager',amount:25});await wait(20);
  lockResult={ok:false,reason:'guest_insufficient'};
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});
  await wait(700);
  assert.match(last(host,'error').message,/G no tiene monedas/);
  assert.equal(last(host,'start'),undefined);
  assert.equal(rooms.rooms.get(code).status,'waiting');
  assert.equal(rooms.rooms.get(code).host.ready,false);
  rooms.handle(host,{type:'leave'});
});
test('apuesta: abandonar en mitad de la partida pierde la apuesta',async()=>{
  const {host,guest,code}=await setup();
  rooms.handle(host,{type:'wager',amount:10});await wait(20);
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});
  await wait(700);
  assert.ok(last(guest,'start'));
  rooms.handle(guest,{type:'leave'});
  await wait(30);
  const f=calls.find(c=>c[0]==='forfeit');
  assert.ok(f);assert.equal(f[1].loserId,'B');
  assert.equal(rooms.rooms.has(code),false);
});
test('sin apuesta no se toca el monedero y las salas amistosas no admiten apuesta',async()=>{
  const {host,guest,code}=await setup();
  rooms.handle(host,{type:'ready',ready:true});rooms.handle(guest,{type:'ready',ready:true});
  await wait(700);
  assert.equal(calls.some(c=>c[0]==='lock'),false);
  rooms.handle(host,{type:'leave'});
  const h2=peer();rooms.handle(h2,{type:'create',profile:profile('H'),ranked:false,stage:'SKI_RESORT'});await wait(10);
  rooms.handle(h2,{type:'wager',amount:50});assert.match(last(h2,'error').message,/apuesta/i);
  rooms.handle(h2,{type:'leave'});
});
