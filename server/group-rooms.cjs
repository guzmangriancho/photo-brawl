'use strict';
const {randomBytes,randomInt,randomUUID}=require('node:crypto');
const rankedApi=require('./ranked.cjs');
const economyApi=require('./economy.cjs');
const {MultiFightEngine}=require('./runtime/engine/MultiFightEngine.js');
const {unpackControls}=require('./runtime/network/protocol.js');
const {validateProfile,cleanActions}=require('./validation.cjs');
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COUNTDOWN_MS=Math.max(300,Math.min(10000,Number(process.env.ONLINE_GROUP_START_COUNTDOWN_MS)||600));
const GROUP_STAGES=['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];
const WAIT_GRACE=Math.max(15000,Math.min(180000,Number(process.env.ONLINE_RECONNECT_GRACE_MS)||90000));
const rooms=new Map();
let legacyCodes=()=>new Set();
function setLegacyCodes(fn){legacyCodes=fn;}
function newCode(){let code;do{code=Array.from({length:6},()=>LETTERS[randomInt(LETTERS.length)]).join('');}while(rooms.has(code)||legacyCodes().has(code));return code;}
function send(p,msg){return p?.peer?.send(msg)||false;}
function each(room,msg){for(const p of room.players)send(p,msg);}
function fail(peer,message){peer.send({type:'error',message});}
function roomView(room,p){return {code:room.code,role:p.seat===0?'host':'guest',slot:p.seat,battleMode:room.mode,
  status:room.status==='playing'&&room.players.some(s=>!s.peer)?'interrupted':room.status,
  stage:room.stage,randomStage:room.randomStage,ranked:room.ranked,countdownEndsAt:room.countdownEndsAt,
  host:{name:room.players[0].profile.fighterName,ready:room.players[0].ready,connected:!!room.players[0].peer},
  guest:room.players[1]?{name:room.players[1].profile.fighterName,ready:room.players[1].ready,connected:!!room.players[1].peer}:null,
  players:room.players.map(s=>({seat:s.seat,name:s.profile.fighterName,ready:s.ready,connected:!!s.peer,team:room.mode==='2V2'?(s.seat%2===0?'RED':'BLUE'):null})),
  maxPlayers:4};}
function lobby(room){for(const p of room.players)send(p,{type:'room',room:roomView(room,p)});}
function newPlayer(peer,seat,profile,accountId=null){return {peer,seat,profile,accountId,token:randomBytes(24).toString('hex'),ready:false,vote:false,
  mask:0,lastSeq:-1,rateAt:0,rateCount:0,actionAt:0,actionCount:0,lostAt:0};}
function bind(peer,room,p){peer.room=room;peer.player=p;p.peer=peer;p.lostAt=0;send(p,{type:'welcome',code:room.code,role:p.seat===0?'host':'guest',slot:p.seat,token:p.token});}
function cancelCountdown(room){if(room.countdownTimer)clearTimeout(room.countdownTimer);room.countdownTimer=null;room.countdownEndsAt=null;if(room.status==='countdown')room.status='waiting';}
function start(room){
  if(room.status!=='countdown')return;
  cancelCountdown(room);
  if(room.players.length!==4||room.players.some(p=>!p.peer||!p.ready)){lobby(room);return;}
  if(room.randomStage){const options=GROUP_STAGES.filter(id=>id!==room.stage);room.stage=options[randomInt(options.length)];}
  room.engine=new MultiFightEngine(room.players.map(p=>p.profile),room.mode,room.stage,'NORMAL');
  room.engine.beginVersusIntro();
  room.engine.remoteHumanControls=true;
  room.status='playing';room.matchId=randomUUID();room.resultRecorded=false;
  for(const p of room.players){p.mask=0;p.vote=false;p.lastSeq=-1;}
  each(room,{type:'start',code:room.code,p1:room.players[0].profile,p2:room.players[1].profile,
    fighters:room.players.map(p=>p.profile),battleMode:room.mode,stage:room.stage,rankTrophies:room.ranked?room.players.map(p=>p.trophies||0):undefined});
  lobby(room);each(room,{type:'state',state:room.engine.exportNetworkState()});
  if(room.tick)clearInterval(room.tick);
  room.tick=setInterval(()=>{
    if(room.status!=='playing'||room.players.some(p=>!p.peer))return;
    for(const p of room.players)room.engine.setSeatInput(p.seat,unpackControls(p.mask));
    room.engine.step();
    if(room.ranked&&room.engine.roundOver&&!room.resultRecorded){
      room.resultRecorded=true;
      const summary=room.engine.getMultiSummary();
      const matchId=room.matchId,accountIds=room.players.map(p=>p.accountId),places=summary.players.map(p=>p.place);
      void rankedApi.recordGroupResult({id:room.matchId,mode:room.mode,
        accountIds:room.players.map(p=>p.accountId),
        places:summary.players.map(p=>p.place),stage:room.stage,winningTeam:summary.winningTeam,
        fighterIds:room.players.map(p=>p.profile.id)})
        .then(result=>{if(result.recorded&&Array.isArray(result.fighters)){for(const f of result.fighters){if(room.players[f.seat])room.players[f.seat].trophies=f.after;}}each(room,{type:'ranked_result',result});
          // Monedas por puesto: solo si el ELO se registró; un fallo económico nunca afecta al resultado.
          if(result.recorded&&economyApi.available())void economyApi.rewardGroup({id:matchId,accountIds,places})
            .then(economy=>each(room,{type:'economy',economy:{group:true,players:economy.players}}))
            .catch(error=>console.error('[economy] premio de grupo fallido:',error.message));})
        .catch(error=>{console.error('[ranked4]',error.message);
          each(room,{type:'ranked_result',result:{recorded:false,reason:'server_error'}});});
    }
    if(room.engine.frameCount%2===0)each(room,{type:'state',state:room.engine.exportNetworkState()});
  },1000/60);
}
function maybeStart(room){
  if(room.status!=='waiting'||room.players.length!==4||room.players.some(p=>!p.ready||!p.peer))return;
  room.status='countdown';room.countdownEndsAt=Date.now()+COUNTDOWN_MS;
  room.countdownTimer=setTimeout(()=>start(room),COUNTDOWN_MS);lobby(room);
}
function remove(room){if(!rooms.has(room.code))return;rooms.delete(room.code);cancelCountdown(room);if(room.tick)clearInterval(room.tick);
  for(const p of room.players)if(p.peer){const peer=p.peer;p.peer=null;peer.room=null;peer.player=null;send({peer},{type:'closed'});}}
function handle(peer,msg){
  const now=Date.now();if(!peer.groupRateAt||now-peer.groupRateAt>=1000){peer.groupRateAt=now;peer.groupRateCount=0;}
  if(++peer.groupRateCount>160)return;
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return fail(peer,'Solicitud no válida.');
  const room=peer.room,p=peer.player;
  if(msg.type==='create'){
    if(room)return fail(peer,'Ya estás en una sala.');
    const profile=validateProfile(msg.profile);
    if(!profile)return fail(peer,'Luchador no válido.');
    if(!['2V2','FREE_FOR_ALL'].includes(msg.battleMode))return fail(peer,'Modo no disponible.');
    if(rooms.size>=40)return fail(peer,'Servidor ocupado.');
    const ranked=msg.ranked===true;
    if(ranked&&!rankedApi.available())return fail(peer,'ELO no configurado en el servidor.');
    const finish=accountId=>{
      if(peer.room)return;
      const host=newPlayer(peer,0,profile,accountId);
      const r={isGroup:true,code:newCode(),mode:msg.battleMode,ranked,
        stage:GROUP_STAGES.includes(msg.stage)?msg.stage:GROUP_STAGES[0],
        randomStage:false,players:[host],status:'waiting',countdownTimer:null,
        countdownEndsAt:null,tick:null,engine:null,created:Date.now(),matchId:null,resultRecorded:false};
      rooms.set(r.code,r);bind(peer,r,host);lobby(r);
    };
    if(ranked)void rankedApi.verifyUser(msg.accessToken).then(async accountId=>{await rankedApi.verifyRankedFighter(accountId,profile);const cups=await rankedApi.getFighterTrophies(accountId,profile);finish(accountId);if(peer.player)peer.player.trophies=cups;}).catch(error=>fail(peer,error.message));
    else finish(null);
    return;
  }
  if(msg.type==='join'){
    if(room)return fail(peer,'Ya estás en una sala.');
    const r=rooms.get(String(msg.code||'').toUpperCase());
    if(!r||r.status!=='waiting'||r.players.length>=4)return fail(peer,'Sala no encontrada o completa.');
    const profile=validateProfile(msg.profile);if(!profile)return fail(peer,'Luchador no válido.');
    const finish=accountId=>{
      if(peer.room||!rooms.has(r.code)||r.status!=='waiting'||r.players.length>=4)
        return fail(peer,'Sala no disponible.');
      if(r.ranked&&r.players.some(p=>p.accountId===accountId))
        return fail(peer,'No puedes jugar contra tu propia cuenta.');
      const player=newPlayer(peer,r.players.length,profile,accountId);r.players.push(player);
      r.players.forEach(p=>p.ready=false);
      bind(peer,r,player);lobby(r);
    };
    if(r.ranked)void rankedApi.verifyUser(msg.accessToken).then(async accountId=>{await rankedApi.verifyRankedFighter(accountId,profile);const cups=await rankedApi.getFighterTrophies(accountId,profile);finish(accountId);if(peer.player)peer.player.trophies=cups;}).catch(error=>fail(peer,error.message));
    else finish(null);
    return;
  }
  if(msg.type==='resume'){
    if(room)return fail(peer,'Ya estás en una sala.');
    const r=rooms.get(String(msg.code||'').toUpperCase());const found=r?.players.find(p=>p.token===msg.token);
    if(!found)return fail(peer,'La sala ya no está disponible.');
    if(r.status==='countdown'){cancelCountdown(r);found.ready=false;}
    if(found.peer){const previous=found.peer;found.peer=null;previous.close();}
    found.lastSeq=-1;found.actionCount=0;found.rateCount=0;
    bind(peer,r,found);lobby(r);
    if(r.engine&&r.status==='playing'){
      send(found,{type:'start',code:r.code,p1:r.players[0].profile,p2:r.players[1].profile,
        fighters:r.players.map(p=>p.profile),battleMode:r.mode,stage:r.stage,resumed:true,rankTrophies:r.ranked?r.players.map(p=>p.trophies||0):undefined});
      send(found,{type:'state',state:r.engine.exportNetworkState()});each(r,{type:'resumed'});
    }
    return;
  }
  if(!room||!p)return fail(peer,'Primero únete a una sala.');
  if(msg.type==='leave'){leave(peer,true);return;}
  if(msg.type==='ping'){send(p,{type:'pong',t:msg.t});return;}
  if(msg.type==='swap_seats'){
    if(p.seat!==0||room.mode!=='2V2'||room.status!=='waiting')return;
    const a=msg.a,b=msg.b;
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||a>3||b<1||b>3||a===b||a%2===b%2)return fail(peer,'Intercambio de equipos inválido.');
    [room.players[a],room.players[b]]=[room.players[b],room.players[a]];
    room.players.forEach((s,i)=>{s.seat=i;s.ready=false;});lobby(room);return;
  }
  if(msg.type==='stage'){
    if(p.seat!==0||room.status!=='waiting')return;
    if(msg.stage!=='RANDOM'&&!GROUP_STAGES.includes(msg.stage))return fail(peer,'Solo mapas multinivel.');
    const random=msg.stage==='RANDOM';const changed=random!==room.randomStage||(!random&&room.stage!==msg.stage);
    if(changed){room.randomStage=random;if(!random)room.stage=msg.stage;room.players.forEach(p=>p.ready=false);}
    lobby(room);return;
  }
  if(msg.type==='choose'){
    if(room.status!=='waiting'&&room.status!=='countdown')return fail(peer,'No puedes cambiar durante el combate.');
    const profile=validateProfile(msg.profile);if(!profile)return fail(peer,'Luchador no válido.');
    if(profile.id===p.profile.id && Boolean(profile.ultimateForm)===Boolean(p.profile.ultimateForm))return;
    const commit=()=>{
      if(peer.room!==room||(room.status!=='waiting'&&room.status!=='countdown'))return;
      if(room.status==='countdown')cancelCountdown(room);
      p.profile=profile;room.players.forEach(p=>p.ready=false);lobby(room);
    };
    if(room.ranked){
      if(p.verifying)return fail(peer,'Comprobando luchador.');
      p.verifying=true;
      void rankedApi.verifyRankedFighter(p.accountId,profile).then(async()=>{const cups=await rankedApi.getFighterTrophies(p.accountId,profile);commit();p.trophies=cups;})
        .catch(error=>fail(peer,error.message)).finally(()=>{p.verifying=false;});
    }else commit();
    return;
  }
  if(msg.type==='ready'){
    if(room.ranked&&room.players.some(p=>p.verifying))return fail(peer,'Comprobando luchador.');
    if(room.status!=='waiting'&&room.status!=='countdown')return;
    if(room.status==='countdown'&&msg.ready!==true)cancelCountdown(room);
    p.ready=msg.ready===true;maybeStart(room);lobby(room);return;
  }
  if(msg.type==='input'){
    if(room.status!=='playing'||!room.engine||!p.peer)return;
    if(!Number.isSafeInteger(msg.seq)||msg.seq<=p.lastSeq)return;
    if(now-p.rateAt>=1000){p.rateAt=now;p.rateCount=0;}
    if(++p.rateCount>95)return;
    if(!Number.isInteger(msg.mask)||msg.mask<0||msg.mask>=16384)return;
    p.lastSeq=msg.seq;p.mask=msg.mask&(0b1111|(1<<13));
    if(now-p.actionAt>=1000){p.actionAt=now;p.actionCount=0;}
    const actions=cleanActions(msg.actions);if(actions.length+p.actionCount>24)return;
    p.actionCount+=actions.length;
    for(const action of actions){
      if(action.kind==='move')room.engine.queueNetworkAction(p.seat,action.slot);
      if(action.kind==='jump')room.engine.queueNetworkJump(p.seat);
      if(action.kind==='dash')room.engine.queueNetworkDash(p.seat,action.dir);
    }
    return;
  }
  if(msg.type==='rematch'){
    if(room.status!=='playing'||!room.engine?.roundOver)return;
    const profile=msg.profile?validateProfile(msg.profile):null;
    if(msg.profile&&!profile)return fail(peer,'Luchador de revancha no válido.');
    const vote=()=>{
      if(peer.room!==room||room.status!=='playing'||!room.engine?.roundOver)return;
      if(profile)p.profile=profile;
      p.vote=true;
      each(room,{type:'rematch_vote',votes:room.players.map(p=>p.vote),fighters:room.players.map(p=>p.profile)});
      if(room.players.length===4&&room.players.every(p=>p.vote&&p.peer)){
      if(room.randomStage){const remaining=GROUP_STAGES.filter(s=>s!==room.stage);room.stage=remaining[randomInt(remaining.length)];}
      room.engine=new MultiFightEngine(room.players.map(p=>p.profile),room.mode,room.stage,'NORMAL');
  room.engine.beginVersusIntro();
      room.engine.remoteHumanControls=true;
      room.matchId=randomUUID();room.resultRecorded=false;
      for(const p of room.players){p.vote=false;p.mask=0;p.lastSeq=-1;}
      each(room,{type:'rematch',fighters:room.players.map(p=>p.profile),stage:room.stage,rankTrophies:room.ranked?room.players.map(p=>p.trophies||0):undefined});
      each(room,{type:'state',state:room.engine.exportNetworkState()});
      }
    };
    if(room.ranked&&profile){
      if(p.verifying)return fail(peer,'Comprobando luchador.');
      p.verifying=true;
      void rankedApi.verifyRankedFighter(p.accountId,profile).then(async()=>{p.trophies=await rankedApi.getFighterTrophies(p.accountId,profile);vote();})
        .catch(error=>fail(peer,error.message)).finally(()=>{p.verifying=false;});
    }else vote();
    return;
  }
  fail(peer,'Acción no reconocida.');
}
function leave(peer,explicit){const room=peer.room,p=peer.player;if(!room||!p||p.peer!==peer)return;
  peer.room=null;peer.player=null;p.peer=null;p.mask=0;p.lostAt=Date.now();
  if(room.status==='countdown')cancelCountdown(room);
  if(explicit){
    if(room.status==='playing'||p.seat===0){each(room,{type:'opponent_left'});remove(room);}
    else {room.players.splice(p.seat,1);room.players.forEach((slot,i)=>{slot.seat=i;slot.ready=false;});lobby(room);}
  }else{lobby(room);if(room.status==='playing')each(room,{type:'interrupted',role:p.seat,seconds:Math.floor(WAIT_GRACE/1000)});}
}
function closed(peer){leave(peer,false);}
function cleanup(){const now=Date.now();for(const room of rooms.values()){
  const gone=room.players.filter(p=>!p.peer&&now-p.lostAt>WAIT_GRACE);
  if(gone.length){if(room.status==='playing'||gone.some(p=>p.seat===0)){each(room,{type:'opponent_left'});remove(room);}
    else{room.players=room.players.filter(p=>!gone.includes(p));room.players.forEach((p,i)=>{p.seat=i;p.ready=false;});lobby(room);}}
  if(room.status==='waiting'&&now-room.created>15*60000)remove(room);
}}
const cleanupTimer=setInterval(cleanup,1000);cleanupTimer.unref();
module.exports={handle,closed,rooms,setLegacyCodes,cleanup,leave};
