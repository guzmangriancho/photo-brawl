import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock3, Crown, Loader2, Play, Swords, Trophy, Users } from 'lucide-react';
import type { CpuDifficulty, FighterProfile, StageId } from '../types/fighter';
import type { CpuTactics } from '../engine/cpuTactics';
import { REPLAYABLE_SIM_VERSIONS } from '../engine/fightSeed';
import { CpuTacticsPanel } from './CpuTacticsPanel';
import { TournamentVideoPanel } from './TournamentVideoPanel';
import {
  fetchTournamentBracket, fetchTournamentMatch, fetchTournamentState, joinTournament, saveTournamentTactics, toFighterProfile,
  type BracketMatch, type TournamentFighter, type TournamentMatchView, type TournamentState,
} from '../services/tournamentService';
import './tournament.css';

export interface TournamentReplayStart { p1: FighterProfile; p2: FighterProfile; stage: StageId; difficulty: CpuDifficulty; tactics: { p1: CpuTactics; p2: CpuTactics }; simVersion: number; roundsToWin: number }
interface Props { fighters: FighterProfile[]; onWatch: (start: TournamentReplayStart) => void }

const BRACKET_KEY = 'pb-tournament-bracket';
const STATS: [keyof FighterProfile['stats'], string][] = [['hp', 'HP'], ['speed', 'SPD'], ['power', 'PWR'], ['technique', 'TEC']];
const ARCH: Record<string, string> = { RUSHDOWN: 'RUSHDOWN', GRAPPLER_TANK: 'TANQUE', ZONER_MAGE: 'ZONER', TRICKSTER: 'TRICKSTER', SHOTO_BALANCED: 'EQUILIBRADO' };

