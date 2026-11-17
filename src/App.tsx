import React, { useEffect, useState } from 'react';
import {
  CpuDifficulty,
  FighterProfile,
  GameMode,
  StageId,
} from './types/fighter';
import { getPresetFighters } from './data/presetFighters';
import { getAllCustomFighters } from './services/storageService';
import { startAutomaticFighterMigration,requestAutomaticMigration } from './services/automaticFighterMigration';
import { repairSavedSpriteChroma } from './engine/SpriteProcessor';
import { CharacterSelect } from './components/CharacterSelect';
import { FightArena } from './components/FightArena';
import type { OnlineSession } from './network/OnlineSession';
import type { OnlineStart } from './network/protocol';

export function App() {
  // Presets are free tutorial actors only; never mix them into the personal roster.
  const [fighters, setFighters] = useState<FighterProfile[]>([]);
  const [rosterLoaded,setRosterLoaded] = useState(false);
  const [rosterError,setRosterError] = useState('');
  const [screen, setScreen] = useState<'SELECT' | 'FIGHT'>('SELECT');

  const [matchConfig, setMatchConfig] = useState<{
    p1: FighterProfile;
    p2: FighterProfile;
    mode: GameMode;
    stage: StageId;
    difficulty: CpuDifficulty;
    online?: OnlineSession;
    tutorial?: boolean;
  } | null>(null);

  // Start migration at app boot, independently of what menu the user opens.
  useEffect(() => startAutomaticFighterMigration(), []);

  useEffect(() => {
    let active=true;
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
          if(active)setFighters(list=>list.map(f=>f.id===repaired.id?repaired:f));
        }catch(error){console.warn('No se pudo reparar la transparencia del luchador',existing.id,error);}
      }
    }).catch(error => {
      console.error('No se pudo cargar la colección',error);
      if(active)setRosterError(error instanceof Error?error.message:'No se pudo leer el almacenamiento del dispositivo.');
    }).finally(()=>{if(active)setRosterLoaded(true);});
    return()=>{active=false;};
  }, []);

  const handleFighterCreated = (newFighter: FighterProfile) => {
    if(newFighter.isPreset || newFighter.id.startsWith("preset_")) return;
    setFighters((prev) => [newFighter, ...prev.filter(f=>f.id!==newFighter.id)]);
    // The creator saves to IndexedDB first. Give that transaction time to finish.
    requestAutomaticMigration();
  };

  const handleFighterDeleted = (id: string) => {
    setFighters((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStartMatch = (
    p1: FighterProfile,
    p2: FighterProfile,
    mode: GameMode,
    stage: StageId,
    difficulty: CpuDifficulty
  ) => {
    // Preset fighters are only playable inside the guided tutorial.
    if (p1.isPreset || p2.isPreset) return;
    setMatchConfig({ p1, p2, mode, stage, difficulty });
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
    setMatchConfig({p1:start.p1,p2:start.p2,mode:'ONLINE',stage:start.stage,difficulty:'NORMAL',online:session});
    setScreen('FIGHT');
  };

  if (screen === 'FIGHT' && matchConfig) {
    return (
      <FightArena
        p1Profile={matchConfig.p1}
        p2Profile={matchConfig.p2}
        mode={matchConfig.mode}
        stage={matchConfig.stage}
        difficulty={matchConfig.difficulty}
        online={matchConfig.online}
        tutorial={matchConfig.tutorial}
        onExit={() => {
          matchConfig.online?.close();
          setMatchConfig(null);
          setScreen('SELECT');
        }}
      />
    );
  }

  if (rosterError) return <div className="pb-app pb-loading-roster" role="alert"><div className="pb-loading-plaque">COLECCIÓN NO DISPONIBLE<small>{rosterError}</small><small>Tus luchadores no se han borrado. No limpies los datos del navegador ni desinstales la PWA.</small><button type="button" onClick={()=>location.reload()}>REINTENTAR</button></div></div>;

  if (!rosterLoaded) return <div className="pb-app pb-loading-roster" role="status"><div className="pb-loading-plaque">PHOTO <b>BRAWL</b><small>CARGANDO TUS LUCHADORES…</small></div></div>;

  return (
    <CharacterSelect
      fighters={fighters}
      onFighterCreated={handleFighterCreated}
      onFighterDeleted={handleFighterDeleted}
      onStartMatch={handleStartMatch}
      onOnlineMatch={handleOnlineMatch}
      onStartTutorial={handleStartTutorial}
    />
  );
}

export default App;
