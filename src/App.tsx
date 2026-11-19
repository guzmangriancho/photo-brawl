import React, { useEffect, useState } from 'react';
import {
  CpuDifficulty,
  FighterProfile,
  GameMode,
  GroupBattleMode,
  StageId,
} from './types/fighter';
import { getPresetFighters } from './data/presetFighters';
import { getAllCustomFighters } from './services/storageService';
import { startAutomaticFighterMigration,requestAutomaticMigration } from './services/automaticFighterMigration';
import { repairSavedSpriteChroma } from './engine/SpriteProcessor';
import { reconcileSentFighterTransfers } from './services/fighterTransferService';
import { supabase } from './services/supabaseClient';
import { usePlayerAccount } from './services/usePlayerAccount';
import { startStartupCloudRestore } from './services/startupCloudRestore';
import { AccountPanel } from './components/AccountPanel';
import { CharacterSelect } from './components/CharacterSelect';
import { FightArena } from './components/FightArena';
import { GroupFightArena } from './components/GroupFightArena';
import { LARGE_ARENA_IDS } from './data/stages';
import type { OnlineSession } from './network/OnlineSession';
import type { OnlineStart } from './network/protocol';

type StartupState={uid:string|null;phase:'waiting'|'checking'|'restoring'|'ready'|'error';error:string;warning:string};

