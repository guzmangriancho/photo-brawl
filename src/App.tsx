import React, { useEffect, useState } from 'react';
import {
  CpuDifficulty,
  FighterProfile,
  GameMode,
  StageId,
} from './types/fighter';
import { getPresetFighters } from './data/presetFighters';
import { getAllCustomFighters } from './services/storageService';
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
    getAllCustomFighters().then((customs) => {
      if (customs.length > 0) {
        setFighters([...getPresetFighters(), ...customs]);
      }
    });
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
