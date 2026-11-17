import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,CloudDownload,CloudUpload,Download,HardDriveDownload,KeyRound,LogOut,Save,ShieldCheck,Upload,UserRound,X} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import {supabase,supabaseConfigured} from '../services/supabaseClient';
import {restoreCloudFightersReport} from '../services/communityService';
import {getAutomaticMigrationStatus,subscribeAutomaticMigration,requestAutomaticMigration} from '../services/automaticFighterMigration';
import type {MigrationStatus} from '../services/automaticFighterMigration';
import {exportLocalFightersBackup,getAllCustomFighters,mergeCustomFighters,readLocalFightersBackup} from '../services/storageService';
import {usePlayerAccount} from '../services/usePlayerAccount';
import './community.css';

interface Props {onClose:()=>void;onRestored:(fighter:FighterProfile)=>void}
export function AccountPanel({onClose,onRestored}:Props){
 const {user,loading}=usePlayerAccount();
 const [tab,setTab]=useState<'account'|'backup'>('account');
 const [email,setEmail]=useState(''),[sent,setSent]=useState(false);
 const [handle,setHandle]=useState(''),[displayName,setDisplayName]=useState('');
 const [rating,setRating]=useState(1000),[wins,setWins]=useState(0),[losses,setLosses]=useState(0);
 const [localCount,setLocalCount]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [migration,setMigration]=useState<MigrationStatus>(getAutomaticMigrationStatus);
 useEffect(()=>subscribeAutomaticMigration(setMigration),[]);
 const fileInput=useRef<HTMLInputElement>(null);

 useEffect(()=>{
   if(!supabase||!user)return;
   let active=true;
   void supabase.from('player_profiles').select('username,display_name,rating,wins,losses').eq('id',user.id).maybeSingle()
     .then(({data,error})=>{if(!active)return;if(error){setNotice(error.message);return;}setHandle(data?.username||'');setDisplayName(data?.display_name||'JUGADOR');setRating(data?.rating??1000);setWins(data?.wins??0);setLosses(data?.losses??0);});
   return()=>{active=false;};
 },[user?.id]);
 useEffect(()=>{
   if(tab!=='backup')return;
   let active=true;
   void getAllCustomFighters().then(f=>{if(active)setLocalCount(f.filter(v=>!v.isPreset&&!v.id.startsWith('preset_')).length);})
     .catch(error=>{if(active){setLocalCount(null);setNotice(`No se pudo leer la colección: ${String(error)}`);}});
   return()=>{active=false;};
 },[tab]);

 async function sendEmail(){
   if(!supabase || busy)return;
   setBusy(true);setNotice('');
   try{
     const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.origin+'/'}});
     if(error)throw error;setSent(true);setNotice('Revisa tu correo. El enlace de acceso abrirá PHOTO BRAWL.');
   }catch(err){setNotice(err instanceof Error?err.message:'No se pudo enviar el enlace.');}finally{setBusy(false);}
 }
 async function saveProfile(){
   if(!supabase||!user||busy)return;
   const username=handle.toLowerCase().trim(),name=displayName.trim();
   if(!/^[a-z0-9_]{3,24}$/.test(username)||name.length<1||name.length>32){setNotice('Usuario: 3–24 letras minúsculas, números o _. Nombre: 1–32 caracteres.');return;}
   setBusy(true);setNotice('');
   try{
     const {error}=await supabase.from('player_profiles').update({username,display_name:name}).eq('id',user.id);
     if(error)throw error;setNotice('Perfil público actualizado.');
   }catch(err){setNotice(err instanceof Error?err.message:'No se pudo guardar.');}finally{setBusy(false);}
 }

 async function exportBackup(){
   if(busy)return;setBusy(true);setNotice('Preparando copia de seguridad…');
   try{
     const {blob,name,count}=await exportLocalFightersBackup();
     const file=new File([blob],name,{type:'application/json'});
     if(typeof navigator.canShare==='function' && navigator.canShare({files:[file]})){
       try{await navigator.share({files:[file],title:'Copia de mis luchadores PHOTO BRAWL'});}
       catch(error){if((error as Error)?.name==='AbortError'){setNotice('Exportación cancelada. Tus luchadores siguen en el dispositivo.');return;}throw error;}
     }else{
       const href=URL.createObjectURL(blob);
       const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();
       window.setTimeout(()=>URL.revokeObjectURL(href),30000);
     }
     setNotice(`Copia preparada (${count} luchadores, con sprites y retratos). Guarda el archivo en un lugar seguro.`);
   }catch(error){setNotice(error instanceof Error?error.message:'No se pudo crear la copia. No se ha modificado tu colección.');}
   finally{setBusy(false);}
 }

 async function importBackup(file?:File){
   if(!file||busy)return;
   if(fileInput.current)fileInput.current.value='';
   setBusy(true);setNotice('Comprobando la copia de seguridad…');
   try{
     if(file.size>150*1024*1024)throw new Error('El archivo supera el máximo de 150 MB.');
     const fighters=readLocalFightersBackup(await file.text());
     const report=await mergeCustomFighters(fighters);
     for(const fighter of [...report.added,...report.updated])onRestored(fighter);
     setLocalCount(c=>c===null?null:c+report.added.length);
     setNotice(`Importación segura: ${report.added.length} añadidos, ${report.updated.length} nombres actualizados, ${report.unchanged} ya presentes y ${report.conflicts} conflictos conservados como copias distintas. Sin reemplazar sprites ni estadísticas.`);
   }catch(error){setNotice(error instanceof Error?error.message:'No se pudo importar. Tu colección original se mantiene intacta.');}
   finally{setBusy(false);}
 }

 async function restore(){
   if(!user||busy)return;setBusy(true);setNotice('Descargando imágenes privadas…');
   try{
     const result=await restoreCloudFightersReport();
     // Name-only changes can update a matching local ID if the cloud name is newer;
     // artwork and combat data are never replaced.
     const report=await mergeCustomFighters(result.fighters);
     for(const fighter of [...report.added,...report.updated])onRestored(fighter);
     setLocalCount(c=>c===null?null:c+report.added.length);
     setNotice(`${report.added.length} recuperados; ${report.updated.length} nombres actualizados; ${report.unchanged} ya presentes; ${report.conflicts} conflictos conservados como nuevas copias.${result.failed.length?` ${result.failed.length} no pudieron descargarse: ${result.failed[0]}`:''} No se ha borrado ningún personaje local.`);
   }catch(error){setNotice(error instanceof Error?error.message:'No se pudo recuperar la colección. Tus luchadores locales no se han modificado.');}
   finally{setBusy(false);}
 }

 return <div className="pb-social-overlay" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
   <section className="pb-social-dialog pb-frame" role="dialog" aria-modal="true" aria-label="Cuenta y copias de seguridad de PHOTO BRAWL">
    <header className="pb-social-heading"><strong><UserRound size={17}/> MI CUENTA</strong><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar"><X size={18}/></button></header>
    <nav className="pb-account-tabs" aria-label="Cuenta y copias de seguridad">
      <button type="button" className={tab==='account'?'on':''} onClick={()=>{setTab('account');setNotice('');}}>CUENTA</button>
      <button type="button" className={tab==='backup'?'on':''} onClick={()=>{setTab('backup');setNotice('');}}>MIS COPIAS</button>
    </nav>
    {tab==='backup' ? <div className="pb-social-form pb-account-backup">
      <div className="pb-account-local"><HardDriveDownload size={19}/><span><b>{localCount===null?'…':localCount} LUCHADORES LOCALES</b><small>Tu colección permanece en este dispositivo incluso sin cuenta.</small></span></div>
      <div className="pb-social-buttons">
        <button type="button" disabled={busy} onClick={()=>void exportBackup()}><Download size={15}/> EXPORTAR ARCHIVO</button>
        <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> IMPORTAR ARCHIVO</button>
        <input ref={fileInput} className="pb-backup-file-input" type="file" accept=".json,application/json" aria-label="Seleccionar copia PHOTO BRAWL" onChange={e=>void importBackup(e.target.files?.[0])}/>
      </div>
      {supabaseConfigured && <p className="pb-social-status" role="status"><CloudUpload size={14}/> SINCRONIZACIÓN AUTOMÁTICA: {migration.message}</p>}
      {user&&supabaseConfigured?<div className="pb-social-buttons">
        <button type="button" disabled={busy||migration.phase==='syncing'} onClick={()=>requestAutomaticMigration()}><CloudUpload size={15}/> {migration.phase==='error'?'REINTENTAR COPIA PRIVADA':'COMPROBAR SINCRONIZACIÓN'}</button>
        <button type="button" disabled={busy} onClick={()=>void restore()}><CloudDownload size={15}/> RECUPERAR DE LA NUBE</button>
      </div>:<small>Al iniciar sesión, tus luchadores locales se copiarán automáticamente a tu nube privada. La exportación local no necesita cuenta.</small>}
      <small>Las copias incluyen sprites, retratos, estadísticas y ataques; nunca la foto original ni la clave Gemini. Al importar o recuperar, los conflictos se conservan como luchadores distintos.</small>
    </div> : !supabaseConfigured?<div className="pb-social-blank"><KeyRound size={29}/><b>SUPABASE NO CONFIGURADO</b><small>Tu colección local sigue funcionando. Ve a MIS COPIAS para exportarla.</small></div>:
    loading?<p className="pb-social-status">COMPROBANDO SESIÓN…</p>:
    !user?<div className="pb-social-form">
       <p>Entra con tu correo para guardar personajes privados, compartir luchadores y competir en el ranking.</p>
       <label>CORREO ELECTRÓNICO<input type="email" autoComplete="email" value={email} placeholder="tu@email.com" onChange={e=>setEmail(e.target.value)}/></label>
       <button type="button" className="pb-social-gold" disabled={busy||!email.includes('@')} onClick={()=>void sendEmail()}>{sent?'REENVIAR ENLACE':'ENTRAR CON CORREO'}</button>
       <small>La colección local no se borra al iniciar sesión. Al iniciar sesión, se hará una copia privada automática de los luchadores de este dispositivo, sin publicarlos.</small>
    </div>:<div className="pb-social-form">
      <p className="pb-social-user"><ShieldCheck size={17}/> {user.email}</p><div className="pb-account-record"><b>{rating} ELO</b><span>{wins} VICTORIAS · {losses} DERROTAS</span></div>
      <div className="pb-social-fields"><label>NOMBRE PÚBLICO<input maxLength={32} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label>USUARIO ÚNICO<input maxLength={24} value={handle} onChange={e=>setHandle(e.target.value.toLowerCase())}/></label></div>
      <div className="pb-social-buttons"><button type="button" disabled={busy} onClick={()=>void saveProfile()}><Save size={15}/> GUARDAR PERFIL</button><button type="button" disabled={busy} onClick={()=>{setTab('backup');setNotice('');}}><CloudUpload size={15}/> ESTADO Y COPIAS</button></div>
      <button type="button" className="pb-social-danger" disabled={busy} onClick={()=>void supabase?.auth.signOut()}><LogOut size={14}/> CERRAR SESIÓN</button>
    </div>}
    {notice&&<p className="pb-social-status" role="status">{notice}</p>}
    <button className="pb-social-back" type="button" disabled={busy} onClick={onClose}><ArrowLeft size={14}/> VOLVER</button>
   </section>
 </div>;
}
