import React, { useEffect, useRef, useState } from 'react';
import {
  CpuDifficulty,
  FighterProfile,
  GameMode,
  StageId,
} from '../types/fighter';
import {
  EngineSnapshot,
  InputState,
  FightEngine,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../engine/FightEngine';
import { soundFX } from '../engine/SoundFX';
import { STAGE_ART } from '../data/stages';
import type { OnlineSession } from '../network/OnlineSession';
import type { NetworkState } from '../network/protocol';
import { MobileControls } from './MobileControls';
import { ArrowLeft, Eye, RotateCcw, Volume2, VolumeX, Pause, Play, X, FlaskConical, Keyboard, Swords, Smartphone, Move } from 'lucide-react';
import './fightArena.css';

interface FightArenaProps {
  p1Profile: FighterProfile;
  p2Profile: FighterProfile;
  mode: GameMode;
  stage: StageId;
  difficulty: CpuDifficulty;
  online?: OnlineSession;
  tutorial?: boolean;
  onExit: () => void;
}

const FIXED_TIMESTEP = 1000 / 60;

const emptyInput = (): InputState => ({
  left: false, right: false, up: false, down: false,
  light: false, heavy: false, spNeutral: false, spForward: false,
  spUp: false, superBtn: false, romanCancel: false, dashLeft: false, dashRight: false,
});

const P1_KEYS: Record<string, keyof InputState> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  KeyF: 'light', KeyH: 'heavy',
  KeyR: 'spForward', KeyT: 'spUp', KeyY: 'superBtn', KeyE: 'romanCancel',
};
const P2_KEYS: Record<string, keyof InputState> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyJ: 'light', KeyL: 'heavy',
  KeyU: 'spForward', KeyI: 'spUp', KeyO: 'superBtn', KeyP: 'romanCancel',
};

// A special button takes its move from the direction held WHEN it is pressed.
// Forward means towards the opponent, regardless of which side P1/P2 are on.
const specialWithDirection = (input: InputState, facing: 1 | -1): 'spNeutral' | 'spForward' | 'spUp' => {
  if (input.up) return 'spUp';
  if ((facing === 1 && input.right) || (facing === -1 && input.left)) return 'spForward';
  return 'spNeutral';
};

const MECHANIC_LAB_CATALOG = {
  SP_NEUTRAL: [
    { id: 'STRAIGHT_FIREBALL', label: 'Bola Recta (Mid)', desc: 'Proyectil horizontal rápido' },
    { id: 'ARCING_LOB_OBJECT', label: 'Parábola Rebote (Overhead)', desc: 'Rebota 2 veces en el suelo' },
    { id: 'GROUND_SHOCKWAVE', label: 'Terremoto Suelo (LOW)', desc: 'Onda baja: abre guardia alta' },
    { id: 'BOOMERANG_RETURN', label: 'Bumerán Retorno (Mid)', desc: 'Va y vuelve por la espalda' },
    { id: 'TRAP_MINE_DROP', label: 'Mina Proximidad (Trampa)', desc: 'Flota 5s y detona al tocar' },
    { id: 'SHORT_SHOTGUN_BLAST', label: 'Ráfaga Escopeta (Corta)', desc: 'Explosión cercana + knockback' },
  ],
  SP_FORWARD: [
    { id: 'COMMAND_GRAB_SLAM', label: 'Agarre Comando (Imparable)', desc: 'Rompe guardia de bloqueo' },
    { id: 'TELEPORT_BEHIND', label: 'Teletransporte Cross-Up', desc: 'Aparece tras el rival (Overhead)' },
    { id: 'SLIDE_LOW_KICK', label: 'Barrido Deslizante (LOW)', desc: 'Avance raso que abre guardia alta' },
    { id: 'ARMORED_SHOULDER_DASH', label: 'Embestida Super Armor', desc: 'Absorbe 1 golpe sin frenarse' },
    { id: 'SPINNING_ADVANCE', label: 'Giro Multi-Hit (Tatsu)', desc: 'Avance giratorio de varios golpes' },
  ],
  SP_UP: [
    { id: 'INVINCIBLE_UPPERCUT', label: 'Shoryuken Invencible', desc: 'Antiaéreo con invencibilidad' },
    { id: 'DIVE_KICK_FROM_AIR', label: 'Dive Kick Picado (Overhead)', desc: 'Patada diagonal desde el aire' },
    { id: 'VERTICAL_TORNADO', label: 'Tornado Vertical (Multi)', desc: 'Columna giratoria que eleva' },
    { id: 'HIGH_LEAP_STOMP', label: 'Salto Aplastante (Overhead)', desc: 'Salto alto que cae encima' },
  ],
  SUPER: [
    { id: 'GIANT_BEAM_LASER', label: 'Láser Gigante Pantalla', desc: 'Rayo horizontal multi-hit' },
    { id: 'MULTI_HIT_RUSH_COMBO', label: 'Ráfaga Rush 8-Hits', desc: 'Combo veloz estilo Raging Demon' },
    { id: 'METEOR_SCREEN_DROP', label: 'Meteoro Orbital (Overhead)', desc: 'Cae desde el cielo sobre el rival' },
    { id: 'OMEGA_SUPLEX', label: 'Omega Suplex (Imparable)', desc: 'Agarre imparable con explosión' },
  ],
};


