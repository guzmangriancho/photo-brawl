import React,{useEffect,useState} from 'react';
import {Bell,BellOff,Check,Gamepad2,Loader2,MailPlus,UserMinus,UsersRound,X} from 'lucide-react';
import {PlayerAvatar} from './PlayerAvatar';
import type {GameInvitation,PublicFriend,SocialMode,SocialSnapshot} from '../services/friendsService';
import {disablePush,enablePush,pushState,type PushSupport} from '../services/pushService';
import './friends.css';

export function PushBlock(){
 const [state,setState]=useState<PushSupport|'loading'>('loading');
 const [busy,setBusy]=useState(false);
 const [note,setNote]=useState('');
 useEffect(()=>{let on=true;void pushState().then(s=>{if(on)setState(s);}).catch(()=>{if(on)setState('unsupported');});
  return()=>{on=false;};},[]);
 const toggle=async()=>{
  if(busy)return;
  setBusy(true);setNote('');
  try{
   if(state==='enabled'){await disablePush();setState('available');setNote('Avisos desactivados en este dispositivo.');}
   else{const next=await enablePush();setState(next);if(next==='denied')setNote('El navegador tiene los avisos bloqueados: actívalos en sus ajustes.');}
  }catch(e){setNote(e instanceof Error?e.message:'No se pudo cambiar el aviso.');}
  finally{setBusy(false);}
 };
 if(state==='loading'||state==='unsupported')return null;
 return <section className="pb-push-block"><h3>AVISOS PUSH</h3>
  <p className="pb-push-hint">Recibe un aviso aunque la app esté cerrada cuando un amigo te invite a un combate o te envíe una solicitud.{state==='unconfigured'?' (Aún no activado en el servidor.)':''}</p>
  {state!=='unconfigured'&&<button type="button" disabled={busy||state==='denied'} onClick={()=>void toggle()}>
   {state==='enabled'?<><BellOff size={15}/> DESACTIVAR</>:<><Bell size={15}/> ACTIVAR AVISOS</>}</button>}
  {state==='enabled'&&<small className="pb-push-on"><Bell size={13}/> ACTIVOS EN ESTE DISPOSITIVO</small>}
  {note&&<p className="pb-push-hint" role="status">{note}</p>}
 </section>;
}

type Props={social:SocialSnapshot;error:string;roomMode:SocialMode|null;roomRanked:boolean;isHost:boolean;defaultMode:SocialMode;defaultRanked:boolean;
 onClose:()=>void;onRequest:(username:string)=>Promise<string>;onReply:(id:string,accept:boolean)=>Promise<void>;
 onRemove:(id:string)=>Promise<void>;onInvite:(id:string,mode:SocialMode,ranked:boolean)=>Promise<void>;
 onJoin:(invitation:GameInvitation)=>Promise<void>;
 onDecline:(id:string)=>Promise<void>;onRefresh:()=>void};