export function App() {
  const {user,loading:authLoading}=usePlayerAccount();
  const [startup,setStartup]=useState<StartupState>({uid:null,phase:'waiting',error:'',warning:''});
  const [startupRetry,setStartupRetry]=useState(0);
  // Presets are free tutorial actors only; never mix them into the personal roster.
  const [fighters, setFighters] = useState<FighterProfile[]>([]);
  const [rosterLoaded,setRosterLoaded] = useState(false);
  const [rosterError,setRosterError] = useState('');
  const [fightKey,setFightKey]=useState(0);
  const [screen, setScreen] = useState<'SELECT' | 'FIGHT'>('SELECT');

  const [matchConfig, setMatchConfig] = useState<{
    p1: FighterProfile;
    p2: FighterProfile;
    mode: GameMode;
    stage: StageId;
    difficulty: CpuDifficulty;
    online?: OnlineSession;
    tutorial?: boolean;
    battleMode?: GroupBattleMode;
    fighters?: FighterProfile[];
  } | null>(null);

  // Keep automatic background backups for edits/imports, but the initial
  // launch MUST await both cloud steps before mounting any game screen.
  useEffect(() => startAutomaticFighterMigration(), []);
  useEffect(()=>{
    if(!user){
      setStartup({uid:null,phase:'waiting',error:'',warning:''});
      setScreen('SELECT');setMatchConfig(null);setFighters([]);setRosterLoaded(false);
      return;
    }
    let active=true;
    setStartup({uid:user.id,phase:'checking',error:'',warning:''});
    const {promise,unsubscribe}=startStartupCloudRestore(user.id,phase=>{
      if(active)setStartup(old=>({...old,uid:user.id,phase,error:''}));
    });
    void promise.then(report=>{
      if(active)setStartup({uid:user.id,phase:'ready',error:'',
        warning:report.failed.length?`No se pudieron recuperar ${report.failed.length} luchadores de la nube: ${report.failed[0]}. Vuelve a intentarlo desde CUENTA → MIS COPIAS.`:''});
    }).catch(error=>{
      if(active)setStartup({uid:user.id,phase:'error',error:error instanceof Error?error.message:String(error),warning:''});
    });
    return()=>{active=false;unsubscribe();};
  },[user?.id,startupRetry]);
  // Transfer receipts: when the receiver accepts, the canonical cloud fighter
  // changes owner. Reconcile the sender's local collection on focus/interval,
  // never deleting a fighter from another user's device.
  useEffect(() => {
    // Transfer reconciliation runs only AFTER the ordered startup cloud restore;
    // never mutate IndexedDB while the initial backup/restore is still running.
    if(!supabase||!user||startup.uid!==user.id||startup.phase!=='ready')return;
    let active=true;
    const reconcile=()=>{if(active)void reconcileSentFighterTransfers().catch(error=>console.warn('Transferencias pendientes de reconciliar',error));};
    const refresh=()=>{if(active)void getAllCustomFighters().then(rows=>{
      if(active)setFighters(rows.filter(f=>!f.isPreset&&!f.id.startsWith('preset_')));
    }).catch(error=>console.warn('No se pudo actualizar colección',error));};
    const auth=supabase.auth.onAuthStateChange(()=>{window.setTimeout(reconcile,700);});
    const timer=setInterval(reconcile,30000);
    window.addEventListener('focus',reconcile);
    window.addEventListener('pb-roster-refresh',refresh);
    window.setTimeout(reconcile,1700);
    return ()=>{active=false;auth.data.subscription.unsubscribe();clearInterval(timer);
      window.removeEventListener('focus',reconcile);window.removeEventListener('pb-roster-refresh',refresh);};
  },[user?.id,startup.uid,startup.phase]);

  useEffect(() => {
    if(!user||startup.uid!==user.id||startup.phase!=='ready')return;
    let active=true;
    setRosterLoaded(false);
    setRosterError('');
    getAllCustomFighters().then(async customs=>{
      if(!active)return;
      setFighters(customs.filter(f => !f.isPreset && !f.id.startsWith("preset_")));
      setRosterLoaded(true); // Show the collection immediately; repairs can update it incrementally.
      // Repair only in memory: retain the original sheet in IndexedDB so a
      // migration cannot irreversibly replace a fighter's saved artwork.
      for(const existing of customs){
        if(!active)break;
        if(existing.isPreset || existing.id.startsWith("preset_") || existing.spriteSheetKeyVersion===3)continue;
        try{
          const repaired={...existing,spriteSheetDataUrl:await repairSavedSpriteChroma(existing.spriteSheetDataUrl),spriteSheetKeyVersion:3 as const};
          if(active)setFighters(list=>list.map(f=>f.id===repaired.id?{...f,spriteSheetDataUrl:repaired.spriteSheetDataUrl,spriteSheetKeyVersion:3}:f));
        }catch(error){console.warn('No se pudo reparar la transparencia del luchador',existing.id,error);}
      }
    }).catch(error => {
      console.error('No se pudo cargar la colección',error);
      if(active)setRosterError(error instanceof Error?error.message:'No se pudo leer el almacenamiento del dispositivo.');
    }).finally(()=>{if(active)setRosterLoaded(true);});
    return()=>{active=false;};
  }, [user?.id,startup.uid,startup.phase]);

  const handleFighterCreated = (newFighter: FighterProfile) => {
    if(newFighter.isPreset || newFighter.id.startsWith("preset_")) return;
    setFighters((prev) => [newFighter, ...prev.filter(f=>f.id!==newFighter.id)]);
    // The creator saves to IndexedDB first. Give that transaction time to finish.
    requestAutomaticMigration();
  };

  const handleFighterRenamed = (fighter: FighterProfile) => {
    setFighters(prev => prev.map(f => f.id===fighter.id ? fighter : f));
  };

  const handleFighterDeleted = (id: string) => {
    setFighters((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStartMatch = (
    p1: FighterProfile,
    p2: FighterProfile,
    mode: GameMode,
    stage: StageId,
    difficulty: CpuDifficulty,
    extra?: [FighterProfile,FighterProfile]
  ) => {
    // Preset fighters are only playable inside the guided tutorial.
    if (p1.isPreset || p2.isPreset) return;
    const group=mode==='2V2'||mode==='FREE_FOR_ALL';
    const arena=group && !LARGE_ARENA_IDS.includes(stage)?LARGE_ARENA_IDS[0]:stage;
    const groupRoster=[p1,p2,extra?.[0]||fighters.find(f=>f.id!==p1.id&&f.id!==p2.id)||p1,
      extra?.[1]||fighters.find(f=>f.id!==p1.id&&f.id!==p2.id)||p2];
    setMatchConfig({p1,p2,mode,stage:arena,difficulty,battleMode:group?mode:undefined,
      fighters:group?groupRoster:undefined});
    setFightKey(value=>value+1);
    setScreen('FIGHT');
  };

  const handleStartTutorial = (presetId: string) => {
    const presets = getPresetFighters();
    const selected = presets.find(f => f.id === presetId) ?? presets[0];
    const opponent = presets.find(f => f.id !== selected.id) ?? selected;
    setMatchConfig({p1:selected, p2:opponent, mode:'TRAINING', stage:'SKI_RESORT', difficulty:'EASY', tutorial:true});
    setScreen('FIGHT');
  };

  const handleOnlineMatch = (start: OnlineStart, session: OnlineSession) => {
    setMatchConfig({p1:start.p1,p2:start.p2,mode:'ONLINE',stage:start.stage,difficulty:'NORMAL',online:session,
      battleMode:start.battleMode,fighters:start.fighters});
    setFightKey(value=>value+1);
    setScreen('FIGHT');
  };

  const handleRematch=(profiles:FighterProfile[],stage?:StageId)=>{
    setMatchConfig(old=>old?{...old,p1:profiles[0]||old.p1,p2:profiles[1]||old.p2,
      fighters:old.battleMode?profiles:undefined,stage:stage||old.stage}:old);
    setFightKey(v=>v+1);
  };
  const handleExit=()=>{
    matchConfig?.online?.close();setMatchConfig(null);setScreen('SELECT');
  };

  // Neither combat nor selection is available without a verified session.
  // Keep the existing account modal, but make it non-dismissible here.
  if(authLoading)return <div className="pb-app pb-loading-roster" role="status"><div className="pb-loading-plaque">PHOTO <b>BRAWL</b><small>COMPROBANDO SESIÓN…</small></div></div>;
  if(!user||!supabase)return <div className="pb-app pb-loading-roster pb-auth-required-screen">
    <div className="pb-loading-plaque" aria-hidden="true">PHOTO <b>BRAWL</b></div>
    <AccountPanel requiredLogin onClose={()=>{}} onRestored={()=>{}}/>
  </div>;
  if(startup.uid!==user.id||startup.phase==='waiting'||startup.phase==='checking'||startup.phase==='restoring'){
    const message=startup.uid===user.id&&startup.phase==='restoring'?'2/2 · RECUPERANDO DE LA NUBE…':'1/2 · COMPROBANDO SINCRONIZACIÓN…';
    return <div className="pb-app pb-loading-roster" role="status"><div className="pb-loading-plaque">PHOTO <b>BRAWL</b><small>{message}</small><small>No cierres la aplicación durante la recuperación.</small></div></div>;
  }
  if(startup.phase==='error')return <div className="pb-app pb-loading-roster" role="alert"><div className="pb-loading-plaque">SINCRONIZACIÓN PENDIENTE
    <small>{startup.error}</small><small>Tus luchadores locales no se han borrado. Comprueba tu conexión e inténtalo de nuevo.</small>
    <button type="button" onClick={()=>setStartupRetry(n=>n+1)}>REINTENTAR SINCRONIZACIÓN</button>
    <button type="button" onClick={()=>void supabase?.auth.signOut()}>CERRAR SESIÓN</button>
  </div></div>;

  if (screen === 'FIGHT' && matchConfig) {
    if(matchConfig.battleMode && matchConfig.fighters?.length===4){
      return <GroupFightArena key={fightKey} fighters={matchConfig.fighters as [FighterProfile,FighterProfile,FighterProfile,FighterProfile]}
        roster={fighters} battleMode={matchConfig.battleMode} stage={matchConfig.stage}
        difficulty={matchConfig.difficulty} online={matchConfig.online}
        onRematch={handleRematch} onExit={handleExit}/>;
    }
    return (
      <FightArena key={fightKey} roster={fighters} onRematch={handleRematch}
        p1Profile={matchConfig.p1}
        p2Profile={matchConfig.p2}
        mode={matchConfig.mode}
        stage={matchConfig.stage}
        difficulty={matchConfig.difficulty}
        online={matchConfig.online}
        tutorial={matchConfig.tutorial}
        onExit={handleExit}
      />
    );
  }

  if (rosterError) return <div className="pb-app pb-loading-roster" role="alert"><div className="pb-loading-plaque">COLECCIÓN NO DISPONIBLE<small>{rosterError}</small><small>Tus luchadores no se han borrado. No limpies los datos del navegador ni desinstales la PWA.</small><button type="button" onClick={()=>location.reload()}>REINTENTAR</button></div></div>;

  if (!rosterLoaded) return <div className="pb-app pb-loading-roster" role="status"><div className="pb-loading-plaque">PHOTO <b>BRAWL</b><small>CARGANDO TUS LUCHADORES…</small></div></div>;

  return (
    <>
    <CharacterSelect
      fighters={fighters}
      onFighterCreated={handleFighterCreated}
      onFighterDeleted={handleFighterDeleted}
      onFighterRenamed={handleFighterRenamed}
      onStartMatch={handleStartMatch}
      onOnlineMatch={handleOnlineMatch}
      onStartTutorial={handleStartTutorial}
    />
    {startup.warning&&<div className="pb-startup-warning" role="status">{startup.warning}</div>}
    </>
  );
}

export default App;