export const FightArena: React.FC<FightArenaProps> = ({
  p1Profile, p2Profile, mode, stage, difficulty, online, tutorial = false, onExit,
}) => {
  const onlineMode = mode === 'ONLINE' && !!online;
  const [tutorialStep,setTutorialStep]=useState(0);
  const [currentStage,setCurrentStage]=useState<StageId>(stage);
  const tutorialStepRef=useRef(0);
  const tutorialLightRef=useRef(0);
  const tutorialOriginRef=useRef<number|null>(null);
  const advanceTutorial = () => {
    if(!tutorial)return;
    tutorialStepRef.current=Math.min(4,tutorialStepRef.current+1);
    setTutorialStep(tutorialStepRef.current);
  };
  const noteTutorialAction=(slot:string)=>{
    if(!tutorial)return;
    if(tutorialStepRef.current===2 && (slot==='LIGHT'||slot==='HEAVY')){
      tutorialLightRef.current++;
      if(tutorialLightRef.current>=3)advanceTutorial();
    }else if(tutorialStepRef.current===3 && slot.startsWith('SP_'))advanceTutorial();
  };

  const guestOnline = onlineMode && online?.role === 'guest';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [onlineIssue,setOnlineIssue]=useState<'reconnecting'|'opponent'|'closed'|null>(null);
  const [rematchRequested,setRematchRequested]=useState(false);
  const [otherWantsRematch,setOtherWantsRematch]=useState(false);
  const [onlineLatency,setOnlineLatency]=useState<number|null>(null);
  const [rankedResult,setRankedResult]=useState<{
    recorded:boolean;reason?:string;
    host_rating_before?:number;guest_rating_before?:number;
    host_rating?:number;guest_rating?:number;
  }|null>(null);
  const engineRef = useRef<FightEngine | null>(null);
  const pausedRef = useRef(false);
  const labRef = useRef(false);
  const p1TouchRef = useRef<InputState>(emptyInput());
  const releaseKeyboardRef = useRef<() => void>(() => {});

  const [snapshot, setSnapshot] = useState<EngineSnapshot>({
    p1Hp: 1000, p1MaxHp: 1000, p1Meter: 0, p1Combo: 0, p1ChainStep: 0, p1ComboDamage: 0,
    p2Hp: 1000, p2MaxHp: 1000, p2Meter: 0, p2Combo: 0, p2ChainStep: 0, p2ComboDamage: 0,
    timer: 99, roundOver: false, winnerName: null, announceText: 'ROUND 1 - FIGHT!',
    roundNumber:1,p1RoundWins:0,p2RoundWins:0,roundBreakFrames:0,roundIntroFrames:0,
  });
  const [paused, setPaused] = useState(false);
  const [fixedStick, setFixedStick] = useState(false);
  const [southpaw, setSouthpaw] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [controlOpacity, setControlOpacity] = useState(() => {
    try { return Math.max(35, Math.min(100, Number(localStorage.getItem('pb-control-opacity')) || 80)); }
    catch { return 80; }
  });
  useEffect(() => {
    try { localStorage.setItem('pb-control-opacity', String(controlOpacity)); } catch { /* private mode */ }
  }, [controlOpacity]);
  const pulse = (duration: number) => {
    if (haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
    }
  };
  const [showHitboxes, setShowHitboxes] = useState(mode === 'TRAINING' && !tutorial);
  const [muted, setMuted] = useState(soundFX.muted);
  const [showLab, setShowLab] = useState(false);
  const [dummyMode, setDummyMode] = useState<'IDLE' | 'GUARD_ALL' | 'GUARD_HIGH' | 'GUARD_LOW' | 'MASH_LIGHT'>('IDLE');
  const [activeSp1, setActiveSp1] = useState<string>(p1Profile.moveset.specialNeutral.mechanic);
  const [activeSp2, setActiveSp2] = useState<string>(p1Profile.moveset.specialForward.mechanic);
  const [activeSp3, setActiveSp3] = useState<string>(p1Profile.moveset.specialUp.mechanic);
  const [activeSup, setActiveSup] = useState<string>(p1Profile.moveset.ultimateSuper.mechanic);

  useEffect(() => {
    pausedRef.current = paused || showLab;
    labRef.current = showLab;
    if (paused || showLab) {
      p1TouchRef.current = emptyInput();
      releaseKeyboardRef.current();
      engineRef.current?.clearBufferedCommands();
      if(onlineMode) online?.neutral(); // Never leave a held movement key active on the server.
    }
  }, [paused, showLab, onlineMode, online]);

  // Prevent browser pull-to-refresh/scroll gestures while actively fighting.
  useEffect(() => {
    document.documentElement.classList.add('arena-touch-lock');
    return () => document.documentElement.classList.remove('arena-touch-lock');
  }, []);

  useEffect(() => {
    const engine = new FightEngine(p1Profile, p2Profile, onlineMode?'1P_VS_2P':mode, stage, difficulty);
    engine.showHitboxes = mode === 'TRAINING' && !tutorial;
    engineRef.current = engine;
    engine.loadAssets();
    const lastNetSnapshot={current:engine.getSnapshot()};
    const lastOnlineStateAt={current:0};
    const unsubscribeOnline = online ? [
      online.on('state',(state:NetworkState)=>{
        const last=lastNetSnapshot.current;
        if(state.snapshot.p1Hp<last.p1Hp || state.snapshot.p2Hp<last.p2Hp){
          const damage=(last.p1Hp-state.snapshot.p1Hp)+(last.p2Hp-state.snapshot.p2Hp);
          if(damage>35)soundFX.heavyHit();else soundFX.lightHit();
        }
        if(!last.roundOver && state.snapshot.roundOver)soundFX.koFanfare();
        lastNetSnapshot.current=state.snapshot;
        engine.applyNetworkState(state);
        lastOnlineStateAt.current=performance.now();
        setSnapshot(state.snapshot);
      }),
      online.on('connection',(event:{connected?:boolean;reconnecting?:boolean;opponent?:boolean})=>{
        setOnlineIssue(event.reconnecting?(event.opponent?'opponent':'reconnecting'):null);
      }),
      online.on('opponent_left',()=>setOnlineIssue('closed')),
      online.on('rematch',(event:{stage?:StageId}|null)=>{
        if(event?.stage){engine.stage=event.stage;setCurrentStage(event.stage);}
        engine.frameCount=0;setRematchRequested(false);setOtherWantsRematch(false);setRankedResult(null);setPaused(false);
      }),
      online.on('ranked_result',(result:{recorded:boolean;reason?:string;host_rating_before?:number;guest_rating_before?:number;host_rating?:number;guest_rating?:number})=>setRankedResult(result)),
      online.on('rematch_vote',(votes:{host:boolean;guest:boolean})=>{
        setOtherWantsRematch(online.role==='host'?votes.guest:votes.host);
      }),
    ] : [];
    const onlinePing=online ? setInterval(()=>{online.keepAlive();setOnlineLatency(online.latency);},4000) : null;

    // Canvas a resolución real de pantalla (retina), con coordenadas lógicas 960×540.
    // No se reescalan ni se sustituyen los sprites ni el fondo del juego.
    const applyCanvasResolution = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(STAGE_WIDTH * dpr);
      const height = Math.round(STAGE_HEIGHT * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    applyCanvasResolution();
    window.addEventListener('resize', applyCanvasResolution);

    // Keyboard and touch are independent sources. Merge every frame so a released
    // touch button cannot leave a move or movement key stuck on the engine.
    const keyboardP1 = emptyInput();
    const keyboardP2 = emptyInput();
    let keyboardSpecialP1: 'spNeutral' | 'spForward' | 'spUp' | null = null;
    let keyboardSpecialP2: 'spNeutral' | 'spForward' | 'spUp' | null = null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        if (event.repeat) return;
        if (labRef.current) setShowLab(false);
        else setPaused((wasPaused) => !wasPaused);
        return;
      }
      if (pausedRef.current) return;
      // G / K son la TÉCNICA contextual: neutra, adelante o arriba.
      if (tutorial && event.code === 'KeyG' && !event.repeat)noteTutorialAction('SP_NEUTRAL');
      if (tutorial && event.code === 'KeyF' && !event.repeat)noteTutorialAction('LIGHT');
      if (event.code === 'KeyG' && onlineMode) {
        event.preventDefault();
        if(!event.repeat)online?.sendAction(specialWithDirection(keyboardP1,guestOnline?engine.p2.facing:engine.p1.facing) === 'spNeutral' ? 'SP_NEUTRAL' : specialWithDirection(keyboardP1,guestOnline?engine.p2.facing:engine.p1.facing) === 'spUp' ? 'SP_UP' : 'SP_FORWARD');
        return;
      }
      if (event.code === 'KeyG') {
        event.preventDefault();
        if (!keyboardSpecialP1) {
          keyboardSpecialP1 = specialWithDirection(keyboardP1, engine.p1.facing);
          keyboardP1[keyboardSpecialP1] = true;
        }
        return;
      }
      if (event.code === 'KeyK' && mode === '1P_VS_2P') {
        event.preventDefault();
        if (!keyboardSpecialP2) {
          keyboardSpecialP2 = specialWithDirection(keyboardP2, engine.p2.facing);
          keyboardP2[keyboardSpecialP2] = true;
        }
        return;
      }
      const p1Key = P1_KEYS[event.code];
      const p2Key = mode === '1P_VS_2P' ? P2_KEYS[event.code] : undefined;
      if (event.code === 'ShiftLeft' && !event.repeat) {
        event.preventDefault();
        if(onlineMode) online?.sendDash(guestOnline?engine.p2.facing:engine.p1.facing);
        else engine.queueTouchDash(engine.p1.facing);
        return;
      }
      if (p1Key || p2Key || event.code === 'Space') event.preventDefault();
      if(onlineMode && p1Key && !event.repeat){
        const attacks:Partial<Record<keyof InputState, 'LIGHT'|'HEAVY'|'SP_FORWARD'|'SP_UP'|'SUPER'>>={light:'LIGHT',heavy:'HEAVY',spForward:'SP_FORWARD',spUp:'SP_UP',superBtn:'SUPER'};
        if(attacks[p1Key]){online?.sendAction(attacks[p1Key]);return;}
      }
      if (p1Key) keyboardP1[p1Key] = true;
      if (p2Key) keyboardP2[p2Key] = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (tutorial && event.code === 'KeyG' && !event.repeat)noteTutorialAction('SP_NEUTRAL');
      if (tutorial && event.code === 'KeyF' && !event.repeat)noteTutorialAction('LIGHT');
      if (event.code === 'KeyG' && onlineMode) {
        event.preventDefault();
        return; // El especial online se ejecuta solo al presionar, nunca al soltar.
      }
      if (event.code === 'KeyG') {
        event.preventDefault();
        if (keyboardSpecialP1) keyboardP1[keyboardSpecialP1] = false;
        keyboardSpecialP1 = null;
        return;
      }
      if (event.code === 'KeyK' && mode === '1P_VS_2P') {
        event.preventDefault();
        if (keyboardSpecialP2) keyboardP2[keyboardSpecialP2] = false;
        keyboardSpecialP2 = null;
        return;
      }
      const p1Key = P1_KEYS[event.code];
      const p2Key = mode === '1P_VS_2P' ? P2_KEYS[event.code] : undefined;
      if (p1Key || p2Key) event.preventDefault();
      if (p1Key) keyboardP1[p1Key] = false;
      if (p2Key) keyboardP2[p2Key] = false;
    };
    const releaseInputs = () => {
      for (const key of Object.keys(keyboardP1) as (keyof InputState)[]) {
        keyboardP1[key] = false;
        keyboardP2[key] = false;
      }
      p1TouchRef.current = emptyInput();
      keyboardSpecialP1 = null;
      keyboardSpecialP2 = null;
    };
    releaseKeyboardRef.current = releaseInputs;
    const handleVisibility = () => {
      if (document.hidden) {
        releaseInputs();
        if(onlineMode)online?.neutral();
        pausedRef.current = true;
        setPaused(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const handleBlur = () => {releaseInputs();if(onlineMode)online?.neutral();};
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    let animId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let uiSyncCounter = 0;
    const loop = (now: number) => {
      accumulator += Math.min(100, now - lastTime);
      lastTime = now;
      while (accumulator >= FIXED_TIMESTEP) {
        if (!pausedRef.current) {
          const touch = p1TouchRef.current;
          for (const key of Object.keys(keyboardP1) as (keyof InputState)[]) {
            engine.p1Input[key] = keyboardP1[key] || touch[key];
            if (mode === '1P_VS_2P') engine.p2Input[key] = keyboardP2[key];
          }
          if(onlineMode){
            const commandInput={...engine.p1Input};
            for(const key of Object.keys(commandInput) as (keyof InputState)[]) commandInput[key]=keyboardP1[key]||touch[key];
            // Attack buttons on keyboards are sent as discrete actions to preserve short taps.
            commandInput.light=false;commandInput.heavy=false;
            commandInput.spNeutral=false;commandInput.spForward=false;commandInput.spUp=false;
            commandInput.superBtn=false;
            online?.sendControls(commandInput);
          }else engine.step();
          if(tutorial){
            if(tutorialOriginRef.current === null)tutorialOriginRef.current=engine.p1.x;
            if(tutorialStepRef.current===0 && Math.abs(engine.p1.x-tutorialOriginRef.current)>55)advanceTutorial();
            if(tutorialStepRef.current===1 && engine.p1.y < 415)advanceTutorial();
          }
          uiSyncCounter++;
        }
        accumulator -= FIXED_TIMESTEP;
      }
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        const scale = canvasRef.current.width / STAGE_WIDTH;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        // Extrapolate only positions between 30 Hz server packets; never advance local combat rules.
        const originalX1=engine.p1.x,originalX2=engine.p2.x;
        const originalY1=engine.p1.y,originalY2=engine.p2.y;
        if(onlineMode && !engine.hitstopFrames && !engine.roundOver && lastOnlineStateAt.current){
          const frames=Math.min(1.6,Math.max(0,(now-lastOnlineStateAt.current)/FIXED_TIMESTEP));
          engine.p1.x+=engine.p1.vx*frames;engine.p2.x+=engine.p2.vx*frames;
          engine.p1.y+=engine.p1.vy*frames;engine.p2.y+=engine.p2.vy*frames;
        }
        engine.render(ctx);
        engine.p1.x=originalX1;engine.p2.x=originalX2;
        engine.p1.y=originalY1;engine.p2.y=originalY2;
      }
      if (uiSyncCounter >= 2) {
        uiSyncCounter = 0;
        if(!onlineMode)setSnapshot(engine.getSnapshot());
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      unsubscribeOnline.forEach(off=>off());
      if(onlinePing)clearInterval(onlinePing);
      if(onlineMode)online?.neutral();
      window.removeEventListener('resize', applyCanvasResolution);
      releaseInputs();
      releaseKeyboardRef.current = () => {};
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [p1Profile, p2Profile, mode, stage, difficulty, online]);

  const toggleHitboxes = () => {
    const next = !showHitboxes;
    setShowHitboxes(next);
    if (engineRef.current) engineRef.current.showHitboxes = next;
  };
  const toggleMute = () => {
    soundFX.muted = !soundFX.muted;
    setMuted(soundFX.muted);
  };
  const handleRematch = () => {
    if(onlineMode){online?.requestRematch();setRematchRequested(true);return;}
    p1TouchRef.current = emptyInput();
    engineRef.current?.resetRound();
    if(tutorial){tutorialStepRef.current=0;setTutorialStep(0);tutorialLightRef.current=0;tutorialOriginRef.current=null;}
    if (engineRef.current) setSnapshot(engineRef.current.getSnapshot());
    pausedRef.current = false;
    setPaused(false);
    setShowLab(false);
  };
  const handleEquipAndFire = (
    slot: 'SP_NEUTRAL' | 'SP_FORWARD' | 'SP_UP' | 'SUPER',
    mechId: string, label: string, fireImmediately: boolean
  ) => {
    if (!engineRef.current) return;
    engineRef.current.setP1Mechanic(slot, mechId, label.toUpperCase());
    if (slot === 'SP_NEUTRAL') setActiveSp1(mechId);
    if (slot === 'SP_FORWARD') setActiveSp2(mechId);
    if (slot === 'SP_UP') setActiveSp3(mechId);
    if (slot === 'SUPER') setActiveSup(mechId);
    if (fireImmediately) engineRef.current.triggerP1MoveNow(slot);
    else soundFX.selectBeep();
  };
  const handleDummyChange = (newMode: 'IDLE' | 'GUARD_ALL' | 'GUARD_HIGH' | 'GUARD_LOW' | 'MASH_LIGHT') => {
    setDummyMode(newMode);
    if (engineRef.current) engineRef.current.trainingDummyMode = newMode;
    soundFX.selectBeep();
  };

  const p1HpPct = Math.max(0, Math.min(100, (snapshot.p1Hp / snapshot.p1MaxHp) * 100));
  const p2HpPct = Math.max(0, Math.min(100, (snapshot.p2Hp / snapshot.p2MaxHp) * 100));
  const modeLabel = tutorial ? 'TUTORIAL' : mode === 'ONLINE' ? 'VERSUS ONLINE' : mode === 'TRAINING' ? 'ENTRENAMIENTO'
    : mode === '1P_VS_2P' ? 'P1 VS P2'
    : mode === 'CPU_VS_CPU' ? 'CPU VS CPU' : 'P1 VS CPU';
  const winnerIsP1 = snapshot.winnerName === p1Profile.fighterName;
  const rankedOnline = onlineMode && online?.room?.ranked === true;
  const rankedRating = online?.role === 'host' ? rankedResult?.host_rating : rankedResult?.guest_rating;
  const rankedDetailsReady = rankedResult?.recorded === true
    && typeof rankedResult.host_rating_before === 'number'
    && typeof rankedResult.guest_rating_before === 'number'
    && typeof rankedResult.host_rating === 'number'
    && typeof rankedResult.guest_rating === 'number';
  const eloLabel = (before:number, after:number) => {
    const change=after-before;
    return `${change>0?'+':''}${change} ELO`;
  };
  const resultModeLabel = rankedOnline ? 'CLASIFICATORIA' : onlineMode ? 'AMISTOSA ONLINE'
    : tutorial ? 'TUTORIAL' : mode === 'TRAINING' ? 'ENTRENAMIENTO' : 'PARTIDA AMISTOSA';
  const stageLabel = STAGE_ART[currentStage]?.name ?? currentStage;

  return (
    <main className="arena-screen">
      <div className="arena-shell">
        <section className="arena-stage" aria-label="Arena de combate">
          <canvas ref={canvasRef} width={STAGE_WIDTH} height={STAGE_HEIGHT} className="arena-canvas" />
          <div className="arena-stage-vignette" aria-hidden="true" />
          {onlineMode && <div className="arena-online-status">{online?.code} · {guestOnline?'P2':'P1'} · {onlineLatency!==null?`${onlineLatency}ms RTT`:'ONLINE'}</div>}
          {onlineMode && onlineIssue && <div className="arena-online-scrim"><section className="pb-frame arena-online-dialog" role="status"><h2>{onlineIssue==='closed'?'RIVAL DESCONECTADO':onlineIssue==='opponent'?'ESPERANDO AL RIVAL':'RECONECTANDO…'}</h2><p>{onlineIssue==='closed'?'La partida ha terminado. Vuelve al menú.':onlineIssue==='opponent'?'El combate se detiene temporalmente mientras se recupera la conexión.':'Estamos recuperando tu sesión online…'}</p>{onlineIssue==='closed'&&<button type="button" onClick={onExit}>VOLVER AL MENÚ</button>}</section></div>}
          <div className="arena-hud" aria-label="Estado del combate">
            <div className="arena-fighter-hud arena-player-one">
              <div className="arena-portrait-slot"><img src={p1Profile.portraitDataUrl} alt="" className="arena-portrait pixel-canvas" /></div>
              <div className="arena-fighter-stats">
                <div className="arena-player-title"><span className="arena-player-tag">{onlineMode?(guestOnline?'RIVAL':'TÚ'):'P1'}</span><span className="arena-fighter-name" title={p1Profile.fighterName}>{p1Profile.fighterName}</span></div>
                <div className="arena-health-track" role="progressbar" aria-label={`Vida de ${p1Profile.fighterName}`} aria-valuemin={0} aria-valuemax={snapshot.p1MaxHp} aria-valuenow={Math.max(0, snapshot.p1Hp)}><div className={`arena-health-fill ${p1HpPct < 30 ? 'is-critical' : ''}`} style={{width:`${p1HpPct}%`}} /></div>
                <div className={`arena-meter-row ${snapshot.p1Meter >= 100 ? 'is-ready' : ''}`} aria-label="Energía de súper del jugador 1">
                  <span className="arena-meter-tag">SP</span>
                  <div className="arena-meter-track" role="progressbar" aria-label="Súper P1" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.p1Meter}>
                    <div className="arena-meter-fill" style={{ width: `${snapshot.p1Meter}%` }} />
                  </div>
                  <span className="arena-meter-number">{snapshot.p1Meter >= 100 ? 'READY' : `${snapshot.p1Meter}%`}</span>
                </div>
              </div>
            </div>
            <div className="arena-time">
              <span className="arena-round-label">RONDA {snapshot.roundNumber} · MEJOR DE 3</span>
              <div className="arena-round-score" aria-label={`Rondas: ${snapshot.p1RoundWins} a ${snapshot.p2RoundWins}`}>
                <span className="arena-round-pips">{[0,1].map(i=><i key={i} className={i<snapshot.p1RoundWins?'is-won':''}/>)}</span>
                <b>{snapshot.p1RoundWins} - {snapshot.p2RoundWins}</b>
                <span className="arena-round-pips">{[0,1].map(i=><i key={i} className={i<snapshot.p2RoundWins?'is-won':''}/>)}</span>
              </div>
              <div className={`arena-time-number ${snapshot.timer <= 10 && mode !== 'TRAINING' ? 'is-urgent' : ''}`} aria-label={`Tiempo restante: ${snapshot.timer}`}>
                {mode === 'TRAINING' ? '∞' : String(snapshot.timer).padStart(2, '0')}
              </div>
              <button type="button" className="arena-pause-shortcut" onClick={() => setPaused(true)} aria-label="Abrir menú de pausa" title="Pausa / opciones (Esc)"><Pause size={15} fill="currentColor" /></button>
            </div>
            <div className="arena-fighter-hud arena-player-two">
              <div className="arena-portrait-slot"><img src={p2Profile.portraitDataUrl} alt="" className="arena-portrait pixel-canvas" /></div>
              <div className="arena-fighter-stats">
                <div className="arena-player-title"><span className="arena-player-tag">{onlineMode?(guestOnline?'TÚ':'RIVAL'):mode === '1P_VS_2P' ? 'P2' : 'CPU'}</span><span className="arena-fighter-name" title={p2Profile.fighterName}>{p2Profile.fighterName}</span></div>
                <div className="arena-health-track" role="progressbar" aria-label={`Vida de ${p2Profile.fighterName}`} aria-valuemin={0} aria-valuemax={snapshot.p2MaxHp} aria-valuenow={Math.max(0, snapshot.p2Hp)}><div className={`arena-health-fill ${p2HpPct < 30 ? 'is-critical' : ''}`} style={{width:`${p2HpPct}%`}} /></div>
                <div className={`arena-meter-row ${snapshot.p2Meter >= 100 ? 'is-ready' : ''}`} aria-label="Energía de súper del jugador 2">
                  <span className="arena-meter-tag">SP</span>
                  <div className="arena-meter-track" role="progressbar" aria-label="Súper P2" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.p2Meter}>
                    <div className="arena-meter-fill" style={{ width: `${snapshot.p2Meter}%` }} />
                  </div>
                  <span className="arena-meter-number">{snapshot.p2Meter >= 100 ? 'READY' : `${snapshot.p2Meter}%`}</span>
                </div>
              </div>
            </div>
          </div>

          {snapshot.p1Combo >= 2 && <div className="arena-combo arena-combo-one"><strong>{snapshot.p1Combo}<small> HITS</small></strong><b>COMBO!</b><span>DAÑO {snapshot.p1ComboDamage}</span></div>}
          {snapshot.p2Combo >= 2 && <div className="arena-combo arena-combo-two"><strong>{snapshot.p2Combo}<small> HITS</small></strong><b>COMBO!</b><span>DAÑO {snapshot.p2ComboDamage}</span></div>}
          {snapshot.announceText && !snapshot.roundOver && !paused && <div className="arena-announcement"><span>{snapshot.announceText}</span></div>}

          {snapshot.roundOver && !paused && (
            <div className="arena-result-overlay">
              <div className="arena-result-card">
                <span className="arena-result-eyebrow">FIN DEL COMBATE · {resultModeLabel}</span>
                <div className="arena-result-headline">K.O.</div>
                <p className="arena-result-name"><span className={winnerIsP1 ? 'winner-p1' : 'winner-p2'}>{snapshot.winnerName ?? 'EMPATE'}</span><span className="arena-result-wins">{snapshot.winnerName ? 'GANA' : ''}</span></p>
                <section className="arena-match-summary" aria-label="Resumen del combate">
                  <div className="arena-summary-score">
                    <span>{p1Profile.fighterName}</span>
                    <strong>{snapshot.p1RoundWins} <i>—</i> {snapshot.p2RoundWins}</strong>
                    <span>{p2Profile.fighterName}</span>
                  </div>
                  {rankedOnline ? (
                    <div className="arena-elo-summary" aria-live="polite">
                      {!rankedResult && <p className="arena-summary-pending">ACTUALIZANDO ELO Y REGISTRANDO RESULTADO…</p>}
                      {rankedDetailsReady && <>
                        <div className="arena-elo-heading"><strong>CAMBIOS DE CLASIFICACIÓN</strong><span>ANTES → AHORA</span></div>
                        <div className="arena-elo-row">
                          <span className="arena-elo-player"><i className="arena-elo-dot is-p1" />{p1Profile.fighterName}</span>
                          <span className="arena-elo-values">{rankedResult!.host_rating_before} <b>→</b> {rankedResult!.host_rating}</span>
                          <strong className={`arena-elo-delta ${(rankedResult!.host_rating!-rankedResult!.host_rating_before!)>=0?'is-positive':'is-negative'}`}>{eloLabel(rankedResult!.host_rating_before!,rankedResult!.host_rating!)}</strong>
                        </div>
                        <div className="arena-elo-row">
                          <span className="arena-elo-player"><i className="arena-elo-dot is-p2" />{p2Profile.fighterName}</span>
                          <span className="arena-elo-values">{rankedResult!.guest_rating_before} <b>→</b> {rankedResult!.guest_rating}</span>
                          <strong className={`arena-elo-delta ${(rankedResult!.guest_rating!-rankedResult!.guest_rating_before!)>=0?'is-positive':'is-negative'}`}>{eloLabel(rankedResult!.guest_rating_before!,rankedResult!.guest_rating!)}</strong>
                        </div>
                        <p className="arena-summary-confirmed">CLASIFICATORIA REGISTRADA · RESULTADO GUARDADO</p>
                      </>}
                      {rankedResult?.recorded && !rankedDetailsReady && <p className="arena-summary-confirmed">RESULTADO GUARDADO · ELO ACTUAL {typeof rankedRating==='number'?rankedRating:'ACTUALIZADO'}</p>}
                      {rankedResult && !rankedResult.recorded && <p className="arena-summary-error">{rankedResult.reason==='duplicate'?'ESTA PARTIDA YA ESTABA REGISTRADA. NO SE HA SUMADO ELO OTRA VEZ.':'NO SE PUDO CONFIRMAR EL REGISTRO. EL ELO NO SE HA VERIFICADO.'}</p>}
                    </div>
                  ) : (
                    <div className="arena-friendly-summary">
                      <strong>{onlineMode ? 'COMBATE AMISTOSO' : resultModeLabel}</strong>
                      <span>El ELO de ambos jugadores no cambia en esta modalidad.</span>
                    </div>
                  )}
                  <div className="arena-summary-stage"><span>ESCENARIO</span><strong>{stageLabel}</strong></div>
                </section>
                {otherWantsRematch && onlineMode && <p className="arena-online-invite">TU RIVAL QUIERE REVANCHA</p>}
                <div className="arena-result-actions"><button className="arena-primary-button" type="button" disabled={rematchRequested} onClick={handleRematch}><RotateCcw size={16}/> {rematchRequested?'ESPERANDO RIVAL':onlineMode?'PEDIR REVANCHA':'REVANCHA'}</button><button className="arena-secondary-button" type="button" onClick={onExit}>{onlineMode?'SALIR DEL ONLINE':'CAMBIAR LUCHADOR'}</button></div>
              </div>
            </div>
          )}
          {paused && (
            <div className="arena-pause-overlay">
              <section className="arena-pause-card" role="dialog" aria-modal="true" aria-label="Menú de pausa">
                <div className="arena-pause-heading"><span className="arena-pause-eyebrow">PHOTO BRAWL · {modeLabel}</span><h2>PAUSA<span>!</span></h2><p>{onlineMode?'LA PARTIDA CONTINÚA · SOLO SE OCULTAN TUS CONTROLES':'EL COMBATE ESTÁ DETENIDO'}</p></div>
                <button type="button" className="arena-primary-button arena-pause-resume" onClick={() => setPaused(false)}><Play size={17} fill="currentColor" /> CONTINUAR</button>
                <div className="arena-pause-options">
                  {!onlineMode && <button type="button" onClick={handleRematch}><RotateCcw size={16} /> REINICIAR</button>}
                  <button type="button" onClick={toggleMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />} SONIDO: {muted ? 'OFF' : 'ON'}</button>
                  {!onlineMode && <button type="button" onClick={toggleHitboxes}><Eye size={16} /> HITBOXES: {showHitboxes ? 'ON' : 'OFF'}</button>}
                  <button type="button" onClick={() => setFixedStick((old) => !old)}><Move size={16} /> JOYSTICK: {fixedStick ? 'FIJO' : 'FLOTANTE'}</button>
                  <button type="button" onClick={() => setSouthpaw((old) => !old)}><Smartphone size={16} /> MANOS: {southpaw ? 'INVERTIDAS' : 'NORMAL'}</button>
                  <label className="arena-opacity-control" htmlFor="mobile-opacity">
                    <span>TRANSPARENCIA CONTROLES · {controlOpacity}%</span>
                    <input id="mobile-opacity" type="range" min="35" max="100" step="5" value={controlOpacity}
                      onChange={(event) => setControlOpacity(Number(event.currentTarget.value))}
                      aria-label="Opacidad de los controles táctiles" />
                  </label>
                  <button type="button" onClick={() => setHaptics((old) => !old)}><Swords size={16} /> VIBRACIÓN: {haptics ? 'ON' : 'OFF'}</button>
                  {!onlineMode && <button type="button" onClick={() => {setShowLab(true);}}><FlaskConical size={16} /> LAB MOVIMIENTOS</button>}
                  <button type="button" className="arena-pause-exit" onClick={onExit}><ArrowLeft size={16}/> SELECCIÓN</button>
                </div>
                <div className="arena-pause-help" aria-label="Guía de controles">
                  <strong>CÓMO JUGAR</strong>
                  <span><b>IZQUIERDA · JOYSTICK</b> Camina y defiende con el joystick; abajo se agacha. Usa SALTO para saltar (solo luchadores con DOUBLE_JUMP pueden repetirlo en el aire).</span>
                  <span><b>DESLIZAR ↔ RÁPIDO</b> Dash. También puedes hacer doble toque direccional en teclado.</span>
                  <span><b>A · GOLPE</b> Toque = ataque inmediato; A → A → A = remate. Mantener enlaza con un golpe fuerte; adelante + A = avance; abajo + A = golpe bajo.</span>
                  <span><b>B · TÉCNICA</b> Neutro = técnica propia · Adelante + B = avance · Arriba + B = antiaéreo.</span>
                  <span><b>ENLAZA</b> A → A → A → B; A → A → B; abajo + A → B; adelante + A → A → B. Encadena al conectar y anticipa las pulsaciones.</span>
                  <span><b>★ SÚPER</b> Aparece al cargar el 100% de la barra bajo la vida.</span>
                  <span className="arena-pause-keyboard"><Keyboard size={13}/> P1: WASD · F G · Y SÚPER · MAYÚS DASH{mode === '1P_VS_2P' ? ' | P2: FLECHAS · J K · O SÚPER' : ''} · ESC PAUSA</span>
                  <span className="arena-pause-advanced">EXTRA TECLADO: H = fuerte · E = cancel (50% de energía) · R/T = técnicas. P2: L/P/U/I.</span>
                </div>
              </section>
            </div>
          )}
        </section>

      </div>

      {tutorial && !paused && !showLab && <aside className="pb-tutorial-in-fight" aria-live="polite"><span>ESCUELA ARCADE · {Math.min(tutorialStep+1,5)}/5</span><strong>{['MUÉVETE','SALTA','ENCADENA TRES GOLPES','USA UNA TÉCNICA','¡TUTORIAL COMPLETADO!'][tutorialStep]}</strong><small>{['Usa el joystick o A/D para caminar.','Pulsa SALTAR o W; algunos personajes pueden hacer doble salto.','Pulsa A tres veces o F en teclado.','Pulsa B, o G en teclado.','Ahora puedes practicar libremente o volver al menú.'][tutorialStep]}</small><div><button type="button" onClick={tutorialStep===4?onExit:advanceTutorial}>{tutorialStep===4?'TERMINAR':'SALTAR PASO'}</button>{tutorialStep!==4&&<button type="button" onClick={onExit}>SALIR</button>}</div></aside>}
      {!tutorial && !paused && !showLab && !snapshot.roundOver && !snapshot.roundBreakFrames && !snapshot.roundIntroFrames && mode !== 'CPU_VS_CPU' && (
        <div className="arena-mobile-guide" aria-hidden="true">
          <div className="arena-guide-panel">
            <span className="arena-guide-eyebrow">APRENDE EN 10 SEGUNDOS</span>
            <strong>TOCA. ENCADENA. GANA.</strong>
            <div className="arena-guide-combos">
              <span><b>A · A · A</b><small>COMBO + REMATE</small></span>
              <span><b>A · A · HOLD</b><small>REMATE FUERTE</small></span>
              <span><b>↓ + A</b><small>GOLPE BAJO</small></span>
            </div>
            <span className="arena-guide-turn"><Smartphone size={14} /> GIRA EL MÓVIL PARA JUGAR A PANTALLA COMPLETA</span>
          </div>
        </div>
      )}
      {!paused && !showLab && !snapshot.roundOver && !snapshot.roundBreakFrames && !snapshot.roundIntroFrames && mode !== 'CPU_VS_CPU' && (
        <MobileControls
          inputRef={p1TouchRef}
          superReady={(guestOnline?snapshot.p2Meter:snapshot.p1Meter) >= 100}
          fixedStick={fixedStick}
          southpaw={southpaw}
          opacity={controlOpacity}
          comboStep={guestOnline?snapshot.p2ChainStep:snapshot.p1ChainStep}
          isFinisherReady={() => {
            const fighter = guestOnline?engineRef.current?.p2:engineRef.current?.p1;
            return !!(fighter && fighter.state === 'ATTACK' && fighter.currentAttack?.slot === 'LIGHT' && fighter.currentAttack.hasHit && fighter.lightChainCount >= 2);
          }}
          onAction={(slot) => { noteTutorialAction(slot); if(onlineMode)online?.sendAction(slot);else engineRef.current?.queueTouchAction(slot); pulse(slot === 'SUPER' ? 20 : 9); }}
          onDash={(dir) => { if(onlineMode)online?.sendDash(dir);else engineRef.current?.queueTouchDash(dir); pulse(8); }}
          onJump={() => { if(onlineMode)online?.sendJump();else engineRef.current?.queueTouchJump(); pulse(7); }}
          getFacing={() => (guestOnline?engineRef.current?.p2.facing:engineRef.current?.p1.facing) ?? 1}
        />
      )}

      {showLab && (
        <div className="arena-lab-layer">
          <button type="button" className="arena-lab-scrim" onClick={() => setShowLab(false)} aria-label="Cerrar laboratorio" />
          <section className="arena-lab-panel" role="dialog" aria-modal="true" aria-label="Laboratorio de mecánicas">
            <header className="arena-lab-header"><div><span className="arena-lab-overline">ENTRENAMIENTO / HERRAMIENTAS</span><h2>LAB DE MOVIMIENTOS</h2><p>Equipa una mecánica o ejecútala al instante.</p></div><button type="button" className="arena-icon-button" aria-label="Cerrar laboratorio" onClick={() => setShowLab(false)}><X size={19}/></button></header>
            {mode === 'TRAINING' && <div className="arena-lab-dummy"><span>RIVAL DE PRUEBAS</span><div className="arena-lab-dummy-buttons">{([
              {id:'IDLE',label:'QUIETO'}, {id:'GUARD_ALL',label:'CUBRE TODO'}, {id:'GUARD_HIGH',label:'ALTO'}, {id:'GUARD_LOW',label:'BAJO'}, {id:'MASH_LIGHT',label:'ATACA'},
            ] as const).map((dm) => <button key={dm.id} type="button" className={dummyMode === dm.id ? 'is-active' : ''} onClick={() => handleDummyChange(dm.id)}>{dm.label}</button>)}</div></div>}
            <div className="arena-lab-grid">{([
              {slot:'SP_NEUTRAL',title:'SP1 / PROYECTIL',current:activeSp1,items:MECHANIC_LAB_CATALOG.SP_NEUTRAL},
              {slot:'SP_FORWARD',title:'SP2 / AVANCE',current:activeSp2,items:MECHANIC_LAB_CATALOG.SP_FORWARD},
              {slot:'SP_UP',title:'SP3 / ANTIAÉREO',current:activeSp3,items:MECHANIC_LAB_CATALOG.SP_UP},
              {slot:'SUPER',title:'SUPER / DEFINITIVA',current:activeSup,items:MECHANIC_LAB_CATALOG.SUPER},
            ] as const).map((group) => <div className="arena-lab-group" key={group.slot}><h3>{group.title}</h3>{group.items.map((item) => <div className={`arena-lab-move ${group.current === item.id ? 'is-equipped' : ''}`} key={item.id}><button type="button" className="arena-lab-equip" onClick={() => handleEquipAndFire(group.slot,item.id,item.label,false)} title={item.desc}><span>{item.label}</span><small>{item.desc}</small></button><button type="button" className="arena-lab-fire" onClick={() => handleEquipAndFire(group.slot,item.id,item.label,true)} title="Equipar y ejecutar ahora" aria-label={`Probar ${item.label}`}><Swords size={16}/></button></div>)}</div>)}</div>
          </section>
        </div>
      )}
    </main>
  );
};
