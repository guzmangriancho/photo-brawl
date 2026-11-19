'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {once}=require('node:events');
const fs=require('node:fs');
const ts=(()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const {validateProfile}=require('../server/validation.cjs');
const {pickRandomStage}=require('../server/rooms.cjs');
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
  server=spawn(process.execPath,['server/index.cjs'],{cwd:root,env:{...process.env,ONLINE_PORT:String(PORT),ONLINE_START_COUNTDOWN_MS:"450"},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<50;i++){
    try{const res=await fetch(`http://127.0.0.1:${PORT}/health`);if(res.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,40));
  }
  throw new Error('server did not start');
});
test.after(()=>server?.kill());
test('server rejects altered stats or unsupported mechanics',()=>{
  const p=profile('GOOD');assert.ok(validateProfile(p));
  assert.equal(validateProfile({...p,isPreset:true}),null,'tutorial characters cannot join online');
  assert.equal(validateProfile({...p,id:'preset_el_mozo'}),null,'a preset id cannot bypass the tutorial-only rule');
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
  const countdown=await host.next('room',m=>m.room.status==='countdown');
  assert.ok(countdown.room.countdownEndsAt>Date.now());
  const a=await host.next('start');const b=await guest.next('start');
  assert.equal(a.p1.fighterName,'PILOTO');assert.equal(b.p2.fighterName,'RETADOR');
  const start=await host.next('state');assert.equal(start.state.snapshot.timer,99);
  assert.equal(start.state.p2.jumpsRemaining,2);
  host.send({type:'input',seq:1,mask:2,actions:[]}); // move right
  guest.send({type:'input',seq:1,mask:1,actions:[{kind:'move',slot:'LIGHT'}]});
  // V48: the first 90 authoritative frames belong to the VS presentation; movement starts afterward.
  const moved=await host.next('state',m=>m.state.frame>105,4000);
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

test('private room enforces two-player capacity and starts automatically after ready-up',async()=>{
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
  assert.ok((await guest.next('room',m=>m.room.status==='countdown')).room.countdownEndsAt);
  assert.equal((await guest.next('start')).stage,'SKI_RESORT');
  await host.next('start');
  third.close();guest.close();host.close();
});

test('unready cancels the start countdown and a fresh ready triggers a new one',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('H'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;await host.next('room');
  const guest=await connect();guest.send({type:'join',code,profile:profile('G')});
  await guest.next('welcome');await guest.next('room');
  host.send({type:'ready',ready:true});guest.send({type:'ready',ready:true});
  await host.next('room',m=>m.room.status==='countdown');
  guest.send({type:'ready',ready:false});
  await host.next('room',m=>m.room.status==='waiting'&&!m.room.guest.ready);
  await new Promise(r=>setTimeout(r,550));
  assert.equal(host.messages.some(m=>m.type==='start'),false,'cancelled countdown cannot start');
  guest.send({type:'ready',ready:true});
  await host.next('room',m=>m.room.status==='countdown');
  await host.next('start');await guest.next('start');
  host.close();guest.close();
});
test('invalid room resume token cannot impersonate a player',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('OWNER'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;
  await host.next('room');
  const attacker=await connect();attacker.send({type:'resume',code,token:'x'.repeat(48)});
  assert.match((await attacker.next('error')).message,/recuperar/);
  attacker.close();host.close();
});


test('room lets both players change fighters before starting and cancels a pending countdown',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('HOST'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;await host.next('room');
  const guest=await connect();guest.send({type:'join',code,profile:profile('GUEST')});
  await guest.next('welcome');await guest.next('room');
  host.send({type:'ready',ready:true});guest.send({type:'ready',ready:true});
  await host.next('room',m=>m.room.status==='countdown');
  guest.send({type:'choose',profile:profile('GUEST_ALT','DOUBLE_JUMP')});
  const changed=await host.next('room',m=>m.room.status==='waiting'&&m.room.guest?.name==='GUEST_ALT');
  assert.equal(changed.room.host.ready,false);
  assert.equal(changed.room.guest.ready,false);
  await new Promise(resolve=>setTimeout(resolve,550));
  assert.equal(host.messages.some(m=>m.type==='start'),false,'fighter change must cancel the old countdown');
  host.close();guest.close();
});

test('random arena mode is shared by both players and resolves to a valid stage',async()=>{
  const host=await connect();host.send({type:'create',profile:profile('HOST'),stage:'SKI_RESORT'});
  const code=(await host.next('welcome')).code;await host.next('room');
  const guest=await connect();guest.send({type:'join',code,profile:profile('GUEST')});
  await guest.next('welcome');await guest.next('room');
  host.send({type:'stage',stage:'RANDOM'});
  const hostRoom=await host.next('room',m=>m.room.randomStage===true);
  const guestRoom=await guest.next('room',m=>m.room.randomStage===true);
  assert.equal(hostRoom.room.randomStage,true);
  assert.equal(guestRoom.room.randomStage,true);
  host.send({type:'ready',ready:true});guest.send({type:'ready',ready:true});
  await host.next('room',m=>m.room.status==='countdown');
  const start=await host.next('start');await guest.next('start');
  assert.ok(['SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE_SUNSET','INDUSTRIAL_ROOFTOP','SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'].includes(start.stage));
  host.close();guest.close();
});

test('random arena rerolls never repeat the immediately previous stage',()=>{
  const stages=['SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE_SUNSET','INDUSTRIAL_ROOFTOP','SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
  for(const previous of stages){
    for(let i=0;i<30;i++){
      const next=pickRandomStage(previous);
      assert.ok(stages.includes(next));
      assert.notEqual(next,previous);
    }
  }
});


test('online room UI contains the fighter picker and random arena control',()=>{
  const lobby=fs.readFileSync(path.join(root,'src/components/OnlineLobby.tsx'),'utf8');
  assert.match(lobby,/pb-online-fighter-list/);
  assert.match(lobby,/session\?\.choose\(next\)/);
  assert.match(lobby,/onFighterChange\(next\)/);
  assert.match(lobby,/session\?\.stage\('RANDOM'\)/);
  const css=fs.readFileSync(path.join(root,'src/components/online.css'),'utf8');
  assert.match(css,/pb-online-fighter-picker/);
});

test('rematch event applies the server-selected arena to the active client engine',()=>{
  const server=fs.readFileSync(path.join(root,'server/rooms.cjs'),'utf8');
  const session=fs.readFileSync(path.join(root,'src/network/OnlineSession.ts'),'utf8');
  const arena=fs.readFileSync(path.join(root,'src/components/FightArena.tsx'),'utf8');
  assert.match(server,/if\(room\.randomStage\)room\.stage=pickRandomStage\(room\.stage\)/);
  assert.match(server,/type:'rematch',stage:room\.stage/);
  assert.match(session,/this\.match=\{\.\.\.this\.match,stage:/);
  assert.match(arena,/onRematch\(\[event\?\.p1\|\|p1Profile,event\?\.p2\|\|p2Profile\],event\?\.stage\)/);
});

test('changed online React and TypeScript files transpile without syntax errors',()=>{
  for(const file of ['src/components/OnlineLobby.tsx','src/components/CharacterSelect.tsx','src/components/FightArena.tsx','src/network/OnlineSession.ts','src/network/protocol.ts']){
    const out=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
    const errors=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')),[],file);
  }
});