export function FriendsPanel({social,error,roomMode,roomRanked,isHost,defaultMode,defaultRanked,onClose,onRequest,onReply,onRemove,onInvite,onJoin,onDecline,onRefresh}:Props){
 const [username,setUsername]=useState('');
 const [mode,setMode]=useState<SocialMode>(defaultMode);
 const [ranked,setRanked]=useState(defaultRanked);
 const [busy,setBusy]=useState('');
 const [notice,setNotice]=useState('');
 const [invited,setInvited]=useState<Record<string,boolean>>({});
 const markInvited=(id:string)=>{
  setInvited(v=>({...v,[id]:true}));
  setTimeout(()=>setInvited(v=>{const n={...v};delete n[id];return n;}),5000);
 };
 const action=async(key:string,fn:()=>Promise<unknown>)=>{
  if(busy)return;
  setBusy(key);setNotice('');
  try{await fn();onRefresh();}
  catch(e){setNotice(e instanceof Error?e.message:'No se pudo completar la acción');}
  finally{setBusy('');}
 };
 const inviteMode=roomMode||mode;
 const inviteRanked=roomMode?roomRanked:ranked;
 const inviteLocked=roomMode!==null&&!isHost;
 const modeLabel=(value:SocialMode)=>value==='1V1'?'1 VS 1':value==='2V2'?'2 VS 2':'TODOS CONTRA TODOS';
 const profile=(p:PublicFriend,controls:React.ReactNode)=><div key={p.id} className="pb-friend-row">
   <PlayerAvatar path={p.favorite_avatar_path} size="small"/>
   <span className="pb-friend-names"><strong>{p.display_name}</strong><small>@{p.username}</small></span>
   <div className="pb-friend-actions">{controls}</div>
 </div>;
 return <div className="pb-friends-shade" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="pb-friends-dialog pb-frame" role="dialog" aria-modal="true" aria-label="Amigos e invitaciones">
   <header><div><small>PHOTO BRAWL · SOCIAL</small><h2><UsersRound size={22}/> AMIGOS</h2></div><button type="button" onClick={onClose} aria-label="Cerrar amigos"><X size={19}/></button></header>
   <div className="pb-friends-scroll">
    <div className="pb-friends-search"><label htmlFor="pb-friend-user">AÑADIR POR USUARIO</label>
     <div><input id="pb-friend-user" value={username} maxLength={24} placeholder="@nombredeusuario" autoCapitalize="none" autoComplete="off" onChange={e=>setUsername(e.target.value.replace(/^@/,''))}/>
      <button type="button" disabled={!username.trim()||!!busy} onClick={()=>action('request',async()=>{
       const result=await onRequest(username);setUsername('');setNotice(result==='accepted'?'¡Ahora sois amigos!':result==='already_friends'?'Ya sois amigos':result==='already_sent'?'Solicitud ya enviada':'Solicitud enviada');
      })}><MailPlus size={16}/> AÑADIR</button></div></div>
    {social.invitations.length>0&&<section><h3>INVITACIONES · {social.invitations.length}</h3>{social.invitations.map(i=><div className="pb-friend-invite" key={i.id}>
     <strong>{i.sender.display_name} <small>@{i.sender.username}</small></strong><span>{modeLabel(i.battle_mode)} · {i.ranked?'CLASIFICATORIO':'AMISTOSO'}</span>
     <div><button type="button" disabled={!!busy} onClick={()=>action(i.id,()=>onJoin(i))}><Gamepad2 size={15}/> UNIRME</button><button type="button" disabled={!!busy} onClick={()=>action(i.id,()=>onDecline(i.id))}>RECHAZAR</button></div>
    </div>)}</section>}
    {social.incoming.length>0&&<section><h3>SOLICITUDES · {social.incoming.length}</h3>{social.incoming.map(p=>profile(p,<><button title="Aceptar" aria-label={`Aceptar a ${p.username}`} disabled={!!busy} onClick={()=>action(p.id,()=>onReply(p.id,true))}><Check size={16}/></button><button title="Rechazar" aria-label={`Rechazar a ${p.username}`} disabled={!!busy} onClick={()=>action(p.id,()=>onReply(p.id,false))}><X size={16}/></button></>))}</section>}
    <section><h3>MIS AMIGOS · {social.friends.length}</h3>
     {!!social.friends.length&&<div className="pb-friends-match-options">
      {roomMode?<span>INVITAR A SALA · {modeLabel(roomMode)} · {roomRanked?'RANKED':'AMISTOSO'}</span>:<>
       <label htmlFor="pb-friend-mode">MODO</label><select id="pb-friend-mode" value={mode} onChange={e=>setMode(e.target.value as SocialMode)}><option value="1V1">1 VS 1</option><option value="2V2">2 VS 2</option><option value="FREE_FOR_ALL">TODOS CONTRA TODOS</option></select>
       <label className="pb-friend-ranked"><input type="checkbox" checked={ranked} onChange={e=>setRanked(e.target.checked)}/> RANKED</label>
      </>}
     </div>}
     {social.friends.length?<div className="pb-friends-list">{social.friends.map(p=>profile(p,<><button className={`pb-friend-invite-btn ${invited[p.id]?'is-sent':''}`} type="button" disabled={!!busy||inviteLocked||!!invited[p.id]} title={inviteLocked?'Solo el anfitrión puede invitar':'Invitar a jugar'} onClick={()=>action(p.id,async()=>{await onInvite(p.id,inviteMode,inviteRanked);markInvited(p.id);})}><Gamepad2 size={15}/> {invited[p.id]?'✓ ENVIADA':'INVITAR'}</button><button className="pb-friend-remove" type="button" title="Eliminar amigo" aria-label={`Eliminar a ${p.username}`} disabled={!!busy} onClick={()=>{if(window.confirm(`¿Eliminar a @${p.username} de tus amigos?`))void action(p.id,()=>onRemove(p.id));}}><UserMinus size={15}/></button></>))}</div>:<p className="pb-friends-empty">Busca a un jugador por su @usuario para agregarlo.</p>}
     {inviteLocked&&<p className="pb-friends-empty">Solo el anfitrión puede enviar invitaciones a esta sala.</p>}
    </section>
    {social.outgoing.length>0&&<section><h3>ENVIADAS · {social.outgoing.length}</h3>{social.outgoing.map(p=>profile(p,<button type="button" disabled={!!busy} onClick={()=>action(p.id,()=>onRemove(p.id))}>CANCELAR</button>))}</section>}
   </div>
   {busy&&<div className="pb-friends-status" role="status"><Loader2 size={14}/> PROCESANDO…</div>}
   {(notice||error)&&<p className="pb-friends-status" role="status">{notice||error}</p>}
   <footer><button type="button" onClick={onClose}>VOLVER</button></footer>
  </section>
 </div>;
}
