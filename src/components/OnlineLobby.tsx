import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Gamepad2, Globe2, Link, Loader2, ShieldCheck, UsersRound, Wifi, X } from 'lucide-react';
import type { FighterProfile, StageId, GroupBattleMode } from '../types/fighter';
import { STAGE_ART, STAGE_IDS, LARGE_ARENA_IDS } from '../data/stages';
import type { RoomView } from '../network/protocol';
import { OnlineSession } from '../network/OnlineSession';
import { usePlayerAccount } from '../services/usePlayerAccount';
import { supabaseConfigured } from '../services/supabaseClient';
import './online.css';

interface Props {
  fighter: FighterProfile; fighters: FighterProfile[]; stage: StageId;
  session: OnlineSession|null; room: RoomView|null; externalError?:string;
  onSession: (s:OnlineSession|null)=>void; onFighterChange:(fighter:FighterProfile)=>void; onClose:()=>void;
}
export function OnlineLobby({fighter,fighters,stage,session,room,externalError,onSession,onFighterChange,onClose}:Props){
  const [code,setCode]=useState(()=>new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6) || '');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const [remaining,setRemaining]=useState(3);
  const [ranked,setRanked]=useState(false);
  const [battleMode,setBattleMode]=useState<'1V1'|GroupBattleMode>('1V1');
  const [pickerOpen,setPickerOpen]=useState(false);
  const [fighterPage,setFighterPage]=useState(0);
  const {user}=usePlayerAccount();
  useEffect(()=>{
    if(room?.status!=='countdown'||!room.countdownEndsAt)return;
    const update=()=>setRemaining(Math.max(1,Math.ceil((room.countdownEndsAt!-Date.now())/1000)));
    update();const timer=setInterval(update,90);return()=>clearInterval(timer);
  },[room?.status,room?.countdownEndsAt]);
  const creating=async(isHost:boolean)=>{
    if(busy)return;
    if(!isHost&&code.replace(/[^A-Za-z0-9]/g,'').length!==6){setError('Introduce un código de 6 caracteres.');return;}
    setBusy(true);setError('');
    try{
      const next=isHost?await OnlineSession.create(fighter,battleMode==='1V1'?stage:(LARGE_ARENA_IDS.includes(stage)?stage:LARGE_ARENA_IDS[0]),ranked,battleMode==='1V1'?undefined:battleMode):await OnlineSession.join(code,fighter);
      onSession(next);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo abrir la sala.');}
    finally{setBusy(false);}
  };
  const myReady=room ? room.players?!!room.players.find(p=>p.seat===room.slot)?.ready:(room.role==='host'?room.host.ready:room.guest?.ready) : false;
  const ownFighterId=fighter.id;
  const availableFighters=fighters.filter(item=>!item.isPreset&&!item.id.startsWith('preset_'));
  const canChangeFighter=!!room&&(room.status==='waiting'||room.status==='countdown');
  const fighterPageCount=Math.max(1,Math.ceil(availableFighters.length/6));
  const visibleFighters=availableFighters.slice(Math.min(fighterPage,fighterPageCount-1)*6,(Math.min(fighterPage,fighterPageCount-1)+1)*6);
  useEffect(()=>{if(!canChangeFighter)setPickerOpen(false);},[canChangeFighter]);
  const chooseFighter=(next:FighterProfile)=>{
    if(!canChangeFighter||next.id===ownFighterId)return;
    setError('');
    session?.choose(next);
    onFighterChange(next);
    setPickerOpen(false);
  };
  const copy=async()=>{
    const text=room?.code||'';
    try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCode(text);setError('Selecciona el código para copiarlo.');}
  };
  const share=async()=>{
    if(!room)return;
    const invite=`${location.origin}${location.pathname}?room=${room.code}`;
    try{
      if(navigator.share)await navigator.share({title:'PHOTO BRAWL · VERSUS ONLINE',url:invite});
      else {await navigator.clipboard.writeText(invite);setCopied(true);}
    }catch{setError('No se pudo compartir. Copia el código de sala.');}
  };
  return <div className="pb-online-backdrop" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="pb-online-dialog pb-frame" role="dialog" aria-modal="true" aria-label="Sala online">
      <div className="pb-online-head"><div><span>VERSUS PRIVADO · EN DIRECTO</span><h2><Globe2 size={21}/> SALA ONLINE</h2></div><button type="button" aria-label="Cerrar" onClick={onClose}><X size={19}/></button></div>
      {!room ? <div className="pb-online-setup">
        <div className="pb-online-identity"><img src={fighter.portraitDataUrl} alt=""/><div><small>TU LUCHADOR</small><strong>{fighter.fighterName}</strong><span>Elige amistoso o clasificatorio. Ambos modos son privados por código.</span></div></div>
        <div className="pb-online-format" role="group" aria-label="Formato de combate">
          {([['1V1','1 VS 1'],['2V2','2 VS 2'],['FREE_FOR_ALL','FREE FOR ALL']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={battleMode===id} className={battleMode===id?'on':''}
            onClick={()=>{setBattleMode(id);if(id!=='1V1')setRanked(false);}}>{id==='2V2'?<span className="pb-team-format"><span className="pb-team-digit">2</span><span className="pb-team-vs">VS</span><span className="pb-team-digit">2</span></span>:label}</button>)}
        </div>
        {battleMode!=='1V1'&&<small className="pb-online-ranked-help">4 JUGADORES · 3 VIDAS · MAPAS MULTINIVEL · ELO OPCIONAL</small>}
        <div className="pb-online-match-kind" role="group" aria-label="Tipo de partida"><button type="button" aria-pressed={!ranked} className={!ranked?'on':''} onClick={()=>setRanked(false)}>AMISTOSO</button><button type="button" aria-pressed={ranked} className={ranked?'on':''} disabled={!user||!supabaseConfigured} onClick={()=>setRanked(true)}>CLASIFICATORIO</button></div>
        {!user&&<small className="pb-online-ranked-help">Para jugar clasificatorias, inicia sesión desde CUENTA. Puedes unirte a salas amistosas sin cuenta.</small>}
        <button type="button" className="pb-online-primary" disabled={busy} onClick={()=>creating(true)}><UsersRound size={20}/> CREAR SALA</button>
        <div className="pb-online-join"><label htmlFor="pb-room-code">CÓDIGO DE INVITACIÓN</label><div><input id="pb-room-code" maxLength={6} value={code} autoComplete="off" spellCheck={false} placeholder="ABC234" onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/><button type="button" disabled={busy} onClick={()=>creating(false)}><Link size={16}/> UNIRSE</button></div></div>
        {busy&&<p className="pb-online-message"><Loader2 size={15}/> Conectando al servidor…</p>}
      </div> : <div className="pb-online-ready">
        <div className="pb-online-code"><small>{room.battleMode?`${room.battleMode==='2V2'?'EQUIPOS 2V2':'FREE FOR ALL'} · 4 JUGADORES · ${room.ranked?'ELO':'AMISTOSO'}`:room.ranked?'CLASIFICATORIA · 2 RONDAS PARA GANAR':'AMISTOSO · CÓDIGO DE SALA'}</small><div><strong>{room.code}</strong><button type="button" onClick={copy} aria-label="Copiar código">{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'COPIADO':'COPIAR'}</button><button type="button" onClick={share} aria-label="Compartir enlace"><Link size={16}/> INVITAR</button></div></div>
        {room.battleMode && room.players ? <div className="pb-online-group-players">
          {[0,1,2,3].map(seat=>{
            const p=room.players?.find(p=>p.seat===seat);
            const own=seat===room.slot;
            return <div key={seat} className={`pb-online-group-seat ${room.battleMode==='2V2'?(seat%2===0?'team-red':'team-blue'):''}`}>
              <span>{room.battleMode==='2V2'?(seat%2===0?'EQUIPO ROJO':'EQUIPO AZUL'):'TODOS CONTRA TODOS'}</span>
              {own?<button type="button" className="pb-online-player-avatar is-mine" disabled={!canChangeFighter} onClick={()=>{setFighterPage(0);setPickerOpen(true);}} aria-label="Cambiar mi luchador"><img src={fighter.portraitDataUrl} alt=""/><small>CAMBIAR</small></button>:
                <span className="pb-online-player-avatar is-rival"><Gamepad2 size={20}/></span>}
              <strong>P{seat+1} · {p?.name||'ESPERANDO…'}</strong>
              <small>{p?(p.connected?(p.ready?'✓ LISTO':'PREPARANDO'):'RECONECTANDO'):'INVITA A OTRO JUGADOR'}</small>
            </div>;
          })}
          {room.battleMode==='2V2'&&room.slot===0&&room.players.length>=3&&room.status==='waiting'&&
            <button type="button" className="pb-online-team-swap" onClick={()=>session?.swapTeams(1,2)}>⇄ INTERCAMBIAR P2 Y P3 DE EQUIPO</button>}
        </div>:<div className="pb-online-players">
          <div className="pb-online-player">
            {room.role==='host' ? <button type="button" className="pb-online-player-avatar is-mine" onClick={()=>{setFighterPage(0);setPickerOpen(true);}} disabled={!canChangeFighter} aria-label="Cambiar mi luchador" aria-expanded={pickerOpen} title="Cambiar luchador"><img src={fighter.portraitDataUrl} alt=""/><span>CAMBIAR</span></button> : <span className="pb-online-player-avatar is-rival"><ShieldCheck size={24}/></span>}
            <strong>{room.host.name}</strong><small>{room.host.connected?(room.host.ready?'✓ LISTO':'PREPARANDO'):'RECONECTANDO'}</small>
          </div>
          <b>VS</b>
          <div className="pb-online-player">
            {room.role==='guest' ? <button type="button" className="pb-online-player-avatar is-mine" onClick={()=>{setFighterPage(0);setPickerOpen(true);}} disabled={!canChangeFighter} aria-label="Cambiar mi luchador" aria-expanded={pickerOpen} title="Cambiar luchador"><img src={fighter.portraitDataUrl} alt=""/><span>CAMBIAR</span></button> : <span className="pb-online-player-avatar is-rival"><Gamepad2 size={24}/></span>}
            <strong>{room.guest?.name||'ESPERANDO RIVAL'}</strong><small>{!room.guest?'COMPARTE EL CÓDIGO':!room.guest.connected?'RECONECTANDO':room.guest.ready?'✓ LISTO':'PREPARANDO'}</small>
          </div>
        </div>}
        {canChangeFighter && <small className="pb-online-change-tip">TOCA TU RETRATO PARA CAMBIAR DE LUCHADOR</small>}
        {room.role==='host' && room.status==='waiting' && <div className="pb-online-stages"><span>ESCENARIO · DESLIZA PARA VER MÁS</span><div className="pb-online-stage-strip" role="group" aria-label="Elegir escenario; deslizar horizontalmente">{(room.battleMode?LARGE_ARENA_IDS:STAGE_IDS).map(id=><button key={id} type="button" title={STAGE_ART[id].name} aria-label={STAGE_ART[id].name} aria-pressed={!room.randomStage&&room.stage===id} className={!room.randomStage&&room.stage===id?'is-active':''} onClick={()=>session?.stage(id)}><img src={STAGE_ART[id].image} alt=""/><span>{STAGE_ART[id].short}</span></button>)}<button type="button" className={`pb-online-stage-random ${room.randomStage?'is-active':''}`} aria-pressed={room.randomStage} onClick={()=>session?.stage('RANDOM')}><span>?</span><span>AZAR</span></button></div></div>}
        {room.role==='guest' && <div className="pb-online-stage-current"><span>ESCENARIO</span><strong>{room.randomStage?'ALEATORIO · CAMBIA EN CADA REVANCHA':STAGE_ART[room.stage].name}</strong></div>}
        {room.role==='host' && room.status!=='waiting' && <div className="pb-online-stage-current"><span>ESCENARIO</span><strong>{room.randomStage?'ALEATORIO · CAMBIA EN CADA REVANCHA':STAGE_ART[room.stage].name}</strong></div>}
        {room.status==='countdown' && <div className="pb-online-countdown" role="status" aria-live="off"><span>PREPARADOS · A COMBATIR</span><strong>{remaining}</strong><small>INICIO AUTOMÁTICO</small></div>}
        <div className="pb-online-ready-actions"><button type="button" className={myReady?'is-ready':''} onClick={()=>session?.ready(!myReady)}><Check size={17}/> {room.status==='countdown'?'CANCELAR':myReady?'ESTOY LISTO ✓':'ESTOY LISTO'}</button><button type="button" onClick={onClose}><ArrowLeft size={16}/> VOLVER AL MENÚ</button></div>

        <button className="pb-online-leave" type="button" onClick={()=>{session?.close();onSession(null);}}>ABANDONAR SALA</button>
      </div>}
      {pickerOpen && canChangeFighter && <div className="pb-online-picker-shade" onPointerDown={e=>{if(e.target===e.currentTarget)setPickerOpen(false);}}>
        <section className="pb-online-picker-dialog" role="dialog" aria-modal="true" aria-label="Elegir luchador">
          <div className="pb-online-picker-top"><div><small>TU EQUIPO</small><strong>ELIGE LUCHADOR</strong></div><button type="button" onClick={()=>setPickerOpen(false)} aria-label="Cerrar selector"><X size={18}/></button></div>
          <div className="pb-online-fighter-list" aria-label="Elegir luchador para la sala">
            {visibleFighters.map(item=><button key={item.id} type="button" className={item.id===ownFighterId?'is-active':''} aria-pressed={item.id===ownFighterId} onClick={()=>chooseFighter(item)}>
              <img src={item.portraitDataUrl} alt=""/><span>{item.fighterName}</span>{item.id===ownFighterId&&<Check size={14}/>}
            </button>)}
            {!availableFighters.length&&<p className="pb-online-picker-empty">No hay luchadores propios disponibles.</p>}
          </div>
          <div className="pb-online-picker-pages"><button type="button" disabled={fighterPage===0} onClick={()=>setFighterPage(p=>p-1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>{fighterPage+1} / {fighterPageCount}</span><button type="button" disabled={fighterPage>=fighterPageCount-1} onClick={()=>setFighterPage(p=>p+1)} aria-label="Página siguiente"><ChevronRight size={17}/></button></div>
          <small className="pb-online-picker-note">Cambiar luchador reinicia los votos «Estoy listo» de la sala.</small>
        </section>
      </div>}
      {(error||externalError)&&<p className="pb-online-error" role="alert">{error||externalError}</p>}
      <div className="pb-online-foot"><Wifi size={13}/> {room?.battleMode?'4 JUGADORES · SALA PRIVADA · EL SERVIDOR VALIDA KO Y RESULTADOS':'1 VS 1 · CLASIFICATORIAS CON CUENTA · SE COMPARTEN RETRATOS Y SPRITES'}</div>
    </section>
  </div>;
}
