/** Required, sequential cloud bootstrap at each application launch (and login).
 *  1. Verify the authenticated user.
 *  2. Check/upload local fighter changes.
 *  3. Download and non-destructively merge that user's cloud collection.
 *  No game screen is rendered until this promise resolves.
 */
import {supabase} from './supabaseClient';
import {runAutomaticMigrationNow} from './automaticFighterMigration';
import {restoreCloudFightersReport} from './communityService';
import {mergeCustomFighters} from './storageService';

export type StartupCloudPhase='checking'|'restoring';
export type StartupCloudResult={restored:number;updated:number;failed:string[]};
type ProgressListener=(phase:StartupCloudPhase)=>void;
type ActiveRun={uid:string;phase:StartupCloudPhase;listeners:Set<ProgressListener>;promise:Promise<StartupCloudResult>};
let activeRun:ActiveRun|null=null;

function notify(run:ActiveRun,phase:StartupCloudPhase){
  run.phase=phase;
  for(const callback of run.listeners)callback(phase);
}

/** Shared promise handles React StrictMode without running a second recovery.
 *  Disposing a listener does not cancel the account's active synchronization. */
export function startStartupCloudRestore(uid:string,onProgress:ProgressListener):{
  promise:Promise<StartupCloudResult>;unsubscribe:()=>void;
}{
  if(activeRun?.uid===uid){
    const run=activeRun;
    run.listeners.add(onProgress);
    onProgress(run.phase);
    return {promise:run.promise,unsubscribe:()=>run.listeners.delete(onProgress)};
  }
  const run:ActiveRun={uid,phase:'checking',listeners:new Set([onProgress]),promise:null!};
  activeRun=run;
  onProgress(run.phase);
  run.promise=(async()=>{
    if(!supabase)throw new Error('Se necesita configurar Supabase para iniciar sesión y sincronizar la colección.');
    const verified=await supabase.auth.getUser();
    if(verified.error||verified.data.user?.id!==uid)throw new Error('No se pudo verificar tu sesión. Vuelve a iniciar sesión.');

    notify(run,'checking');
    const migration=await runAutomaticMigrationNow(uid);
    if(migration.phase!=='synced')throw new Error(migration.message);

    // Always restore AFTER the previous synchronization has completed.
    notify(run,'restoring');
    const cloud=await restoreCloudFightersReport();
    // If the user logged out or switched accounts during downloads, never
    // merge another account's private fighters into this device.
    const current=await supabase.auth.getUser();
    if(current.error||current.data.user?.id!==uid)throw new Error('La sesión cambió durante la recuperación. No se ha importado nada.');
    const merged=await mergeCustomFighters(cloud.fighters);
    // Individual corrupt/missing cloud assets are reported, but other fighters
    // remain accessible: a single failed image must not permanently lock play.
    return {restored:merged.added.length,updated:merged.updated.length,failed:cloud.failed};
  })().finally(()=>{if(activeRun===run)activeRun=null;});
  return {promise:run.promise,unsubscribe:()=>run.listeners.delete(onProgress)};
}
