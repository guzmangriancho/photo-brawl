/**
 * V16.2 non-destructive, private, automatic migration of legacy local fighters.
 * Source of truth remains IndexedDB; this module never deletes or modifies it.
 * Account association is required before uploading to Supabase.
 */
import {supabase} from './supabaseClient';
import {getAllCustomFighters} from './storageService';
import {backupMissingLocalFighters} from './communityService';

export type MigrationPhase = 'not-configured'|'waiting-login'|'checking'|'syncing'|'synced'|'error'|'different-account';
export type MigrationStatus = {
  phase:MigrationPhase;
  total:number;
  done:number;
  uploaded:number;
  existing:number;
  errors:string[];
  message:string;
};

const OWNER_KEY='pb-local-fighters-cloud-owner-v16-2';
let status:MigrationStatus={phase:'checking',total:0,done:0,uploaded:0,existing:0,errors:[],message:'Comprobando los luchadores guardados…'};
const subscribers=new Set<(status:MigrationStatus)=>void>();
let started=false;
let syncInProgress=false;
let requestedAgain=false;
let currentAccount:string|null=null;
let lastSuccessFingerprint='';
let scheduled:ReturnType<typeof setTimeout>|undefined;

function update(patch:Partial<MigrationStatus>):void {
  status={...status,...patch};
  for(const callback of subscribers)callback({...status,errors:[...status.errors]});
}
export function getAutomaticMigrationStatus():MigrationStatus{return {...status,errors:[...status.errors]};}
export function subscribeAutomaticMigration(callback:(status:MigrationStatus)=>void):()=>void {
  subscribers.add(callback);
  callback(getAutomaticMigrationStatus());
  return()=>{subscribers.delete(callback);};
}
function savedOwner():string {
  try { return localStorage.getItem(OWNER_KEY)||''; } catch{return '';}
}
function saveOwner(uid:string):void {
  // Best effort only: a blocked localStorage prevents automatic upload, rather than
  // risking copying a shared device's local collection to multiple accounts.
  localStorage.setItem(OWNER_KEY,uid);
}
function fingerprint(uid:string,rows:{id:string;createdAt?:number;fighterName:string;artUpdatedAt?:number}[]):string {
  return uid+'|'+rows.map(f=>`${f.id}:${f.createdAt??''}:${f.fighterName}:${f.artUpdatedAt??0}`).sort().join('|');
}

