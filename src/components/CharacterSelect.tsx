import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, Camera, Check, ChevronLeft, ChevronRight,
  CircleHelp, Crown, Gamepad2, KeyRound, Loader2, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Swords, Target, Trash2,
  UsersRound, Volume2, VolumeX, X, Zap, Globe2, Wifi,
} from 'lucide-react';
import type { CpuDifficulty, FighterProfile, GameMode, StageId } from '../types/fighter';
import { FighterCreator } from './FighterCreator';
import { OnlineLobby } from './OnlineLobby';
import { OnlineSession } from '../network/OnlineSession';
import type { OnlineStart, RoomView } from '../network/protocol';
import { PwaInstallPrompt } from './PwaInstallPrompt';
import { markCreatorOpen, wasCreatorOpen } from '../services/creatorDraftService';
import { deleteCustomFighter, getGeminiApiKey, setGeminiApiKey } from '../services/storageService';
import { soundFX } from '../engine/SoundFX';
import './arcadeMenus.css';

type MenuPage = 'HOME' | 'FIGHTERS' | 'MOVES' | 'PLAY' | 'RANKING' | 'SETTINGS';
interface CharacterSelectProps {
  fighters: FighterProfile[];
  onFighterCreated: (fighter: FighterProfile) => void;
  onFighterDeleted: (id: string) => void;
  onStartMatch: (p1: FighterProfile, p2: FighterProfile, mode: GameMode, stage: StageId, difficulty: CpuDifficulty) => void;
  onOnlineMatch: (match: OnlineStart, session: OnlineSession) => void;
}
const ARCHETYPES: Record<string, string> = {
  RUSHDOWN: 'RÁPIDO / OFENSIVO', GRAPPLER_TANK: 'POTENCIA / AGARRES',
  ZONER_MAGE: 'ZONER / TÉCNICO', TRICKSTER: 'MOVILIDAD / ENGAÑOS', SHOTO_BALANCED: 'EQUILIBRADO',
};
const PASSIVES: Record<string, string> = {
  DOUBLE_JUMP: 'DOBLE SALTO', AIR_DASH: 'DASH AÉREO',
  HEAVY_ARMOR_STARTUP: 'ARMADURA DE ARRANQUE', FAST_METER_GAIN: 'CARGA RÁPIDA',
  LONG_REACH_LIMBS: 'MAYOR ALCANCE', VAMPIRIC_ON_SPECIAL: 'ROBO DE VIDA',
};
const STAGES: { id: StageId; title: string; short: string }[] = [
  { id: 'SKI_RESORT', title: 'ESTACIÓN DE ESQUÍ', short: 'ALPES' },
  { id: 'NIGHT_PLAZA', title: 'PLAZA NOCTURNA', short: 'CIUDAD' },
  { id: 'SUMMER_SUMMIT', title: 'CUMBRE DE VERANO', short: 'CUMBRE' },
];
const GAME_MODES: { id: GameMode; title: string; detail: string; icon: React.ReactNode }[] = [
  { id: '1P_VS_CPU', title: 'COMBATE 1V1', detail: 'CONTRA LA CPU', icon: <Swords size={22}/> },
  { id: 'TRAINING', title: 'TRAINING', detail: 'PRACTICA COMBOS', icon: <Target size={22}/> },
  { id: '1P_VS_2P', title: 'VERSUS LOCAL', detail: 'DOS TECLADOS', icon: <Gamepad2 size={22}/> },
  { id: 'ONLINE', title: 'VERSUS ONLINE', detail: 'DOS MÓVILES · CÓDIGO', icon: <Globe2 size={22}/> },
];
const STAT_FIELDS = [
  { key: 'hp' as const, label: 'HP', color: 'green' },
  { key: 'speed' as const, label: 'SPD', color: 'cyan' },
  { key: 'power' as const, label: 'PWR', color: 'red' },
  { key: 'technique' as const, label: 'TEC', color: 'gold' },
];
const DEMO_IDS = ['preset_el_mozo', 'preset_oso_mostaza', 'preset_maga_neon', 'preset_sombra_ninja'];
const DEMO_SCORES = [2380, 2310, 2255, 2190];
function StatGrid({ fighter }: { fighter: FighterProfile }) {
  return <div className="pb-stat-grid" aria-label={`Estadísticas de ${fighter.fighterName}`}>
    {STAT_FIELDS.map(item => <div className="pb-stat-line" key={item.key}>
      <span className={`pb-stat-label pb-text-${item.color}`}>{item.label}</span>
      <div className="pb-stat-pips" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < Math.max(1, Math.round(fighter.stats[item.key] / 35 * 10)) ? `on pb-pip-${item.color}` : ''}/>)}</div>
      <span className="pb-stat-number">{fighter.stats[item.key]}</span>
    </div>)}
  </div>;
}
function FighterPortrait({ fighter }: { fighter: FighterProfile }) {
  return <img className="pb-portrait" src={fighter.portraitDataUrl} alt={fighter.fighterName} draggable={false}/>;
}
function PanelTitle({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="pb-panel-title"><span>{label}</span><h2>{children}</h2></div>;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({ fighters, onFighterCreated, onFighterDeleted, onStartMatch, onOnlineMatch }) => {
  const [page, setPage] = useState<MenuPage>(() => wasCreatorOpen() ? 'FIGHTERS' : 'HOME');
  const [p1Id, setP1Id] = useState(() => { try { return localStorage.getItem('pb-menu-fighter') || 'preset_el_mozo'; } catch { return 'preset_el_mozo'; } });
  const [p2Id, setP2Id] = useState('preset_oso_mostaza');
  const [mode, setMode] = useState<GameMode>(()=>new URLSearchParams(location.search).has('room')?'ONLINE':'1P_VS_CPU');
  const [onlineSession,setOnlineSession]=useState<OnlineSession|null>(null);
  const [onlineRoom,setOnlineRoom]=useState<RoomView|null>(null);
  const [showOnlineLobby,setShowOnlineLobby]=useState(()=>new URLSearchParams(location.search).has('room')); 
  const [onlineError,setOnlineError]=useState('');
  const [stage, setStage] = useState<StageId>('SKI_RESORT');
  const [difficulty, setDifficulty] = useState<CpuDifficulty>('NORMAL');
  const [rosterPage, setRosterPage] = useState(0);
  const [rivalPage, setRivalPage] = useState(0);
  const [showCreator, setShowCreator] = useState(wasCreatorOpen);
  const [installRequest, setInstallRequest] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => { try { const saved = localStorage.getItem('pb-sound-muted'); if (saved !== null) soundFX.muted = saved === 'true'; } catch {} return soundFX.muted; });
  const [controlOpacity, setControlOpacity] = useState(() => { try { return Math.max(35, Math.min(100, Number(localStorage.getItem('pb-control-opacity')) || 80)); } catch { return 80; } });
  const [stickFixed, setStickFixed] = useState(() => { try { return localStorage.getItem('pb-stick-fixed') === 'true'; } catch { return false; } });
  const [southpaw, setSouthpaw] = useState(() => { try { return localStorage.getItem('pb-southpaw') === 'true'; } catch { return false; } });
  const [haptics, setHaptics] = useState(() => { try { return localStorage.getItem('pb-haptics') !== 'false'; } catch { return true; } });
  const featured = fighters.find(f => f.id === p1Id) || fighters[0];
  const rival = fighters.find(f => f.id === p2Id) || fighters[1] || featured;
  const selectedMode = GAME_MODES.find(m => m.id === mode) || GAME_MODES[0];
  const demoLeaders = useMemo(() => DEMO_IDS.map((id, i) => ({ fighter: fighters.find(f => f.id === id), score: DEMO_SCORES[i], rank: i + 1 })).filter((entry): entry is { fighter: FighterProfile; score: number; rank: number } => !!entry.fighter), [fighters]);
  const rosterPages = Math.max(1, Math.ceil(fighters.length / 6));
  const rivalPages = Math.max(1, Math.ceil(fighters.length / 6));

  useEffect(() => { try { localStorage.setItem('pb-control-opacity', String(controlOpacity)); } catch {} }, [controlOpacity]);
  useEffect(() => { try { localStorage.setItem('pb-sound-muted', String(muted)); } catch {} }, [muted]);
  useEffect(() => { try { localStorage.setItem('pb-stick-fixed', String(stickFixed)); } catch {} }, [stickFixed]);
  useEffect(() => { try { localStorage.setItem('pb-southpaw', String(southpaw)); } catch {} }, [southpaw]);
  useEffect(() => { try { localStorage.setItem('pb-haptics', String(haptics)); } catch {} }, [haptics]);
  useEffect(() => { if (featured) try { localStorage.setItem('pb-menu-fighter', featured.id); } catch {} }, [featured?.id]);
  // Session remains attached to the HOME screen even if the invite sheet closes.
  // Reconnect across page reloads (e.g. switching from Gemini or losing mobile focus).
  useEffect(() => {
    if(!onlineSession) return;
    const unsub=[
      onlineSession.on('room',(r:RoomView)=>{setOnlineRoom(r);setMode('ONLINE');}),
      onlineSession.on('error',(msg:string)=>setOnlineError(msg)),
      onlineSession.on('start',(match:OnlineStart)=>onOnlineMatch(match,onlineSession)),
      onlineSession.on('opponent_left',()=>{setOnlineRoom(null);setOnlineError('El rival ha abandonado la sala.');}),
    ];
    return ()=>unsub.forEach(fn=>fn());
  },[onlineSession,onOnlineMatch]);
  useEffect(()=>{
    let current=true;
    OnlineSession.restore().then(session=>{
      if(!current)return; // StrictMode: el otro efecto reutiliza la sesión restaurada.
      if(session){setOnlineSession(session);setMode('ONLINE');}
    });
    return ()=>{current=false;};
  },[]);
  useEffect(()=>{
    if(onlineSession?.room?.status==='waiting' && featured)onlineSession.choose(featured,stage);
  },[featured?.id]);
  useEffect(()=>{if(onlineSession?.room?.role==='host' && onlineSession.room.status==='waiting')onlineSession.stage(stage);},[stage]);
  const setOnlineSessionSafe=(session:OnlineSession|null)=>{
    if(onlineSession && onlineSession!==session)onlineSession.close();
    setOnlineSession(session);setOnlineRoom(session?.room||null);setOnlineError('');
  };
  const selectMode=(id:GameMode)=>{
    if(id!=='ONLINE'&&onlineSession){onlineSession.close();setOnlineSession(null);setOnlineRoom(null);}
    setMode(id);soundFX.selectBeep();
  };
  const go = (next: MenuPage) => { soundFX.selectBeep(); setPage(next); };
  const back = () => go(page === 'MOVES' ? 'FIGHTERS' : 'HOME');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmDelete) { setConfirmDelete(null); return; }
      if (showCreator) { markCreatorOpen(false); setShowCreator(false); return; }
      if (showApiKey) { setShowApiKey(false); return; }
      setPage(current => current === 'MOVES' ? 'FIGHTERS' : 'HOME');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDelete, showCreator, showApiKey]);
  const startFromHome = () => {
    if (page !== 'HOME' || !featured || !rival) return;
    soundFX.confirmBeep();
    if(mode==='ONLINE'){
      if(onlineSession && onlineRoom?.role==='host' && onlineRoom.guest && onlineRoom.host.ready && onlineRoom.guest.ready && onlineRoom.guest.connected){onlineSession.start();return;}
      setShowOnlineLobby(true);return;
    }
    onStartMatch(featured,rival,mode,stage,difficulty);
  };
  const pickFighter = (fighter: FighterProfile) => { setP1Id(fighter.id); soundFX.selectBeep(); };
  const openKey = () => { setApiKeyInput(getGeminiApiKey()); setShowApiKey(true); soundFX.selectBeep(); };
  const openCreator = () => { markCreatorOpen(true); setShowCreator(true); soundFX.selectBeep(); };
  const closeCreator = () => { markCreatorOpen(false); setShowCreator(false); };
  const handleCreated = (created: FighterProfile) => {
    onFighterCreated(created); setP1Id(created.id); setRosterPage(0);
    markCreatorOpen(false); setShowCreator(false); setPage('FIGHTERS'); soundFX.confirmBeep();
  };
  const removeCustom = async (id: string) => {
    try {
      await deleteCustomFighter(id); onFighterDeleted(id);
      if (p1Id === id) setP1Id('preset_el_mozo');
      if (p2Id === id) setP2Id('preset_oso_mostaza');
      setConfirmDelete(null); soundFX.selectBeep();
    } catch (err) { console.warn('No se pudo eliminar el luchador', err); setConfirmDelete(null); }
  };
  if (!featured) return <main className="pb-app"><div className="pb-menu-shell">NO HAY LUCHADORES DISPONIBLES</div></main>;
  const moveCards = [
    { name: featured.moveset.lightNormal.name, label: 'LIGERO', input: 'TOCAR A', detail: 'A → A → A', tone: 'green' },
    { name: featured.moveset.heavyNormal.name, label: 'FUERTE', input: 'MANTENER A', detail: 'A → A → mantener A', tone: 'red' },
    { name: featured.moveset.specialNeutral.name, label: 'ESPECIAL', input: 'B', detail: 'Técnica neutral', tone: 'cyan' },
    { name: featured.moveset.specialForward.name, label: 'AVANCE', input: '→ + B', detail: 'Hacia el rival + B', tone: 'orange' },
    { name: featured.moveset.specialUp.name, label: 'ANTIAÉREO', input: '↑ + B', detail: 'Joystick arriba + B', tone: 'purple' },
    { name: featured.moveset.ultimateSuper.name, label: 'SÚPER', input: '★ SUPER', detail: 'Barra al 100 %', tone: 'gold' },
  ];
  return <main className="pb-app"><div className={`pb-menu-shell pb-screen-${page.toLowerCase()}`}>
    {page !== 'HOME' && <button type="button" className="pb-back-button" onClick={back} aria-label="Volver"><ArrowLeft size={16}/> VOLVER</button>}

    {page === 'HOME' && <div className="pb-home pb-page-anim">
      <section className="pb-featured pb-frame" aria-label="Luchador seleccionado">
        <div className="pb-featured-kicker">TU LUCHADOR</div>
        <h1 className="pb-featured-name">{featured.fighterName}</h1>
        <div className="pb-featured-art"><div className="pb-halo"/><div className="pb-fighter-stand" style={{ backgroundImage: `url("${featured.spriteSheetDataUrl}")` }}/></div>
        <div className="pb-featured-info"><StatGrid fighter={featured}/><div className="pb-featured-passive"><ShieldCheck size={14}/>{PASSIVES[featured.passiveTrait] || featured.passiveTrait}</div></div>
        <button type="button" className="pb-arcade-button pb-gold pb-select-button" onClick={() => go('FIGHTERS')}><UsersRound size={18}/> ELEGIR LUCHADOR <ChevronRight size={17}/></button>
      </section>
      <section className="pb-home-controls">
        <div className="pb-home-brand"><span>PHOTO <b>BRAWL</b></span><small>ARCADE FIGHT CLUB · 16-BIT</small></div>
        <div className="pb-mode-heading">ELIGE UN MODO</div>
        <div className="pb-home-modes" role="group" aria-label="Modo de juego">
          {GAME_MODES.map(item => <button type="button" key={item.id} aria-pressed={mode === item.id} className={`pb-mode-tile ${mode === item.id ? 'is-selected' : ''}`} onClick={() => selectMode(item.id)}><span className="pb-mode-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span>{mode === item.id && <Check className="pb-mode-check" size={16}/>}</button>)}
        </div>
        <button type="button" className="pb-match-option pb-frame" onClick={() => mode==='ONLINE' ? setShowOnlineLobby(true) : go('PLAY')}><Settings2 size={17}/><span><b>{mode==='ONLINE'?'SALA PRIVADA':'OPCIONES DE PARTIDA'}</b><small>{mode==='ONLINE'?(onlineRoom?`${onlineRoom.code} · ${onlineRoom.guest?'2 JUGADORES':'ESPERANDO RIVAL'}`:'CREAR O UNIRSE'):`${STAGES.find(s => s.id === stage)?.short} · ${mode === 'TRAINING' ? 'PRÁCTICA' : mode === '1P_VS_2P' ? '2 JUGADORES' : difficulty === 'EASY' ? 'CPU FÁCIL' : difficulty === 'HARD' ? 'CPU DIFÍCIL' : 'CPU NORMAL'}`}</small></span><ChevronRight size={17}/></button>
        <button type="button" className="pb-arcade-button pb-gold pb-start" onClick={startFromHome}><Swords size={23}/><span>{mode==='ONLINE'?(onlineRoom?.role==='host'&&onlineRoom.guest?.ready&&onlineRoom.host.ready?'¡COMENZAR ONLINE!':onlineRoom?.role==='guest'?'SALA ONLINE':'ABRIR SALA ONLINE'):mode==='TRAINING'?'EMPEZAR TRAINING':'¡JUGAR AHORA!'}</span><ChevronRight size={20}/></button>
        <div className="pb-home-footer"><button type="button" onClick={() => go('RANKING')}><Crown size={16}/> RANKING <small>DEMO</small></button><button type="button" onClick={() => go('SETTINGS')}><Settings2 size={16}/> AJUSTES</button></div>
      </section>
    </div>}

    {page === 'FIGHTERS' && <div className="pb-subpage pb-roster-layout pb-page-anim">
      <section className="pb-frame pb-roster-panel"><PanelTitle label={`PLANTILLA · ${fighters.length} DISPONIBLES`}>ELIGE TU LUCHADOR</PanelTitle>
        <div className="pb-portrait-grid">{fighters.slice(rosterPage * 6, rosterPage * 6 + 6).map(f => <button key={f.id} type="button" onClick={() => pickFighter(f)} aria-pressed={f.id === featured.id} className={`pb-portrait-choice ${f.id === featured.id ? 'is-active' : ''}`}><FighterPortrait fighter={f}/><span>{f.fighterName}</span>{f.id === featured.id && <i><Check size={11}/></i>}</button>)}</div>
        <div className="pb-panel-bottom"><div className="pb-pagination"><button type="button" disabled={rosterPage === 0} onClick={() => setRosterPage(rosterPage - 1)} aria-label="Página anterior"><ChevronLeft size={16}/></button><span>{rosterPage + 1} / {rosterPages}</span><button type="button" disabled={rosterPage >= rosterPages - 1} onClick={() => setRosterPage(rosterPage + 1)} aria-label="Página siguiente"><ChevronRight size={16}/></button></div><button type="button" className="pb-mini-button pb-purple" onClick={openCreator}><Camera size={15}/> CREAR CON FOTO</button></div>
      </section>
      <section className="pb-frame pb-profile-panel"><div className="pb-profile-heading"><FighterPortrait fighter={featured}/><div><span>LUCHADOR ELEGIDO</span><h2>{featured.fighterName}</h2><small>{ARCHETYPES[featured.archetype]}</small></div></div><div className="pb-profile-stats"><StatGrid fighter={featured}/></div><div className="pb-passive-panel"><strong><ShieldCheck size={15}/> {PASSIVES[featured.passiveTrait] || featured.passiveTrait}</strong><p>{featured.traitDescription}</p></div><div className="pb-profile-footer"><button type="button" className="pb-mini-button pb-blue" onClick={() => go('MOVES')}><BookOpen size={16}/> MOVIMIENTOS</button><button type="button" className="pb-mini-button pb-gold" onClick={() => go('HOME')}><Check size={16}/> CONFIRMAR</button></div>{!featured.isPreset && <button type="button" className="pb-delete-link" onClick={() => setConfirmDelete(featured.id)}><Trash2 size={12}/> BORRAR PERSONAJE</button>}</section>
    </div>}

    {page === 'MOVES' && <div className="pb-subpage pb-moves-layout pb-page-anim"><section className="pb-frame pb-moves-side"><PanelTitle label="FICHA TÉCNICA">{featured.fighterName}</PanelTitle><FighterPortrait fighter={featured}/><span className="pb-passive-label">{PASSIVES[featured.passiveTrait] || featured.passiveTrait}</span><p>{featured.traitDescription}</p></section><section className="pb-frame pb-moves-main"><PanelTitle label="MOVIMIENTOS REALES · CONTROLES MÓVILES">LISTA DE MOVIMIENTOS</PanelTitle><div className="pb-moves-grid">{moveCards.map(m => <article className={`pb-move-tile pb-move-${m.tone}`} key={m.label}><div><span>{m.label}</span><b>{m.input}</b></div><h3>{m.name}</h3><small>{m.detail}</small></article>)}</div><div className="pb-combo-line"><span>COMBOS</span><strong>A → A → A → B</strong><strong>A → A → MANTENER A</strong></div></section></div>}

    {page === 'PLAY' && <div className="pb-subpage pb-options-layout pb-page-anim"><section className="pb-frame pb-options-rival"><PanelTitle label="CONFIGURACIÓN DE PARTIDA">RIVAL</PanelTitle><div className="pb-versus-preview"><div><FighterPortrait fighter={featured}/><small>{mode === 'CPU_VS_CPU' ? 'CPU 1' : 'JUGADOR 1'}</small><strong>{featured.fighterName}</strong></div><b>VS</b><div><FighterPortrait fighter={rival}/><small>{mode === '1P_VS_2P' ? 'JUGADOR 2' : mode === 'TRAINING' ? 'RIVAL DE PRUEBAS' : mode === 'CPU_VS_CPU' ? 'CPU 2' : 'RIVAL CPU'}</small><strong>{rival.fighterName}</strong></div></div><div className="pb-mini-label">SELECCIONAR RIVAL</div><div className="pb-rival-grid">{fighters.slice(rivalPage * 6, rivalPage * 6 + 6).map(f => <button key={f.id} type="button" onClick={() => { setP2Id(f.id); soundFX.selectBeep(); }} className={f.id === rival.id ? 'is-selected' : ''}><FighterPortrait fighter={f}/><span>{f.fighterName}</span></button>)}</div><div className="pb-pagination pb-rival-pagination"><button type="button" disabled={rivalPage === 0} onClick={() => setRivalPage(rivalPage - 1)} aria-label="Rivales anteriores"><ChevronLeft size={16}/></button><span>{rivalPage + 1} / {rivalPages}</span><button type="button" disabled={rivalPage >= rivalPages - 1} onClick={() => setRivalPage(rivalPage + 1)} aria-label="Más rivales"><ChevronRight size={16}/></button></div></section>
      <section className="pb-frame pb-options-stage"><PanelTitle label="PERSONALIZA SIN SALIR DEL MENÚ">ESCENARIO Y DIFICULTAD</PanelTitle><div className="pb-stage-grid">{STAGES.map(s => <button type="button" key={s.id} aria-pressed={stage === s.id} onClick={() => { setStage(s.id); soundFX.selectBeep(); }} className={`pb-stage-choice pb-stage-${s.id.toLowerCase()} ${stage === s.id ? 'is-selected' : ''}`}><span className="pb-stage-art"/><b>{s.short}</b><small>{s.title}</small></button>)}</div>{(mode === '1P_VS_CPU' || mode === 'CPU_VS_CPU') ? <><div className="pb-mini-label">DIFICULTAD DE LA CPU</div><div className="pb-difficulty">{(['EASY', 'NORMAL', 'HARD'] as CpuDifficulty[]).map(d => <button key={d} type="button" aria-pressed={difficulty === d} className={difficulty === d ? 'is-selected' : ''} onClick={() => setDifficulty(d)}>{d === 'EASY' ? 'FÁCIL' : d === 'HARD' ? 'DIFÍCIL' : 'NORMAL'}</button>)}</div></> : <div className="pb-mode-clarifier">{mode === 'TRAINING' ? 'Práctica libre: sin dificultad de CPU.' : 'Versus local: dos jugadores con teclado.'}</div>}<div className="pb-options-note">Modo: <b>{selectedMode.title}</b><span>Todos los combates se inician desde Inicio.</span></div><button type="button" className="pb-arcade-button pb-gold pb-confirm-options" onClick={() => go('HOME')}><Check size={17}/> GUARDAR Y VOLVER</button></section></div>}

    {page === 'RANKING' && <section className="pb-subpage pb-frame pb-ranking-page pb-page-anim"><PanelTitle label="PRÓXIMAMENTE · PUNTUACIONES FICTICIAS">TOP RANKING <span className="pb-demo-badge">DEMO</span></PanelTitle><div className="pb-ranking-cards">{demoLeaders.map(entry => <div className={`pb-rank-card pb-rank-${entry.rank}`} key={entry.rank}><span className="pb-rank-medal">{entry.rank === 1 ? '♛' : entry.rank === 2 ? '◆' : entry.rank === 3 ? '▲' : '★'}</span><FighterPortrait fighter={entry.fighter}/><strong>#{entry.rank} · {entry.fighter.fighterName}</strong><small>{entry.score} ELO</small></div>)}</div><p className="pb-ranking-disclaimer"><CircleHelp size={15}/> Clasificación de muestra. No hay partidas clasificatorias, ranking online ni historial local de combates.</p></section>}

    {page === 'SETTINGS' && <div className="pb-subpage pb-settings-layout pb-page-anim"><section className="pb-frame pb-settings-controls"><PanelTitle label="PERSONALIZA LA EXPERIENCIA">AJUSTES</PanelTitle>
      <div className="pb-setting-row"><div><SlidersHorizontal size={16}/><span>TRANSPARENCIA BOTONES</span></div><label className="pb-opacity"><input aria-label="Transparencia controles" type="range" min="35" max="100" step="5" value={controlOpacity} onChange={e => setControlOpacity(Number(e.target.value))}/><b>{controlOpacity}%</b></label></div>
      {([['JOYSTICK FIJO', stickFixed, () => setStickFixed(!stickFixed)], ['MODO ZURDOS', southpaw, () => setSouthpaw(!southpaw)], ['VIBRACIÓN TÁCTIL', haptics, () => setHaptics(!haptics)], ['SONIDO', !muted, () => { soundFX.muted = !soundFX.muted; setMuted(soundFX.muted); }]] as [string, boolean, () => void][]).map(([title, value, action], i) => <div className="pb-setting-row" key={title}><div>{i === 3 ? (muted ? <VolumeX size={16}/> : <Volume2 size={16}/>) : i === 2 ? <Zap size={16}/> : <Gamepad2 size={16}/>}<span>{title}</span></div><button type="button" className={`pb-toggle ${value ? 'is-on' : ''}`} aria-label={title} aria-pressed={value} onClick={action}><i/></button></div>)}
    </section><section className="pb-frame pb-settings-info"><PanelTitle label="INFORMACIÓN Y HERRAMIENTAS">MÓVIL Y TECLADO</PanelTitle><div className="pb-control-help"><strong>MÓVIL</strong><span>Joystick · A golpear · B técnica · SALTAR</span><strong>TECLADO P1</strong><span>WASD mover · F golpe · G técnica · H fuerte · ESC pausa</span></div><div className="pb-gemini-status"><KeyRound size={16}/><span>GEMINI: {getGeminiApiKey() ? 'CONFIGURADO' : 'SIN CLAVE'}</span></div><button type="button" className="pb-mini-button pb-purple pb-key-button" onClick={openKey}><KeyRound size={16}/> CONFIGURAR CLAVE GEMINI</button><button type="button" className="pb-mini-button pb-blue pb-pwa-settings-button" onClick={() => { setPage('HOME'); setInstallRequest(n=>n+1); }}><Gamepad2 size={15}/> INSTALAR JUEGO COMO APP</button><small className="pb-settings-hint">Para crear un luchador con foto, entra en «Elegir luchador» desde Inicio.</small></section></div>}
  </div>

  {showOnlineLobby && mode==='ONLINE' && page==='HOME' && featured && <OnlineLobby fighter={featured} stage={stage} session={onlineSession} room={onlineRoom} externalError={onlineError} onSession={setOnlineSessionSafe} onClose={()=>setShowOnlineLobby(false)}/>}
  {onlineError && mode==='ONLINE' && !showOnlineLobby && <div className="pb-online-notice" role="status" onClick={()=>setOnlineError('')}>{onlineError} · Toca para cerrar</div>}
  {showApiKey && <div className="pb-modal-backdrop" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) setShowApiKey(false); }}><section className="pb-modal pb-frame" role="dialog" aria-modal="true" aria-label="Configurar Gemini"><button type="button" className="pb-modal-close" onClick={() => setShowApiKey(false)} aria-label="Cerrar"><X size={18}/></button><PanelTitle label="PERSONALIZACIÓN">CLAVE GEMINI</PanelTitle><label className="pb-field-label">API KEY<input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="Introduce tu API key" autoComplete="off"/></label><p className="pb-modal-note">Se guarda en el navegador de este dispositivo.</p><div className="pb-modal-actions"><button type="button" className="pb-mini-button pb-muted" onClick={() => setShowApiKey(false)}>CANCELAR</button><button type="button" className="pb-mini-button pb-gold" onClick={() => { setGeminiApiKey(apiKeyInput); setShowApiKey(false); soundFX.confirmBeep(); }}>GUARDAR</button></div></section></div>}
  {showCreator && <FighterCreator onClose={closeCreator} onCreated={handleCreated} />}
  <PwaInstallPrompt visible={page === 'HOME' && !showCreator && !showApiKey && !confirmDelete} requestId={installRequest}/>
  {confirmDelete && <div className="pb-modal-backdrop"><section className="pb-modal pb-frame" role="alertdialog" aria-modal="true" aria-label="Borrar luchador"><PanelTitle label="CONFIRMACIÓN">¿BORRAR LUCHADOR?</PanelTitle><p className="pb-modal-note">Se eliminará permanentemente de este dispositivo.</p><div className="pb-modal-actions"><button type="button" className="pb-mini-button pb-muted" onClick={() => setConfirmDelete(null)}>CANCELAR</button><button type="button" className="pb-mini-button pb-red" onClick={() => removeCustom(confirmDelete)}><Trash2 size={15}/> BORRAR</button></div></section></div>}
  </main>;
};
