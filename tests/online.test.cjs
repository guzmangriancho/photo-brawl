'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {once}=require('node:events');
const {validateProfile}=require('../server/validation.cjs');
const root=path.join(__dirname,'..');
const PORT=18871;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/re0AAAAASUVORK5CYII=';
function profile(name,passive='FAST_METER_GAIN') {
  return {
    id:name,fighterName:name,subtitle:'LUCHADOR DE PRUEBA',archetype:'SHOTO_BALANCED',passiveTrait:passive,
    stats:{hp:25,speed:25,power:25,technique:25},traitDescription:'demo',
    moveset:{
      lightNormal:{name:'JAB',style:'FAST_JAB'},heavyNormal:{name:'SMASH',style:'OVERHEAD_SMASH'},
      specialNeutral:{name:'SHOT',mechanic:'STRAIGHT_FIREBALL',visualAction:'blue flash',primaryHex:'#55eaff'},
      specialForward:{name:'RUSH',mechanic:'ARMORED_SHOULDER_DASH',visualAction:'dash'},
      specialUp:{name:'UP',mechanic:'INVINCIBLE_UPPERCUT',visualAction:'uppercut'},
      ultimateSuper:{name:'SUPER',mechanic:'MULTI_HIT_RUSH_COMBO',visualAction:'combo'},
    },
    spriteSheetDataUrl:png,portraitDataUrl:png,createdAt:1,
  };
}
class Client{
  constructor(ws){this.ws=ws;this.messages=[];this.waiters=[];
    ws.addEventListener('message',e=>{
      let data;try{data=JSON.parse(e.data);}catch{return;}
      for(let i=0;i<this.waiters.length;i++){
        const w=this.waiters[i];if(w.fn(data)){this.waiters.splice(i,1);clearTimeout(w.timer);w.resolve(data);return;}
      }
      this.messages.push(data);
    });
  }
  send(x){this.ws.send(JSON.stringify(x));}
  next(type,pred=()=>true,timeout=3000){
    const i=this.messages.findIndex(m=>m.type===type&&pred(m));
    if(i!==-1)return Promise.resolve(this.messages.splice(i,1)[0]);
    return new Promise((resolve,reject)=>{
      const waiter={fn:m=>m.type===type&&pred(m),resolve,timer:null};
      waiter.timer=setTimeout(()=>{this.waiters=this.waiters.filter(w=>w!==waiter);reject(new Error('Timeout waiting '+type));},timeout);
      this.waiters.push(waiter);
    });
  }
  close(){this.ws.close();}
}
async function connect(){
  const ws=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  return new Client(ws);
}
let server;
test.before(async()=>{
  server=spawn(process.execPath,['server/index.cjs'],{cwd:root,env:{...process.env,ONLINE_PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<50;i++){
    try{const res=await fetch(`http://127.0.0.1:${PORT}/health`);if(res.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,40));
  }
  throw new Error('server did not start');
});
test.after(()=>server?.kill());
test('server rejects altered stats or unsupported mechanics',()=>{
  const p=profile('GOOD');assert.ok(validateProfile(p));
  p.stats.hp=35;assert.equal(validateProfile(p),null);
  p.stats.hp=25;p.moveset.specialUp.mechanic='HACK';assert.equal(validateProfile(p),null);
  p.moveset.specialUp.mechanic='INVINCIBLE_UPPERCUT';p.spriteSheetDataUrl='https://malicious.test/x';assert.equal(validateProfile(p),null);
});
test('room code, ready-up, authoritative simulation, reconnect and leave',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('PILOTO'),stage:'SKI_RESORT'});
  const welcome=await host.next('welcome');const code=welcome.code;
  assert.match(code,/^[A-Z2-9]{6}$/);
  let room=(await host.next('room')).room;
  assert.equal(room.role,'host');assert.equal(room.guest,null);
  const guest=await connect();guest.send({type:'join',code:code.toLowerCase(),profile:profile('RETADOR','DOUBLE_JUMP')});
  const guestWelcome=await guest.next('welcome');assert.equal(guestWelcome.role,'guest');
  room=(await guest.next('room')).room;assert.equal(room.host.name,'PILOTO');
  assert.equal(room.guest.name,'RETADOR');
  host.send({type:'ready',ready:true});guest.send({type:'ready',ready:true});
  await host.next('room',m=>m.room.host.ready&&m.room.guest?.ready);
  host.send({type:'start'});
  const a=await host.next('start');const b=await guest.next('start');
  assert.equal(a.p1.fighterName,'PILOTO');assert.equal(b.p2.fighterName,'RETADOR');
  const start=await host.next('state');assert.equal(start.state.snapshot.timer,99);
  assert.equal(start.state.p2.jumpsRemaining,2);
  host.send({type:'input',seq:1,mask:2,actions:[]}); // move right
  guest.send({type:'input',seq:1,mask:1,actions:[{kind:'move',slot:'LIGHT'}]});
  const moved=await host.next('state',m=>m.state.frame>15,2500);
  assert.ok(moved.state.p1.x>start.state.p1.x,'host movement is computed by the server');
  assert.ok(moved.state.p2.x<start.state.p2.x,'guest movement is computed by the server');
  assert.ok(typeof moved.state.snapshot.p1Hp==='number');
  guest.close();await host.next('interrupted');
  const resumed=await connect();resumed.send({type:'resume',code,token:guestWelcome.token});
  await resumed.next('welcome');await resumed.next('room');await resumed.next('start');
  await host.next('resumed');
  // A reloaded browser starts its sequence at 1; the recovered player must accept it.
  resumed.send({type:'input',seq:1,mask:0,actions:[{kind:'jump'}]});
  await resumed.next('state',m=>m.state.frame>moved.state.frame+3);
  resumed.send({type:'state',state:{p1Hp:0}});
  assert.equal((await resumed.next('error')).message,'Acción no reconocida.');
  resumed.send({type:'leave'});await host.next('opponent_left');
  host.close();resumed.close();
});
test('invalid room and three-player joining cannot create extra player',async()=>{
  const joiner=await connect();joiner.send({type:'join',code:'XYZABC',profile:profile('TEST')});
  assert.match((await joiner.next('error')).message,/no encontrada/);
  joiner.close();
});

test('private room enforces two-player capacity and only the host can start',async()=>{
  const host=await connect();
  host.send({type:'create',profile:profile('HOST'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;
  await host.next('room');
  const guest=await connect();guest.send({type:'join',code,profile:profile('GUEST')});
  await guest.next('welcome');await guest.next('room');
  const third=await connect();third.send({type:'join',code,profile:profile('THIRD')});
  assert.match((await third.next('error')).message,/completa/);
  guest.send({type:'stage',stage:'NIGHT_PLAZA'}); // Not allowed for guests.
  guest.send({type:'ready',ready:true});host.send({type:'ready',ready:true});
  const ready=await host.next('room',m=>m.room.guest?.ready&&m.room.host.ready);
  assert.equal(ready.room.stage,'SKI_RESORT');
  guest.send({type:'start'});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(guest.messages.some(m=>m.type==='start'),false,'guest cannot start the match');
  host.send({type:'start'});
  assert.equal((await guest.next('start')).stage,'SKI_RESORT');
  await host.next('start');
  third.close();guest.close();host.close();
});

test('invalid room resume token cannot impersonate a player',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('OWNER'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;
  await host.next('room');
  const attacker=await connect();attacker.send({type:'resume',code,token:'x'.repeat(48)});
  assert.match((await attacker.next('error')).message,/recuperar/);
  attacker.close();host.close();
});
