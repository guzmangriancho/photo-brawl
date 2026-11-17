import React,{useCallback,useEffect,useState} from 'react';
import {Check,Gift,Inbox,Loader2,RefreshCw,Send,ShieldCheck,X} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import {usePlayerAccount} from '../services/usePlayerAccount';
import {
  acceptFighterTransfer,cancelFighterTransfer,listFighterTransfers,
  rejectFighterTransfer,sendFighterTransfer,type TransferWithUser,
} from '../services/fighterTransferService';
import './community.css';

type Props={fighter?:FighterProfile;onClose?:()=>void;onImported?:(f:FighterProfile)=>void};
const PER_PAGE=3;
function spanishStatus(t:TransferWithUser){
 if(t.status==='accepted')return 'ACEPTADO · TRANSFERIDO';
 if(t.status==='declined')return 'RECHAZADO';
 if(t.status==='cancelled')return 'CANCELADO';
 if(new Date(t.expires_at).getTime()<=Date.now())return 'CADUCADO';
 return 'PENDIENTE';
}

export function FighterTransfers({fighter,onClose,onImported}:Props){
 const {user,loading}=usePlayerAccount();
 const [username,setUsername]=useState(''),[confirm,setConfirm]=useState(false),[sent,setSent]=useState(false);
 const [tab,setTab]=useState<'in'|'out'>('in');
 const [incoming,setIncoming]=useState<TransferWithUser[]>([]),[outgoing,setOutgoing]=useState<TransferWithUser[]>([]);
 const [page,setPage]=useState(0),[working,setWorking]=useState(false),[fetching,setFetching]=useState(false);
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  if(!user)return;
  setFetching(true);
  try{const result=await listFighterTransfers();setIncoming(result.incoming);setOutgoing(result.outgoing);}
  catch(error){setNotice(error instanceof Error?error.message:'No se pudo consultar el buzón.');}
  finally{setFetching(false);}
 },[user?.id]);
 useEffect(()=>{if(!user||fighter)return;void refresh();const timer=setInterval(()=>void refresh(),25000);
  const onFocus=()=>{void refresh();};window.addEventListener('focus',onFocus);
  return()=>{clearInterval(timer);window.removeEventListener('focus',onFocus);};
 },[refresh,user?.id,fighter?.id]);
 const act=async(task:()=>Promise<void>,success:string)=>{
  if(working)return false;setWorking(true);setNotice('');
  try{await task();setNotice(success);await refresh();}
  catch(error){setNotice(error instanceof Error?error.message:'No se pudo completar la acción.');return false;}
  finally{setWorking(false);}
 };
 const send=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!fighter||!username.trim()||working)return;
  if(!confirm){setConfirm(true);return;}
  const done=await act(()=>sendFighterTransfer(fighter,username),
    `Invitación enviada a @${username.trim().toLowerCase()}. Seguirás teniendo el luchador hasta que la acepte.`);
  if(done)setSent(true);setConfirm(false);
 };
 const accept=async(id:string)=>{
  await act(async()=>{
    const imported=await acceptFighterTransfer(id);
    onImported?.(imported);
  },'¡Luchador recibido! Ya está en tu colección y en tu nube privada.');
 };
 if(fighter){return <div className="pb-social-overlay" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget&&!working)onClose?.();}}>
   <section className="pb-social-dialog pb-frame pb-transfer-dialog" role="dialog" aria-modal="true" aria-label="Transferir luchador">
    <header className="pb-social-heading"><strong><Gift size={18}/> TRANSFERIR LUCHADOR</strong><button disabled={working} onClick={onClose} aria-label="Cerrar"><X size={18}/></button></header>
    <div className="pb-transfer-hero"><img src={fighter.portraitDataUrl} alt=""/><div><strong>{fighter.fighterName}</strong><small>Este luchador pasará a otra cuenta al aceptar la invitación.</small></div></div>
    {!user ? <div className="pb-social-blank"><ShieldCheck size={22}/> {loading?'Comprobando sesión…':'Inicia sesión desde CUENTA para poder transferir.'}</div> : <form className="pb-social-form" onSubmit={e=>void send(e)}>
      <label>USUARIO ÚNICO DEL DESTINATARIO
        <input value={username} autoComplete="off" spellCheck={false} maxLength={24} onChange={e=>{setUsername(e.target.value.toLowerCase().replace(/^@/,'').trim());setConfirm(false);setSent(false);setNotice('');}} placeholder="ejemplo: jugador_123" required pattern="[a-z0-9_]{3,24}"/>
      </label>
      <small>El usuario puede encontrarse en CUENTA → USUARIO ÚNICO. No hace falta compartir fotos ni archivos.</small>
      {confirm&&<p className="pb-transfer-warning" role="alert">¿Enviar a <b>@{username}</b>? Cuando lo acepte, dejará de ser tuyo. No podrás recuperarlo sin que te lo vuelvan a enviar.</p>}
      <div className="pb-social-buttons"><button type="button" disabled={working} onClick={onClose}>CANCELAR</button><button className="pb-social-gold" type="submit" disabled={working||sent||!username.trim()}>{working?<Loader2 size={15}/>:<Send size={15}/>} {sent?'INVITACIÓN ENVIADA':confirm?'CONFIRMAR ENVÍO':'TRANSFERIR'}</button></div>
    </form>}
    {notice&&<p role="status" className="pb-social-status">{notice}</p>}
   </section></div>;}
 const items=tab==='in'?incoming:outgoing;
 const pages=Math.max(1,Math.ceil(items.length/PER_PAGE));
 const pageItems=items.slice(Math.min(page,pages-1)*PER_PAGE,(Math.min(page,pages-1)+1)*PER_PAGE);
 const pending=incoming.filter(t=>t.status==='pending'&&new Date(t.expires_at).getTime()>Date.now()).length;
 return <div className="pb-transfer-inbox">
  {!user?<div className="pb-social-blank"><Inbox size={26}/> Inicia sesión para ver tus transferencias.</div>:<>
    <div className="pb-transfer-subtabs"><button className={tab==='in'?'active':''} onClick={()=>{setTab('in');setPage(0);}}>RECIBIDOS {pending?`(${pending})`:''}</button><button className={tab==='out'?'active':''} onClick={()=>{setTab('out');setPage(0);}}>ENVIADOS</button><button className="pb-transfer-refresh" aria-label="Actualizar" disabled={fetching||working} onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
    <div className="pb-transfer-list">
      {!pageItems.length&&<div className="pb-social-blank"><Gift size={22}/>{fetching?'Actualizando…':tab==='in'?'Todavía no has recibido luchadores.':'Aún no has transferido ninguno.'}</div>}
      {pageItems.map(t=><div className="pb-transfer-card" key={t.id}>
        <div className="pb-transfer-card-copy"><strong>{t.fighter_name}</strong><span>{tab==='in'?'De':'Para'} <b>@{t.username}</b></span><small>{spanishStatus(t)}</small></div>
        <div className="pb-transfer-card-actions">{t.status==='pending'&&new Date(t.expires_at).getTime()>Date.now() ? tab==='in'?<>
          <button type="button" className="pb-transfer-accept" disabled={working} onClick={()=>void accept(t.id)}><Check size={14}/> ACEPTAR</button>
          <button type="button" disabled={working} onClick={()=>void act(()=>rejectFighterTransfer(t.id),'Invitación rechazada.')}>RECHAZAR</button>
        </>:<button type="button" disabled={working} onClick={()=>void act(()=>cancelFighterTransfer(t.id),'Invitación cancelada.')}>CANCELAR</button>:null}</div>
      </div>)}
    </div>
    {pages>1&&<div className="pb-transfer-pages"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>◀</button><span>{Math.min(page,pages-1)+1} / {pages}</span><button disabled={page>=pages-1} onClick={()=>setPage(n=>n+1)}>▶</button></div>}
    <small className="pb-transfer-footnote">Los envíos pendientes caducan en 14 días. Solo se mueve el luchador; tu cuenta, ELO y demás personajes no cambian.</small>
  </>}
  {notice&&<p className="pb-social-status" role="status">{notice}</p>}
 </div>;
}
