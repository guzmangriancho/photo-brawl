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
  const [fighters, setFighters] = useState<FighterProfile[]>(() => getPresetFighters());
  const [screen, setScreen] = useState<'SELECT' | 'FIGHT'>('SELECT');

  const [matchConfig, setMatchConfig] = useState<{
    p1: FighterProfile;
    p2: FighterProfile;
    mode: GameMode;
    stage: StageId;
    difficulty: CpuDifficulty;
    online?: OnlineSession;
  } | null>(null);

  useEffect(() => {
    let active=true;
    getAllCustomFighters().then(async customs=>{
      if(!active)return;
      if(customs.length)setFighters([...getPresetFighters(),...customs]);
      // Repair existing custom characters in-place, preserving poses, stats and name.
      // Keep them playable even if storage is full or an image is malformed.
      for(const existing of customs){
        if(!active)break;
        if(existing.spriteSheetKeyVersion===2)continue;
        try{
          const repaired={...existing,spriteSheetDataUrl:await repairSavedSpriteChroma(existing.spriteSheetDataUrl),spriteSheetKeyVersion:2 as const};
          await saveCustomFighter(repaired);
          if(active)setFighters(list=>list.map(f=>f.id===repaired.id?repaired:f));
        }catch(error){console.warn('No se pudo reparar la transparencia del luchador',existing.id,error);}
      }
    });
    return()=>{active=false;};
  }, []);

  const handleFighterCreated = (newFighter: FighterProfile) => {
    setFighters((prev) => [newFighter, ...prev]);
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
    setMatchConfig({ p1, p2, mode, stage, difficulty });
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
        onExit={() => {
          matchConfig.online?.close();
          setMatchConfig(null);
          setScreen('SELECT');
        }}
      />
    );
  }

  return (
    <CharacterSelect
      fighters={fighters}
      onFighterCreated={handleFighterCreated}
      onFighterDeleted={handleFighterDeleted}
      onStartMatch={handleStartMatch}
      onOnlineMatch={handleOnlineMatch}
    />
  );
}

export default App;
