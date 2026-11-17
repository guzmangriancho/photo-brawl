import React, { useEffect, useState } from 'react';
import {
  CpuDifficulty,
  FighterProfile,
  GameMode,
  StageId,
} from './types/fighter';
import { getPresetFighters } from './data/presetFighters';
import { getAllCustomFighters, saveCustomFighter } from './services/storageService';
import { repairSavedSpriteChroma } from './engine/SpriteProcessor';
import { CharacterSelect } from './components/CharacterSelect';
import { FightArena } from './components/FightArena';
import type { OnlineSession } from './network/OnlineSession';
import type { OnlineStart } from './network/protocol';

export function App() {
  // Presets are free tutorial actors only; never mix them into the personal roster.
  const [fighters, setFighters] = useState<FighterProfile[]>([]);
  const [rosterLoaded,setRosterLoaded] = useState(false);
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

  useEffect(() => {
    let active=true;
    getAllCustomFighters().then(async customs=>{
      if(!active)return;
      setFighters(customs.filter(f => !f.isPreset && !f.id.startsWith("preset_")));
      setRosterLoaded(true); // Show the collection immediately; repairs can update it incrementally.
      // Repair existing custom characters in-place, preserving poses, stats and name.
      // Keep them playable even if storage is full or an image is malformed.
      for(const existing of customs){
        if(!active)break;
        if(existing.isPreset || existing.id.startsWith("preset_") || existing.spriteSheetKeyVersion===3)continue;
        try{
          const repaired={...existing,spriteSheetDataUrl:await repairSavedSpriteChroma(existing.spriteSheetDataUrl),spriteSheetKeyVersion:3 as const};
          await saveCustomFighter(repaired);
          if(active)setFighters(list=>list.map(f=>f.id===repaired.id?repaired:f));
        }catch(error){console.warn('No se pudo reparar la transparencia del luchador',existing.id,error);}
      }
    }).catch(error => console.warn('No se pudo cargar la colección',error)).finally(()=>{if(active)setRosterLoaded(true);});
    return()=>{active=false;};
  }, []);

  const handleFighterCreated = (newFighter: FighterProfile) => {
    if(newFighter.isPreset || newFighter.id.startsWith("preset_")) return;
    setFighters((prev) => [newFighter, ...prev.filter(f=>f.id!==newFighter.id)]);
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
