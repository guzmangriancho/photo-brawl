import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Gamepad2, Globe2, Link, Loader2, ShieldCheck, UsersRound, Wifi, X } from 'lucide-react';
import type { FighterProfile, StageId } from '../types/fighter';
import { STAGE_ART, STAGE_IDS } from '../data/stages';
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
      const next=isHost?await OnlineSession.create(fighter,stage,ranked):await OnlineSession.join(code,fighter);
      onSession(next);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo abrir la sala.');}
    finally{setBusy(false);}
  };
  const myReady=room ? (room.role==='host'?room.host.ready:room.guest?.ready) : false;
  const ownFighterId=fighter.id;
  const availableFighters=fighters.filter(item=>!item.isPreset&&!item.id.startsWith('preset_'));
  const canChangeFighter=!!room&&(room.status==='waiting'||room.status==='countdown');
  const chooseFighter=(next:FighterProfile)=>{
    if(!canChangeFighter||next.id===ownFighterId)return;
    setError('');
    session?.choose(next);
    onFighterChange(next);
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
        <div className="pb-online-match-kind" role="group" aria-label="Tipo de partida"><button type="button" aria-pressed={!ranked} className={!ranked?'on':''} onClick={()=>setRanked(false)}>AMISTOSO</button><button type="button" aria-pressed={ranked} className={ranked?'on':''} disabled={!user||!supabaseConfigured} onClick={()=>setRanked(true)}>CLASIFICATORIO</button></div>
        {!user&&<small className="pb-online-ranked-help">Para jugar clasificatorias, inicia sesión desde CUENTA. Puedes unirte a salas amistosas sin cuenta.</small>}
        <button type="button" className="pb-online-primary" disabled={busy} onClick={()=>creating(true)}><UsersRound size={20}/> CREAR SALA</button>
        <div className="pb-online-join"><label htmlFor="pb-room-code">CÓDIGO DE INVITACIÓN</label><div><input id="pb-room-code" maxLength={6} value={code} autoComplete="off" spellCheck={false} placeholder="ABC234" onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/><button type="button" disabled={busy} onClick={()=>creating(false)}><Link size={16}/> UNIRSE</button></div></div>
        {busy&&<p className="pb-online-message"><Loader2 size={15}/> Conectando al servidor…</p>}
      </div> : <div className="pb-online-ready">
        <div className="pb-online-code"><small>{room.ranked?'CLASIFICATORIA · 2 RONDAS PARA GANAR':'AMISTOSO · CÓDIGO DE SALA'}</small><div><strong>{room.code}</strong><button type="button" onClick={copy} aria-label="Copiar código">{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'COPIADO':'COPIAR'}</button><button type="button" onClick={share} aria-label="Compartir enlace"><Link size={16}/> INVITAR</button></div></div>
        <div className="pb-online-players"><div><ShieldCheck size={18}/><strong>{room.host.name}</strong><small>{room.host.connected?(room.host.ready?'LISTO':'PREPARANDO'):'RECONECTANDO'}</small></div><b>VS</b><div><Gamepad2 size={18}/><strong>{room.guest?.name||'ESPERANDO RIVAL'}</strong><small>{!room.guest?'COMPARTE EL CÓDIGO':!room.guest.connected?'RECONECTANDO':room.guest.ready?'LISTO':'PREPARANDO'}</small></div></div>
        {(room.status==='waiting'||room.status==='countdown') && <div className="pb-online-fighter-picker">
          <div className="pb-online-picker-heading"><span>TU LUCHADOR</span><small>{room.status==='countdown'?'CAMBIAR CANCELA LA CUENTA ATRÁS':'PUEDES CAMBIAR ANTES DE EMPEZAR'}</small></div>
          <div className="pb-online-fighter-list" aria-label="Elegir luchador para la sala">
            {availableFighters.map(item=><button key={item.id} type="button" className={item.id===ownFighterId?'is-active':''} aria-pressed={item.id===ownFighterId} onClick={()=>chooseFighter(item)}>
              <img src={item.portraitDataUrl} alt=""/><span>{item.fighterName}</span>{item.id===ownFighterId&&<Check size={13}/>} 
            </button>)}
          </div>
          <small className="pb-online-picker-note">Si cambias de personaje, los dos jugadores tendrán que volver a marcar «Estoy listo».</small>
        </div>}
        {room.role==='host' && room.status==='waiting' && <div className="pb-online-stages"><span>ESCENARIO</span><div>{STAGE_IDS.map(id => [id, STAGE_ART[id].short] as [StageId,string]).map(([id,label])=><button key={id} type="button" className={!room.randomStage&&room.stage===id?'is-active':''} onClick={()=>session?.stage(id)}>{label}</button>)}<button type="button" className={room.randomStage?'is-active':''} onClick={()=>session?.stage('RANDOM')}>AZAR</button></div></div>}
        {room.role==='guest' && <div className="pb-online-stage-current"><span>ESCENARIO</span><strong>{room.randomStage?'ALEATORIO · CAMBIA EN CADA REVANCHA':STAGE_ART[room.stage].name}</strong></div>}
        {room.role==='host' && room.status!=='waiting' && <div className="pb-online-stage-current"><span>ESCENARIO</span><strong>{room.randomStage?'ALEATORIO · CAMBIA EN CADA REVANCHA':STAGE_ART[room.stage].name}</strong></div>}
        {room.status==='countdown' && <div className="pb-online-countdown" role="status" aria-live="off"><span>PREPARADOS · A COMBATIR</span><strong>{remaining}</strong><small>INICIO AUTOMÁTICO</small></div>}
        <div className="pb-online-ready-actions"><button type="button" className={myReady?'is-ready':''} onClick={()=>session?.ready(!myReady)}><Check size={17}/> {room.status==='countdown'?'CANCELAR':myReady?'ESTOY LISTO ✓':'ESTOY LISTO'}</button><button type="button" onClick={onClose}><ArrowLeft size={16}/> VOLVER AL MENÚ</button></div>
        <p className="pb-online-hint">{room.status==='countdown'?'¡La partida comienza sola al terminar la cuenta atrás!':'Cuando ambos estéis listos, comenzará una cuenta atrás de 3 segundos.'}</p>
        <button className="pb-online-leave" type="button" onClick={()=>{session?.close();onSession(null);}}>ABANDONAR SALA</button>
      </div>}
      {(error||externalError)&&<p className="pb-online-error" role="alert">{error||externalError}</p>}
      <div className="pb-online-foot"><Wifi size={13}/> 1 contra 1 · Clasificatorias con cuenta y resultado validado por Render · Se comparten retratos y sprites.</div>
    </section>
  </div>;
}
