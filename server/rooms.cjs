'use strict';
const {randomInt,randomBytes} = require('node:crypto');
const {FightEngine} = require('./runtime/engine/FightEngine.js');
const {unpackControls}=require('./runtime/network/protocol.js');
const {validateProfile,cleanActions}=require('./validation.cjs');
const EMPTY=unpackControls(0);
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Leave time for a mobile browser/PWA to be suspended and reopened.
// The game is frozen when either player disconnects.
const WAIT_GRACE=Math.max(15_000,Math.min(180_000,Number(process.env.ONLINE_RECONNECT_GRACE_MS)||90_000));
const IDLE_EXPIRY=15*60_000;
const COUNTDOWN_MS=Math.max(300,Math.min(10000,Number(process.env.ONLINE_START_COUNTDOWN_MS)||3000));
const STAGES=['SKI_RESORT','NIGHT_PLAZA','SUMMER_SUMMIT','TEMPLE_SUNSET','INDUSTRIAL_ROOFTOP'];
const rooms=new Map();
const token=()=>randomBytes(24).toString('hex');
function code(){let c;do{c=Array.from({length:6},()=>LETTERS[randomInt(LETTERS.length)]).join('');}while(rooms.has(c));return c;}
function send(player,msg){return player?.peer?.send(msg)??false;}
function each(room,msg){send(room.host,msg);send(room.guest,msg);}
function status(room){
  return (room.status==='playing' && (!room.host.peer||!room.guest?.peer))?'interrupted':room.status;
}
function lobby(room){
  for(const player of [room.host,room.guest])if(player?.peer){
    send(player,{type:'room',room:{
      code:room.code,role:player.role,status:status(room),
      stage:room.stage,countdownEndsAt:room.status==='countdown'?room.countdownEndsAt:null,
      host:{name:room.host.profile.fighterName,ready:room.host.ready,connected:Boolean(room.host.peer)},
      guest:room.guest?{name:room.guest.profile.fighterName,ready:room.guest.ready,connected:Boolean(room.guest.peer)}:null,
    }});
  }
}
function cancelCountdown(room){
  if(room.countdownTimer)clearTimeout(room.countdownTimer);
  room.countdownTimer=null;room.countdownEndsAt=null;
  if(room.status==='countdown')room.status='waiting';
}
function startMatch(room){
  if(room.status!=='countdown')return;
  cancelCountdown(room);
  if(!room.guest||!room.host.ready||!room.guest.ready||!room.host.peer||!room.guest.peer){lobby(room);return;}
  room.engine=new FightEngine(room.host.profile,room.guest.profile,'1P_VS_2P',room.stage,'NORMAL');
  room.status='playing';room.host.vote=false;room.guest.vote=false;
  room.host.mask=0;room.guest.mask=0;
  each(room,{type:'start',code:room.code,p1:room.host.profile,p2:room.guest.profile,stage:room.stage});
  lobby(room);sendState(room);
  room.tick=setInterval(()=>{
    if(room.status!=='playing'||!room.engine||!room.host.peer||!room.guest?.peer)return;
    room.engine.p1Input=unpackControls(room.host.mask);
    room.engine.p2Input=unpackControls(room.guest.mask);
    const previousRound=room.engine.roundNumber;
    room.engine.step();
    if(room.engine.roundNumber!==previousRound){room.host.mask=0;room.guest.mask=0;}
    if(room.engine.frameCount%2===0)sendState(room);
  },1000/60);
}
function beginCountdown(room){
  if(room.status!=='waiting'||!room.guest||!room.host.ready||!room.guest.ready||!room.host.peer||!room.guest.peer)return;
  room.status='countdown';room.countdownEndsAt=Date.now()+COUNTDOWN_MS;
  room.countdownTimer=setTimeout(()=>startMatch(room),COUNTDOWN_MS);
  lobby(room);
}
function fail(peer,message){peer.send({type:'error',message});}
function newPlayer(peer,role,profile){return {peer,role,profile,token:token(),ready:false,mask:0,lastSeq:-1,msgCount:0,msgTick:Date.now(),actionCount:0,actionTick:Date.now(),lostAt:0,vote:false};}
function bind(peer,room,player){
  peer.player=player;peer.room=room;player.peer=peer;player.lostAt=0;
  send(player,{type:'welcome',code:room.code,role:player.role,token:player.token});
}
function handle(peer,msg) {
  // Cheap per-connection envelope limit, including unauthenticated handshakes.
  const now=Date.now();
  if(!peer.rateAt || now-peer.rateAt>=1000){peer.rateAt=now;peer.rateCount=0;}
  if(++peer.rateCount>160)return;
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string'){fail(peer,'Solicitud no válida');return;}
  const room=peer.room,player=peer.player;
  if (msg.type==='create') {
    if(room)return fail(peer,'Ya estás en una sala.');
    const profile=validateProfile(msg.profile);
    if(!profile)return fail(peer,'Luchador no válido; comprueba los recursos PNG.');
    if(rooms.size>=40)return fail(peer,'Servidor lleno; inténtalo después.');
    const item={code:code(),host:newPlayer(peer,'host',profile),guest:null,status:'waiting',stage:STAGES.includes(msg.stage)?msg.stage:STAGES[0],engine:null,created:Date.now(),tick:null,countdownTimer:null,countdownEndsAt:null};
    rooms.set(item.code,item);bind(peer,item,item.host);lobby(item);return;
  }
  if(msg.type==='join') {
    if(room)return fail(peer,'Ya estás en una sala.');
    const codeText=String(msg.code||'').trim().toUpperCase();
    const existing=rooms.get(codeText);
    if(!existing || existing.status!=='waiting' || existing.guest)return fail(peer,'Sala no encontrada o completa.');
    const profile=validateProfile(msg.profile);
    if(!profile)return fail(peer,'Luchador no válido.');
    existing.guest=newPlayer(peer,'guest',profile);
    existing.host.ready=false;bind(peer,existing,existing.guest);lobby(existing);return;
  }
  if(msg.type==='resume') {
    if(room)return fail(peer,'Ya estás en una sala.');
    const existing=rooms.get(String(msg.code||'').toUpperCase());
    const found=existing && [existing.host,existing.guest].find(p=>p?.token===msg.token);
    if(!found)return fail(peer,'No se pudo recuperar la sala.');
    if(existing.status==='countdown'){cancelCountdown(existing);found.ready=false;}
    if(found.peer){ // Close previous connection but prevent stale close callback from removing the newly bound socket.
      const old=found.peer;found.peer=null;old.close();
    }
    found.lastSeq=-1;found.msgCount=0;found.actionCount=0;found.msgTick=Date.now();found.actionTick=Date.now();
    bind(peer,existing,found);lobby(existing);
    if(existing.engine && existing.status==='playing'){
      send(found,{type:'start',role:found.role,code:existing.code,p1:existing.host.profile,p2:existing.guest.profile,stage:existing.stage,resumed:true});
      send(found,{type:'state',state:existing.engine.exportNetworkState()});
      each(existing,{type:'resumed'});
    }
    return;
  }
  if(!room||!player)return fail(peer,'Primero crea o únete a una sala.');
  if(msg.type==='leave'){leave(peer,true);return;}
  if(msg.type==='ping'){send(player,{type:'pong',t:msg.t});return;}
  if(msg.type==='choose') {
    if(room.status!=='waiting')return fail(peer,'No puedes cambiar de luchador durante el combate.');
    const profile=validateProfile(msg.profile);
    if(!profile)return fail(peer,'Luchador no válido.');
    player.profile=profile;player.ready=false;
    if(player.role==='host' && STAGES.includes(msg.stage))room.stage=msg.stage;
    lobby(room);return;
  }
  if(msg.type==='ready') {
    if(room.status!=='waiting'&&room.status!=='countdown')return;
    if(room.status==='countdown'&&msg.ready!==true)cancelCountdown(room);
    player.ready=msg.ready===true;
    if(room.status==='waiting')beginCountdown(room);
    lobby(room);return;
  }
  if(msg.type==='stage') {
    if(room.status!=='waiting'||player.role!=='host')return;
    if(STAGES.includes(msg.stage))room.stage=msg.stage;
    lobby(room);return;
  }
  // Start is exclusively server-controlled once both users ready up.
  if(msg.type==='start')return fail(peer,'La partida empieza automáticamente cuando ambos estén listos.');
  if(msg.type==='input') {
    if(room.status!=='playing'||!room.engine || !player.peer)return;
    const now=Date.now();
    if(now-player.msgTick>1000){player.msgCount=0;player.msgTick=now;}
    if(++player.msgCount>95)return;
    if(!Number.isSafeInteger(msg.seq)||msg.seq<=player.lastSeq)return;
    player.lastSeq=msg.seq;
    if(!Number.isInteger(msg.mask)||msg.mask<0||msg.mask>=8192)return;
    // Network actions are accepted separately. The hold mask only moves/guards,
    // which prevents bypassing action rate limits with attack bits.
    player.mask=msg.mask & 0b1111;
    const index=player.role==='host'?0:1;
    if(now-player.actionTick>1000){player.actionCount=0;player.actionTick=now;}
    const actions=cleanActions(msg.actions);
    if(player.actionCount+actions.length>24)return;
    player.actionCount+=actions.length;
    for(const action of actions){
      if(action.kind==='move')room.engine.queueNetworkAction(index,action.slot);
      if(action.kind==='jump')room.engine.queueNetworkJump(index);
      if(action.kind==='dash')room.engine.queueNetworkDash(index,action.dir);
    }
    return;
  }
  if(msg.type==='rematch') {
    if(room.status!=='playing'||!room.engine?.roundOver)return;
    player.vote=true;
    each(room,{type:'rematch_vote',host:room.host.vote,guest:room.guest.vote});
    if(room.host.vote && room.guest?.vote && room.host.peer && room.guest.peer){
      room.engine=new FightEngine(room.host.profile,room.guest.profile,'1P_VS_2P',room.stage,'NORMAL');
      room.host.mask=0;room.guest.mask=0;
      room.host.lastSeq=-1;room.guest.lastSeq=-1;
      room.host.vote=false;room.guest.vote=false;
      each(room,{type:'rematch'});sendState(room);
    }
    return;
  }
  fail(peer,'Acción no reconocida.');
}
function sendState(room){
  if(!room.engine)return;
  const msg={type:'state',state:room.engine.exportNetworkState()};
  each(room,msg);
}
function remove(room){
  if(!rooms.has(room.code))return;
  rooms.delete(room.code);
  cancelCountdown(room);
  if(room.tick)clearInterval(room.tick);
  for(const p of [room.host,room.guest]) if(p?.peer){const peer=p.peer;p.peer=null;peer.room=null;peer.player=null;peer.send({type:'closed'});}
}
function leave(peer,explicit=false){
  const room=peer.room,player=peer.player;
  if(!room||!player)return;
  peer.room=null;peer.player=null;
  if(player.peer!==peer)return;
  player.peer=null;player.mask=0;player.lostAt=Date.now();
  if(room.status==='countdown'){cancelCountdown(room);player.ready=false;}
  if(explicit) {
    send(player,{type:'left'});
    if(room.status==='playing'){
      const other=player.role==='host'?room.guest:room.host;
      send(other,{type:'opponent_left'});
      remove(room);
    } else if(player.role==='host'){
      send(room.guest,{type:'opponent_left'});remove(room);
    } else {
      room.guest=null;room.host.ready=false;lobby(room);
    }
  }else{
    lobby(room);
    if(room.status==='playing')each(room,{type:'interrupted',role:player.role,seconds:Math.floor(WAIT_GRACE/1000)});
  }
}
function closed(peer){leave(peer,false);}
function cleanup(){
  const now=Date.now();
  for(const room of rooms.values()) {
    const gone=[room.host,room.guest].filter(p=>p&&!p.peer&&now-p.lostAt>WAIT_GRACE);
    if(gone.length) {
      if(room.status==='playing') {
        const survivor=room.host.peer?room.host:room.guest?.peer?room.guest:null;
        send(survivor,{type:'opponent_left'});remove(room);
      } else if(gone.includes(room.host)){
        send(room.guest,{type:'opponent_left'});remove(room);
      } else if(room.guest && gone.includes(room.guest)){
        room.guest=null;room.host.ready=false;lobby(room);
      }
    }
    if(rooms.has(room.code)&&now-room.created>IDLE_EXPIRY&&room.status==='waiting')remove(room);
  }
}
const timer=setInterval(cleanup,1000);timer.unref();
module.exports={handle,closed,leave,rooms,validateProfile,cleanup};