async function migrate():Promise<void> {
  if(syncInProgress){requestedAgain=true;return;}
  if(!supabase){update({phase:'not-configured',message:'Colección local intacta. Supabase todavía no está configurado.'});return;}
  if(!currentAccount){update({phase:'waiting-login',message:'Tus luchadores siguen guardados aquí. Inicia sesión para copiarlos automáticamente a tu nube privada.'});return;}
  if(typeof navigator!=='undefined' && navigator.onLine===false){
    update({phase:'error',message:'Sin conexión. La copia privada se reintentará cuando vuelvas a tener Internet.'});return;
  }
  syncInProgress=true;
  const uid=currentAccount;
  try {
    update({phase:'checking',message:'Buscando luchadores antiguos…'});
    const rows=(await getAllCustomFighters()).filter(f=>!f.isPreset&&!f.id.startsWith('preset_'));
    // Verify the identity with Supabase before binding the legacy local collection.
    // A stale session must never claim ownership of a user's only local copy.
    const {data:verified,error:authError}=await supabase.auth.getUser();
    if(authError || !verified.user || verified.user.id!==uid){
      throw new Error('No se pudo verificar la sesión de Supabase. Vuelve a iniciar sesión para sincronizar.');
    }
    // On a shared device do not silently upload legacy fighters to a second account.
    const owner=savedOwner();
    if(rows.length && owner && owner!==uid){
      update({phase:'different-account',total:rows.length,done:0,
        message:'Esta colección local ya está vinculada a otra cuenta. No se ha subido nada a tu cuenta actual. Usa una copia JSON para transferirla deliberadamente.'});
      return;
    }
    const tag=fingerprint(uid,rows);
    if(!rows.length){
      update({phase:'synced',total:0,done:0,uploaded:0,existing:0,errors:[],message:'No hay luchadores antiguos pendientes de migración.'});
      lastSuccessFingerprint=tag;
      return;
    }
    if(tag===lastSuccessFingerprint && status.phase==='synced')return;
    // Reserve the device's existing local collection for the first logged-in
    // account BEFORE sending any private photos/sprites to a remote account.
    if(!owner){
      try{saveOwner(uid);}catch {
        update({phase:'error',message:'No se puede vincular la colección a una cuenta de forma segura porque el almacenamiento local está bloqueado.'});return;
      }
    }
    update({phase:'syncing',total:rows.length,done:0,uploaded:0,existing:0,errors:[],message:`Copiando 0/${rows.length} luchadores a tu nube privada…`});
    const result=await backupMissingLocalFighters(rows,(done,total)=>{
      update({phase:'syncing',done,total,message:`Copiando ${done}/${total} luchadores a tu nube privada…`});
    },uid);
    if(currentAccount!==uid){
      update({phase:'error',message:'La sesión cambió durante la copia. Conservamos todos los luchadores locales.'});return;
    }
    if(result.failed.length){
      update({phase:'error',uploaded:result.uploaded,existing:result.existing,errors:result.failed,
        message:`${result.uploaded} copiados, ${result.existing} ya presentes, ${result.failed.length} pendientes. Se reintentará sin borrar los originales.`});
    }else{
      lastSuccessFingerprint=tag;
      update({phase:'synced',done:rows.length,total:rows.length,uploaded:result.uploaded,existing:result.existing,errors:[],
        message:`Colección protegida: ${result.uploaded} copiados y ${result.existing} ya presentes en tu nube privada.`});
    }
  }catch(error){
    update({phase:'error',errors:[error instanceof Error?error.message:String(error)],
      message:`No se ha podido sincronizar. Tus personajes siguen en este móvil. ${error instanceof Error?error.message:''}`});
  }finally{
    syncInProgress=false;
    if(requestedAgain){requestedAgain=false;requestAutomaticMigration();}
  }
}

/** Safe to call after creating/importing a fighter, restoring network, or signing in. */
export function requestAutomaticMigration():void {
  if(scheduled)clearTimeout(scheduled);
  scheduled=setTimeout(()=>{scheduled=undefined;void migrate();},350);
}

/** Attach once at the app root, not inside any menu (which can unmount). */
export function startAutomaticFighterMigration():()=>void {
  if(!supabase){update({phase:'not-configured',message:'Tus luchadores locales siguen disponibles. Configura Supabase para activar la copia privada.'});return()=>{};}
  // Ignore duplicate subscriptions from StrictMode/HMR, but allow one clean owner.
  if(started)return()=>{};
  started=true;
  const handleOnline=()=>{if(status.phase==='error'||status.phase==='waiting-login')requestAutomaticMigration();};
  const handleFocus=()=>{if(status.phase==='error')requestAutomaticMigration();};
  const handleLocalChange=()=>{lastSuccessFingerprint='';requestAutomaticMigration();};
  window.addEventListener('online',handleOnline);
  window.addEventListener('focus',handleFocus);
  window.addEventListener('pb-fighters-changed',handleLocalChange);
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
    const next=session?.user?.id??null;
    if(currentAccount!==next){lastSuccessFingerprint='';}
    currentAccount=next;
    // Callbacks must stay synchronous; Supabase requests run after auth dispatch.
    requestAutomaticMigration();
  });
  requestAutomaticMigration();
  return()=>{
    started=false;
    subscription.unsubscribe();
    window.removeEventListener('online',handleOnline);
    window.removeEventListener('focus',handleFocus);
    window.removeEventListener('pb-fighters-changed',handleLocalChange);
    if(scheduled){clearTimeout(scheduled);scheduled=undefined;}
  };
}
