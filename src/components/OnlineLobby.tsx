import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, Gamepad2, Globe2, Link, Loader2, ShieldCheck, UsersRound, Wifi, X } from 'lucide-react';
import type { FighterProfile, StageId } from '../types/fighter';
import type { RoomView } from '../network/protocol';
import { OnlineSession } from '../network/OnlineSession';
import './online.css';

interface Props {
  fighter: FighterProfile; stage: StageId;
  session: OnlineSession|null; room: RoomView|null; externalError?:string;
  onSession: (s:OnlineSession|null)=>void; onClose:()=>void;
}
export function OnlineLobby({fighter,stage,session,room,externalError,onSession,onClose}:Props){
  const [code,setCode]=useState(()=>new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6) || '');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const creating=async(isHost:boolean)=>{
    if(busy)return;
    if(!isHost&&code.replace(/[^A-Za-z0-9]/g,'').length!==6){setError('Introduce un código de 6 caracteres.');return;}
    setBusy(true);setError('');
    try{
      const next=isHost?await OnlineSession.create(fighter,stage):await OnlineSession.join(code,fighter);
      onSession(next);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo abrir la sala.');}
    finally{setBusy(false);}
  };
  const myReady=room ? (room.role==='host'?room.host.ready:room.guest?.ready) : false;
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
        <div className="pb-online-identity"><img src={fighter.portraitDataUrl} alt=""/><div><small>TU LUCHADOR</small><strong>{fighter.fighterName}</strong><span>Las salas son privadas y no afectan al ranking demo.</span></div></div>
        <button type="button" className="pb-online-primary" disabled={busy} onClick={()=>creating(true)}><UsersRound size={20}/> CREAR SALA</button>
        <div className="pb-online-join"><label htmlFor="pb-room-code">CÓDIGO DE INVITACIÓN</label><div><input id="pb-room-code" maxLength={6} value={code} autoComplete="off" spellCheck={false} placeholder="ABC234" onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}/><button type="button" disabled={busy} onClick={()=>creating(false)}><Link size={16}/> UNIRSE</button></div></div>
        {busy&&<p className="pb-online-message"><Loader2 size={15}/> Conectando al servidor…</p>}
      </div> : <div className="pb-online-ready">
        <div className="pb-online-code"><small>CÓDIGO DE SALA</small><div><strong>{room.code}</strong><button type="button" onClick={copy} aria-label="Copiar código">{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'COPIADO':'COPIAR'}</button><button type="button" onClick={share} aria-label="Compartir enlace"><Link size={16}/> INVITAR</button></div></div>
        <div className="pb-online-players"><div><ShieldCheck size={18}/><strong>{room.host.name}</strong><small>{room.host.connected?(room.host.ready?'LISTO':'PREPARANDO'):'RECONECTANDO'}</small></div><b>VS</b><div><Gamepad2 size={18}/><strong>{room.guest?.name||'ESPERANDO RIVAL'}</strong><small>{!room.guest?'COMPARTE EL CÓDIGO':!room.guest.connected?'RECONECTANDO':room.guest.ready?'LISTO':'PREPARANDO'}</small></div></div>
        {room.role==='host' && <div className="pb-online-stages"><span>ESCENARIO</span><div>{([['SKI_RESORT','NIEVE'],['NIGHT_PLAZA','CIUDAD'],['SUMMER_SUMMIT','CUMBRE']] as [StageId,string][]).map(([id,label])=><button key={id} type="button" className={room.stage===id?'is-active':''} onClick={()=>session?.stage(id)}>{label}</button>)}</div></div>}
        <div className="pb-online-ready-actions"><button type="button" className={myReady?'is-ready':''} onClick={()=>session?.ready(!myReady)}><Check size={17}/> {myReady?'ESTOY LISTO ✓':'ESTOY LISTO'}</button><button type="button" onClick={onClose}><ArrowLeft size={16}/> VOLVER AL MENÚ</button></div>
        <p className="pb-online-hint">{room.role==='host'?'Cuando ambos estéis listos, inicia el combate desde el botón principal del menú.':'El anfitrión iniciará el combate cuando los dos estéis listos.'}</p>
        <button className="pb-online-leave" type="button" onClick={()=>{session?.close();onSession(null);}}>ABANDONAR SALA</button>
      </div>}
      {(error||externalError)&&<p className="pb-online-error" role="alert">{error||externalError}</p>}
      <div className="pb-online-foot"><Wifi size={13}/> 1 contra 1 · Sin ranking · Se comparte el retrato y los sprites del luchador con tu rival.</div>
    </section>
  </div>;
}