export function formatCountdown(ms: number): string {
  if (!(ms > 0)) return '00:00';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${two(h)}h ${two(m)}m` : h > 0 ? `${h}h ${two(m)}m ${two(sec)}s` : `${two(m)}:${two(sec)}`;
}
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase();
}

function Countdown({ to, offset, label }: { to: string | null; offset: number; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const left = new Date(to).getTime() - (now + offset);
  return <div className="pb-trn-count" role="timer"><Clock3 size={15} /><small>{label}</small><b>{left > 0 ? formatCountdown(left) : 'AHORA…'}</b><i>{whenLabel(to)}</i></div>;
}

function FighterCard({ f, title, hint }: { f: TournamentFighter; title: string; hint?: string }) {
  const p = f.fighter;
  const moves = [p.moveset.lightNormal, p.moveset.heavyNormal, p.moveset.specialNeutral, p.moveset.specialForward, p.moveset.specialUp, p.moveset.ultimateSuper];
  return <section className="pb-frame pb-trn-fighter" aria-label={`${title}: ${f.name}`}>
    <img src={f.portraitUrl} alt="" draggable={false} />
    <div className="pb-trn-fighter-body">
      <small>{title}</small>
      <strong>{f.name}</strong>
      <span className="pb-trn-arch">{ARCH[p.archetype] || p.archetype}{f.instagram ? ` · @${f.instagram}` : ''}</span>
      <div className="pb-trn-stats">{STATS.map(([k, l]) => <div key={k}><span>{l}</span><i><u style={{ width: `${Math.round(p.stats[k] / 35 * 100)}%` }} /></i><b>{p.stats[k]}</b></div>)}</div>
      <ul className="pb-trn-moves">{moves.map((m, i) => <li key={i}>{m.name}</li>)}</ul>
      {hint && <em>{hint}</em>}
    </div>
  </section>;
}

function resultOf(m: TournamentMatchView, myEntry: string) {
  const won = m.winnerEntryId === myEntry;
  const mine = m.youAre === 'a' ? m.scoreA : m.scoreB, theirs = m.youAre === 'a' ? m.scoreB : m.scoreA;
  return { won, text: `${mine ?? 0}-${theirs ?? 0}` };
}

function roundName(r: number, total: number): string {
  return r === total ? 'FINAL' : r === total - 1 ? 'SEMIFINAL' : r === total - 2 ? 'CUARTOS' : `RONDA ${r}`;
}
/** Cuadro de eliminatorias: una columna por ronda, una casilla por combate con retratos; el que cae se apaga en gris. */
function BracketTree({ rounds, total, watching, onWatch }: { rounds: { total: number; matches: BracketMatch[] }[]; total: number; watching: string; onWatch: (id: string) => void }) {
  return <div className="pb-trn-tree" role="group" aria-label="Cuadro de eliminatorias">
    {rounds.map((r, ri) => <div className="pb-trn-col" key={ri}>
      <h4>{roundName(ri + 1, total)}</h4>
      <div className="pb-trn-col-body">{r.matches.map(m => {
        const aw = m.winnerEntryId === m.entryA, bw = m.winnerEntryId === m.entryB;
        const slot = (name: string | undefined, img: string | undefined, win: boolean, score: number | undefined) =>
          <div className={`pb-trn-tslot ${win ? 'win' : m.revealed ? 'out' : ''}`}>{img ? <img src={img} alt="" draggable={false} /> : <u />}<em>{name}</em><b>{m.revealed ? score : ''}</b>{win && <Crown size={10} aria-label="pasa" />}</div>;
        return <div className="pb-trn-tmatch" key={m.id}>{slot(m.a, m.aPortrait, aw, m.scoreA)}{slot(m.b, m.bPortrait, bw, m.scoreB)}
          {m.revealed && <button type="button" className="pb-trn-tplay" disabled={!!watching} onClick={() => onWatch(m.id)} aria-label={`Ver combate ${m.a} contra ${m.b}`}>{watching === m.id ? <Loader2 className="pb-trn-spin" size={11} /> : <Play size={11} />}</button>}</div>;
      })}</div>
    </div>)}
  </div>;
}

export function TournamentScreen({ fighters, onWatch }: Props) {
  const [state, setState] = useState<TournamentState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [pick, setPick] = useState(fighters[0]?.id || '');
  const [insta, setInsta] = useState('');
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [changing, setChanging] = useState(false);
  const [tactics, setTactics] = useState<CpuTactics | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [watching, setWatching] = useState('');
  const [bracketRound, setBracketRound] = useState(0);
  const [bracketOf, setBracketOf] = useState<'current' | 'previous'>('current');
  const [bracket, setBracket] = useState<{ total: number; matches: BracketMatch[]; offset: number } | null>(null);
  const [tree, setTree] = useState<{ id: string; rounds: { total: number; matches: BracketMatch[] }[] } | null>(null);
  const dirty = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchTournamentState();
      if (!alive.current) return;
      setOffset(new Date(next.now).getTime() - Date.now());
      setState(next); setError('');
      if (!dirty.current && next.me) setTactics(next.me.tactics);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el torneo.'); }
    finally { if (alive.current) setLoading(false); }
  }, []);

  const t = state?.tournament || null;
  const soon = useMemo(() => {
    if (!t) return false;
    if (t.status === 'simulating') return true;
    const target = t.status === 'registration' ? t.registrationClosesAt : t.roundCutoff;
    return !!target && new Date(target).getTime() - (Date.now() + offset) < 60_000;
  }, [t, offset, state]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, soon ? 4000 : 15000);
    return () => clearInterval(id);
  }, [refresh, soon]);

  // Tácticas: se guardan solas tras un instante sin tocar; el servidor las congela en el corte de la ronda.
  useEffect(() => {
    if (!dirty.current || !tactics) return;
    setSaveState('dirty');
    const id = window.setTimeout(async () => {
      setSaveState('saving');
      try { await saveTournamentTactics(tactics); dirty.current = false; if (alive.current) setSaveState('saved'); }
      catch { await new Promise(r => setTimeout(r, 1300)); try { await saveTournamentTactics(tactics); dirty.current = false; if (alive.current) setSaveState('saved'); } catch { if (alive.current) setSaveState('error'); } }
    }, 1300);
    return () => clearTimeout(id);
  }, [tactics]);
  const editTactics = (next: CpuTactics) => { dirty.current = true; setTactics(next); };

  const join = async () => {
    if (!pick || joining) return;
    setJoining(true); setError('');
    try { await joinTournament(pick, insta.trim(), consent && !!insta.trim()); setChanging(false); dirty.current = false; await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo inscribir.'); }
    finally { setJoining(false); }
  };
  const watch = async (matchId: string) => {
    if (watching) return;
    setWatching(matchId); setError('');
    try {
      const d = await fetchTournamentMatch(matchId);
      if (!REPLAYABLE_SIM_VERSIONS.includes(d.simVersion)) throw new Error('Este combate se jugó con una versión anterior del motor y no se puede recrear con esta versión del juego. El resultado es válido.');
      const [p1, p2] = await Promise.all([toFighterProfile(d.a), toFighterProfile(d.b)]);
      onWatch({ p1, p2, stage: d.stage, difficulty: d.difficulty, tactics: { p1: d.tacticsA, p2: d.tacticsB }, simVersion: d.simVersion, roundsToWin: d.roundsToWin ?? 2 });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el combate.'); }
    finally { setWatching(''); }
  };
  // Cuadro del torneo en pantalla o, si ya se abrió otro, el del anterior (terminado) para revisar sus combates.
  const prev = state?.previous && t && t.status !== 'finished' ? state.previous : null;
  const bt = bracketOf === 'previous' && prev ? prev : t;
  const pickBracket = (which: 'current' | 'previous') => {
    setBracketOf(which); setBracket(null); setBracketRound(0);
    const target = which === 'previous' ? prev : t;
    if (target && target.revealedRound > 0) void loadBracket(target.revealedRound, 0, { id: target.id, of: which });
  };
  const loadBracket = async (round: number, off = 0, forced?: { id: string; of: 'current' | 'previous' }) => {
    const target = forced || (bt ? { id: bt.id, of: bracketOf } : null);
    if (!target) return;
    try {
      const r = await fetchTournamentBracket(target.id, round, off);
      try { sessionStorage.setItem(BRACKET_KEY, JSON.stringify({ of: target.of, round })); } catch { /* sin almacenamiento: no se recuerda el cuadro */ } setBracketRound(round); setBracket({ total: r.total, matches: r.matches, offset: off }); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el cuadro.'); }
  };

  // Al volver de ver un combate se recupera el cuadro que se estaba mirando (incluido el del torneo anterior).
  // Si el torneo en pantalla ya terminó, se abre directamente su última ronda.
  const restored = useRef(false);
  useEffect(() => {
    if (!state || restored.current) return;
    restored.current = true;
    let saved: { of?: string; round?: number } = {};
    try { saved = JSON.parse(sessionStorage.getItem(BRACKET_KEY) || '{}') as typeof saved; } catch { saved = {}; }
    const wantPrev = saved.of === 'previous' && !!prev && prev.revealedRound > 0;
    const target = wantPrev ? prev : (state.tournament && state.tournament.revealedRound > 0 && (state.tournament.status === 'finished' || saved.of === 'current') ? state.tournament : null);
    if (!target) return;
    const round = Math.min(Math.max(1, saved.round || target.revealedRound), target.revealedRound);
    const of = wantPrev ? 'previous' : 'current';
    setBracketOf(of);
    void loadBracket(round, 0, { id: target.id, of }).then(() => { if (saved.of) document.getElementById('pb-trn-bracket')?.scrollIntoView({ block: 'start' }); });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuadro completo (todas las rondas destapadas en columnas) cuando el torneo es pequeño; si no, queda la lista por rondas.
  const treeKey = bt ? `${bt.id}:${bt.revealedRound}` : '';
  useEffect(() => {
    if (!bt || bt.revealedRound < 1) { setTree(null); return; }
    let live = true; const id = bt.id;
    void Promise.all(Array.from({ length: bt.revealedRound }, (_, i) => fetchTournamentBracket(id, i + 1, 0)))
      .then(rs => { if (live) setTree(rs[0] && rs[0].total <= 32 ? { id, rounds: rs.map(r => ({ total: r.total, matches: r.matches })) } : null); })
      .catch(() => { if (live) setTree(null); });
    return () => { live = false; };
  }, [treeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="pb-subpage pb-trn-page"><section className="pb-frame pb-trn-card pb-trn-center"><Loader2 className="pb-trn-spin" size={26} /><p>CARGANDO TORNEO…</p><small>Si el servidor estaba dormido puede tardar unos 30 s.</small></section></div>;

  const me = state?.me || null;
  const alivePlayer = me && me.entry.status !== 'eliminated';
  const status = t?.status;
  const registered = !!me;
  const picking = status === 'registration' && (!registered || changing);

  return <div className="pb-subpage pb-trn-page">
    <div className="pb-trn-scroll">
      <div className="pb-panel-title"><span>TORNEO POR RONDAS</span><h2>{t ? `TORNEO #${t.id.slice(0, 4).toUpperCase()}` : 'TORNEO'}</h2></div>
      {t?.kind === 'exhibition' && <div className="pb-trn-exhibit" role="note"><b>EXHIBICIÓN AUTOMÁTICA</b><span>{t.label || 'Copias de luchadores públicos con tácticas por defecto.'} Nadie se ha inscrito ni ha elegido tácticas, y no cuenta para ranking ni historial.</span></div>}
      {error && <div className="pb-trn-error" role="alert">{error}<button type="button" onClick={() => { setError(''); void refresh(); }}>REINTENTAR</button></div>}

      {state?.previous?.champion && <div className="pb-trn-champ-strip"><Crown size={15} /> {state.previous.kind === 'exhibition' ? 'CAMPEÓN DE LA EXHIBICIÓN' : 'CAMPEÓN ANTERIOR'}: <b>{state.previous.champion.name}</b>
        {prev && prev.revealedRound > 0 && <button type="button" className="pb-mini-button" onClick={() => { pickBracket('previous'); window.setTimeout(() => document.getElementById('pb-trn-bracket')?.scrollIntoView({ block: 'start' }), 400); }}>VER CUADRO</button>}</div>}

      {!t && <section className="pb-frame pb-trn-card pb-trn-center"><Trophy size={30} /><p>NO HAY TORNEO ABIERTO</p><small>Cuando termine uno, el siguiente se abre solo. Vuelve más tarde.</small></section>}

      {t && status === 'registration' && <>
        <section className="pb-frame pb-trn-card">
          <Countdown to={t.registrationClosesAt} offset={offset} label={t.extended ? 'INSCRIPCIÓN AMPLIADA · CIERRA EN' : 'CIERRA LA INSCRIPCIÓN EN'} />
          <div className="pb-trn-row"><Users size={15} /><b>{t.entrantCount}</b> INSCRITOS · SIN LÍMITE DE PLAZAS</div>
          <small className="pb-trn-note">Ves a tu rival y sus ataques cuando se cierre; sus tácticas, solo después de la pelea. Tus tácticas se pueden cambiar hasta el final de cada cuenta atrás: se congela la versión guardada en ese instante y cuenta para esa ronda.</small>
        </section>
        {registered && !changing && me && <>
          <FighterCard f={me.entry} title="INSCRITO" hint="Se guarda una copia ahora. Puedes cambiar de luchador hasta que cierre la inscripción; entonces queda congelado y lo que cambies en tu colección no afecta al torneo." />
          <button type="button" className="pb-mini-button pb-trn-link" onClick={() => setChanging(true)}>CAMBIAR DE LUCHADOR</button>
        </>}
        {picking && <section className="pb-frame pb-trn-card" aria-label="Elegir luchador">
          <div className="pb-trn-row"><Swords size={15} /> ELIGE TU LUCHADOR (UNO POR CUENTA)</div>
          {fighters.length === 0 ? <small className="pb-trn-note">Crea un luchador para inscribirte.</small> :
            <div className="pb-trn-pick">{fighters.map(f => <button type="button" key={f.id} aria-pressed={pick === f.id} className={pick === f.id ? 'is-selected' : ''} onClick={() => setPick(f.id)}>
              <img src={f.portraitDataUrl} alt="" draggable={false} /><span>{f.fighterName}</span>{pick === f.id && <i><Check size={11} /></i>}</button>)}</div>}
          <small className="pb-trn-note">El torneo usa la versión BASE del luchador (sin forma Ultimate). Se guarda al inscribirte; puedes volver a elegir hasta el cierre de inscripción.</small>
          <label className="pb-trn-field">INSTAGRAM (OPCIONAL)<input value={insta} maxLength={31} inputMode="text" autoCapitalize="none" autoCorrect="off" placeholder="@tuusuario" onChange={e => setInsta(e.target.value)} /></label>
          {insta.trim() && <label className="pb-trn-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Acepto salir en el vídeo del torneo con mi @</label>}
          <div className="pb-trn-actions">
            <button type="button" className="pb-arcade-button pb-gold" disabled={!pick || joining} onClick={() => void join()}>{joining ? <Loader2 className="pb-trn-spin" size={17} /> : <Trophy size={17} />} {registered ? 'GUARDAR CAMBIO' : 'INSCRIBIRME'}</button>
            {changing && <button type="button" className="pb-mini-button" onClick={() => setChanging(false)}>CANCELAR</button>}
          </div>
        </section>}
      </>}

      {t && (status === 'round_open' || status === 'simulating') && <>
        <section className="pb-frame pb-trn-card">
          <div className="pb-trn-round">RONDA <b>{t.roundNo}</b> / {t.roundCount} · {state?.progress?.alive ?? '?'} VIVOS</div>
          {status === 'round_open' ? <Countdown to={t.roundCutoff} offset={offset} label="CORTE DE LA RONDA EN" />
            : <div className="pb-trn-count"><Loader2 className="pb-trn-spin" size={15} /><small>RESOLVIENDO LA RONDA</small><b>{state?.progress ? `${state.progress.resolved}/${state.progress.total}` : ''}</b></div>}
          {alivePlayer && state?.myMatch && <small className="pb-trn-note">{status === 'round_open' ? 'Las tácticas se congelan al llegar a cero. Lo que cambies después cuenta para la siguiente ronda.' : 'Tus tácticas de esta ronda ya están congeladas. Lo que cambies ahora cuenta para la siguiente.'}</small>}
        </section>
        {alivePlayer && state?.myMatch?.opponent && <FighterCard f={state.myMatch.opponent} title="TU RIVAL" hint="Sus tácticas se ven al terminar la pelea." />}
        {alivePlayer && !state?.myMatch && <section className="pb-frame pb-trn-card pb-trn-center"><Check size={24} /><p>{t.roundNo === 1 ? 'PASAS DIRECTO LA RONDA PREVIA' : 'ESPERANDO A TU RIVAL'}</p><small>Sigue en el torneo. Cuando se resuelva la ronda verás con quién te toca.</small></section>}
        {me && me.entry.status === 'eliminated' && <section className="pb-frame pb-trn-card pb-trn-center"><Trophy size={24} /><p>ELIMINADO EN LA RONDA {me.entry.eliminatedRound}</p><small>Puedes seguir viendo tus combates y el cuadro. El siguiente torneo se abre al terminar la final.</small></section>}
        {!me && <section className="pb-frame pb-trn-card pb-trn-center"><Users size={24} /><p>TORNEO EN MARCHA</p><small>La inscripción ya cerró. Puedes mirar el cuadro; el siguiente torneo se abre al acabar la final.</small></section>}
        {alivePlayer && me && tactics && <>
          <CpuTacticsPanel label="TUS TÁCTICAS" name={me.entry.name} portrait={me.entry.portraitUrl} archetype={me.entry.fighter.archetype} tactics={tactics} onChange={editTactics} />
          <div className={`pb-trn-save is-${saveState}`} role="status">{saveState === 'saving' ? 'GUARDANDO…' : saveState === 'saved' ? 'GUARDADO' : saveState === 'error' ? 'NO SE PUDO GUARDAR · TOCA UN CONTROL PARA REINTENTAR' : saveState === 'dirty' ? 'SIN GUARDAR…' : 'TÁCTICAS SINCRONIZADAS'}</div>
        </>}
      </>}

      {t && status === 'finished' && <section className="pb-frame pb-trn-card pb-trn-center"><Crown size={30} /><p>CAMPEÓN: {state?.champion?.name}</p><small>El torneo ha terminado. Abre el cuadro y pulsa ▶ en cualquier combate para volver a verlo.</small></section>}
      {bt && bt.status === 'finished' && <TournamentVideoPanel tournamentId={bt.id} />}

      {state && state.history.length > 0 && me && <section className="pb-frame pb-trn-card" aria-label="Tus combates">
        <div className="pb-trn-row"><Play size={15} /> TUS COMBATES</div>
        <ul className="pb-trn-history">{state.history.map(m => { const r = resultOf(m, me.entry.id); return <li key={m.id} className={r.won ? 'is-win' : 'is-loss'}>
          <span>R{m.round}</span><b>{r.won ? 'VICTORIA' : 'DERROTA'} {r.text}</b><em>VS {m.opponent?.name || '?'}</em>
          <button type="button" className="pb-mini-button" disabled={!!watching} onClick={() => void watch(m.id)}>{watching === m.id ? <Loader2 className="pb-trn-spin" size={13} /> : <Play size={13} />} VER</button></li>; })}</ul>
        {state.history.some(m => m.decidedBy === 'cap') && <small className="pb-trn-note">Un combate se cerró por el desempate del torneo (mucho tiempo sin KO). Su recreación puede variar al final.</small>}
      </section>}

      {bt && bt.revealedRound > 0 && <section className="pb-frame pb-trn-card" id="pb-trn-bracket" aria-label="Cuadro">
        {prev && <div className="pb-trn-rounds pb-trn-tabs" role="group" aria-label="Torneo del cuadro">
          <button type="button" aria-pressed={bracketOf === 'current'} className={bracketOf === 'current' ? 'is-selected' : ''} onClick={() => pickBracket('current')}>ACTUAL</button>
          <button type="button" aria-pressed={bracketOf === 'previous'} className={bracketOf === 'previous' ? 'is-selected' : ''} onClick={() => pickBracket('previous')}>ANTERIOR</button></div>}
        {tree && tree.id === bt.id && <BracketTree rounds={tree.rounds} total={bt.roundCount || tree.rounds.length} watching={watching} onWatch={id => void watch(id)} />}
        {!(tree && tree.id === bt.id) && <>
        <div className="pb-trn-row"><Trophy size={15} /> CUADRO · RONDA
          <div className="pb-trn-rounds">{Array.from({ length: bt.revealedRound }, (_, i) => i + 1).map(r => <button type="button" key={r} aria-pressed={bracketRound === r} className={bracketRound === r ? 'is-selected' : ''} onClick={() => void loadBracket(r)}>{r}</button>)}</div></div>
        {bracket && <>
          <ul className="pb-trn-bracket">{bracket.matches.map(m => { const aw = m.winnerEntryId === m.entryA, bw = m.winnerEntryId === m.entryB; return <li key={m.id}>
            <span className={`pb-trn-slot ${aw ? 'win' : m.revealed ? 'out' : ''}`}>{m.aPortrait && <img src={m.aPortrait} alt="" draggable={false} />}<em>{m.a}</em>{aw && <Crown size={11} aria-label="pasa" />}</span>
            <i>{m.scoreA}-{m.scoreB}</i>
            <span className={`pb-trn-slot ${bw ? 'win' : m.revealed ? 'out' : ''}`}>{m.bPortrait && <img src={m.bPortrait} alt="" draggable={false} />}<em>{m.b}</em>{bw && <Crown size={11} aria-label="pasa" />}</span>
            {m.revealed && <button type="button" className="pb-mini-button" disabled={!!watching} onClick={() => void watch(m.id)} aria-label={`Ver combate ${m.a} contra ${m.b}`}>{watching === m.id ? <Loader2 className="pb-trn-spin" size={13} /> : <Play size={13} />}</button>}</li>; })}</ul>
          {bracket.total > 40 && <div className="pb-pagination"><button type="button" disabled={bracket.offset === 0} onClick={() => void loadBracket(bracketRound, Math.max(0, bracket.offset - 40))} aria-label="Anterior"><ChevronLeft size={16} /></button>
            <span>{bracket.offset + 1}-{Math.min(bracket.total, bracket.offset + 40)} / {bracket.total}</span>
            <button type="button" disabled={bracket.offset + 40 >= bracket.total} onClick={() => void loadBracket(bracketRound, bracket.offset + 40)} aria-label="Siguiente"><ChevronRight size={16} /></button></div>}
        </>}
        </>}
      </section>}
    </div>
  </div>;
}
