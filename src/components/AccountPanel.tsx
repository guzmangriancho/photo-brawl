import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,CloudDownload,CloudUpload,Download,HardDriveDownload,KeyRound,LogOut,Save,ShieldCheck,Upload,UserRound,X} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import {supabase,supabaseConfigured} from '../services/supabaseClient';
import {restoreCloudFightersReport} from '../services/communityService';
import {getAutomaticMigrationStatus,subscribeAutomaticMigration,requestAutomaticMigration} from '../services/automaticFighterMigration';
import type {MigrationStatus} from '../services/automaticFighterMigration';
import {exportLocalFightersBackup,getAllCustomFighters,mergeCustomFighters,readLocalFightersBackup} from '../services/storageService';
import {usePlayerAccount} from '../services/usePlayerAccount';
import {FighterTransfers} from './FighterTransfers';
import {PlayerAvatar} from './PlayerAvatar';
import {useFavoriteFighter} from '../services/useFavoriteFighter';
import './community.css';

interface Props {onClose:()=>void;onRestored:(fighter:FighterProfile)=>void;requiredLogin?:boolean}
export function AccountPanel({onClose,onRestored,requiredLogin=false}:Props){
 const {user,loading}=usePlayerAccount();
 const favorite=useFavoriteFighter();
 const [tab,setTab]=useState<'account'|'backup'|'transfers'>('account');
 const [email,setEmail]=useState('');
 const [authMode,setAuthMode]=useState<'login'|'register'>('login');
 const [password,setPassword]=useState(''),[passwordConfirm,setPasswordConfirm]=useState('');
 const [securityOpen,setSecurityOpen]=useState(false),[newPassword,setNewPassword]=useState('');
 const [newPasswordConfirm,setNewPasswordConfirm]=useState('');
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

 /** Supabase handles password hashing, login sessions, and RLS identity. No email is sent
  * when Confirm Email is disabled in the Supabase Auth Email provider configuration. */
 async function submitCredentials(){
   if(!supabase||busy)return;
   const cleanEmail=email.trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)){
     setNotice('Escribe un correo electrónico válido.');return;
   }
   if(password.length<8){setNotice('La contraseña debe tener al menos 8 caracteres.');return;}
   if(authMode==='register'&&password!==passwordConfirm){
     setNotice('Las dos contraseñas no coinciden.');return;
   }
   setBusy(true);setNotice('');
   try{
     if(authMode==='register'){
       const {data,error}=await supabase.auth.signUp({email:cleanEmail,password});
       if(error)throw error;
       if(!data.session){
         setNotice('Supabase no ha iniciado sesión. Desactiva «Confirm Email» en Authentication → Providers → Email y revisa si la cuenta ya existía.');
         return;
       }
       setNotice('¡Cuenta creada! Tu colección local se copiará automáticamente a tu nube privada.');
     }else{
       const {error}=await supabase.auth.signInWithPassword({email:cleanEmail,password});
       if(error)throw error;
       setNotice('Has iniciado sesión. Tu colección local está protegida.');
     }
     setPassword('');setPasswordConfirm('');
   }catch(err){
     const e=err as {message?:string;code?:string};
     const code=String(e?.code||'');
     const message=String(e?.message||'');
     if(code==='invalid_credentials'||/invalid login credentials/i.test(message))setNotice('Correo o contraseña incorrectos.');
     else if(code==='user_already_exists'||/already registered/i.test(message))setNotice('Este correo ya tiene cuenta. Entra desde la pestaña ENTRAR.');
     else if(code==='weak_password'||/password should be/i.test(message))setNotice('La contraseña es demasiado débil. Prueba una más larga.');
     else if(code==='over_email_send_rate_limit'||/email rate limit/i.test(message))setNotice('Supabase sigue intentando enviar correos. Desactiva «Confirm Email» en el panel de Supabase.');
     else setNotice(message||'No se pudo completar el acceso.');
   }finally{setBusy(false);}
 }

 async function updatePassword(){
   if(!supabase||!user||busy)return;
   if(newPassword.length<8){setNotice('Usa una contraseña de al menos 8 caracteres.');return;}
   if(newPassword!==newPasswordConfirm){setNotice('Las dos contraseñas no coinciden.');return;}
   setBusy(true);setNotice('');
   try{
     const {error}=await supabase.auth.updateUser({password:newPassword});
     if(error)throw error;
     setNewPassword('');setNewPasswordConfirm('');setSecurityOpen(false);
     setNotice('Contraseña guardada. Ya puedes entrar con correo y contraseña en este u otro dispositivo.');
   }catch(err){setNotice(err instanceof Error?err.message:'No se pudo guardar la contraseña.');}
   finally{setBusy(false);}
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

 return <div className="pb-social-overlay" role="presentation" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy&&!requiredLogin)onClose();}}>
   <section className="pb-social-dialog pb-frame" role="dialog" aria-modal="true" aria-label="Cuenta y copias de seguridad de PHOTO BRAWL">
    <header className="pb-social-heading"><strong><UserRound size={17}/> {requiredLogin?'ACCESO OBLIGATORIO':'MI CUENTA'}</strong>{!requiredLogin&&<button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar"><X size={18}/></button>}</header>
    {requiredLogin&&<p className="pb-auth-required-note">Para jugar a PHOTO BRAWL debes registrarte o iniciar sesión. Tus luchadores se sincronizarán y recuperarán automáticamente al entrar.</p>}
    {!requiredLogin&&<nav className="pb-account-tabs" aria-label="Cuenta y copias de seguridad">
      <button type="button" className={tab==='account'?'on':''} onClick={()=>{setTab('account');setNotice('');}}>CUENTA</button>
      <button type="button" className={tab==='backup'?'on':''} onClick={()=>{setTab('backup');setNotice('');}}>MIS COPIAS</button>
      <button type="button" className={tab==='transfers'?'on':''} onClick={()=>{setTab('transfers');setNotice('');}}>REGALOS</button>
    </nav>}
    {tab==='transfers' ? <FighterTransfers onImported={onRestored}/> : tab==='backup' ? <div className="pb-social-form pb-account-backup">
      <div className="pb-account-local"><HardDriveDownload size={19}/><span><b>{localCount===null?'…':localCount} LUCHADORES LOCALES</b><small>Tu colección sigue guardada en este dispositivo aunque cierres sesión.</small></span></div>
      <div className="pb-social-buttons">
        <button type="button" disabled={busy} onClick={()=>void exportBackup()}><Download size={15}/> EXPORTAR ARCHIVO</button>
        <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> IMPORTAR ARCHIVO</button>
        <input ref={fileInput} className="pb-backup-file-input" type="file" accept=".json,application/json" aria-label="Seleccionar copia PHOTO BRAWL" onChange={e=>void importBackup(e.target.files?.[0])}/>
      </div>
      {supabaseConfigured && <p className="pb-social-status" role="status"><CloudUpload size={14}/> SINCRONIZACIÓN AUTOMÁTICA: {migration.message}</p>}
      {user&&supabaseConfigured?<div className="pb-social-buttons">
        <button type="button" disabled={busy||migration.phase==='syncing'} onClick={()=>requestAutomaticMigration()}><CloudUpload size={15}/> {migration.phase==='error'?'REINTENTAR COPIA PRIVADA':'COMPROBAR SINCRONIZACIÓN'}</button>
        <button type="button" disabled={busy} onClick={()=>void restore()}><CloudDownload size={15}/> RECUPERAR DE LA NUBE</button>
      </div>:<small>Al iniciar sesión, tus luchadores locales se copiarán automáticamente a tu nube privada. Las copias locales permanecen en este dispositivo.</small>}
      <small>Las copias incluyen sprites, retratos, estadísticas y ataques; nunca la foto original ni la clave Gemini. Al importar o recuperar, los conflictos se conservan como luchadores distintos.</small>
    </div> : !supabaseConfigured?<div className="pb-social-blank"><KeyRound size={29}/><b>SUPABASE NO CONFIGURADO</b><small>{requiredLogin?'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para activar el registro obligatorio. Los luchadores locales permanecen guardados.':'Tus luchadores locales siguen guardados. Ve a MIS COPIAS para exportarlos.'}</small></div>:
    loading?<p className="pb-social-status">COMPROBANDO SESIÓN…</p>:
    !user?<form className="pb-social-form pb-login-form" onSubmit={e=>{e.preventDefault();void submitCredentials();}}>
       <div className="pb-login-switch" role="group" aria-label="Entrar o registrarse">
         <button type="button" className={authMode==='login'?'selected':''} disabled={busy} onClick={()=>{setAuthMode('login');setPasswordConfirm('');setNotice('');}}>ENTRAR</button>
         <button type="button" className={authMode==='register'?'selected':''} disabled={busy} onClick={()=>{setAuthMode('register');setNotice('');}}>REGISTRARSE</button>
       </div>
       <div className="pb-social-fields pb-login-fields">
         <label>CORREO ELECTRÓNICO<input type="email" required autoComplete="email" value={email} placeholder="tu@email.com" onChange={e=>setEmail(e.target.value)}/></label>
         <label>CONTRASEÑA<input type="password" required minLength={8} autoComplete={authMode==='login'?'current-password':'new-password'} value={password} placeholder="Mínimo 8 caracteres" onChange={e=>setPassword(e.target.value)}/></label>
       </div>
       {authMode==='register'&&<label>REPETIR CONTRASEÑA<input type="password" required minLength={8} autoComplete="new-password" value={passwordConfirm} onChange={e=>setPasswordConfirm(e.target.value)}/></label>}
       <button type="submit" className="pb-social-gold" disabled={busy}>{busy?'UN MOMENTO…':authMode==='login'?'ENTRAR A MI CUENTA':'CREAR MI CUENTA'}</button>
       <small>{authMode==='login'?'Tus luchadores locales se conservan y se sincronizan al entrar.':'Sin correo de confirmación durante las pruebas. Guarda tu contraseña: recuperarla requerirá configurar el servicio de correo.'}</small>
    </form>:<div className="pb-social-form">
      <p className="pb-social-user"><PlayerAvatar path={favorite.avatarPath} size="large"/><span><ShieldCheck size={14}/> {user.email}</span></p>
      {securityOpen ? <>
        <p>Establece una contraseña para entrar sin enlaces de correo, también si tu cuenta se creó antes con Magic Link.</p>
        <div className="pb-social-fields">
          <label>NUEVA CONTRASEÑA<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
          <label>REPITE CONTRASEÑA<input type="password" autoComplete="new-password" minLength={8} value={newPasswordConfirm} onChange={e=>setNewPasswordConfirm(e.target.value)}/></label>
        </div>
        <div className="pb-social-buttons"><button type="button" className="pb-social-gold" disabled={busy} onClick={()=>void updatePassword()}><KeyRound size={15}/> GUARDAR CONTRASEÑA</button><button type="button" disabled={busy} onClick={()=>{setSecurityOpen(false);setNewPassword('');setNewPasswordConfirm('');}}>CANCELAR</button></div>
      </> : <>
        <div className="pb-account-record"><b>{rating} ELO</b><span>{wins} VICTORIAS · {losses} DERROTAS</span></div>
        <div className="pb-social-fields"><label>NOMBRE PÚBLICO<input maxLength={32} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label>USUARIO ÚNICO<input maxLength={24} value={handle} onChange={e=>setHandle(e.target.value.toLowerCase())}/></label></div>
        <div className="pb-social-buttons"><button type="button" disabled={busy} onClick={()=>void saveProfile()}><Save size={15}/> GUARDAR PERFIL</button><button type="button" disabled={busy} onClick={()=>{setSecurityOpen(true);setNotice('');}}><KeyRound size={15}/> CONTRASEÑA</button></div>
      </>}
      <button type="button" className="pb-social-danger" disabled={busy} onClick={()=>void supabase?.auth.signOut()}><LogOut size={14}/> CERRAR SESIÓN</button>
    </div>}
    {notice&&<p className="pb-social-status" role="status">{notice}</p>}
    {!requiredLogin&&<button className="pb-social-back" type="button" disabled={busy} onClick={onClose}><ArrowLeft size={14}/> VOLVER</button>}
   </section>
 </div>;
}
