import { getOnlineAccessToken } from './supabaseClient';
import type { FighterProfile, StageId, CpuDifficulty } from '../types/fighter';
import { normalizeCpuTactics, type CpuTactics } from '../engine/cpuTactics';

/** Retrato público de un luchador inscrito: datos de juego congelados + arte copiado al inscribirse. */
export interface TournamentFighter {
  id: string; name: string; instagram: string | null; status: 'active' | 'eliminated' | 'champion'; eliminatedRound: number | null;
  fighter: Omit<FighterProfile, 'spriteSheetDataUrl' | 'portraitDataUrl'>; portraitUrl: string; sheetUrl: string;
}
export interface TournamentInfo {
  id: string; kind?: 'real' | 'exhibition'; label?: string | null; status: 'registration' | 'round_open' | 'simulating' | 'finished' | 'cancelled'; stage: StageId; difficulty: CpuDifficulty;
  roundNo: number; roundCount: number | null; revealedRound: number; roundCutoff: string | null; registrationOpensAt: string;
  registrationClosesAt: string; extended: boolean; entrantCount: number; windowMinutes: number | null; schedule: string[] | null; finishedAt: string | null;
  champion?: TournamentFighter | null;
}
export interface TournamentMatchView {
  id: string; round: number; slot: number; revealed: boolean; youAre: 'a' | 'b'; opponent: TournamentFighter | null;
  winnerEntryId?: string; scoreA?: number; scoreB?: number; decidedBy?: 'ko' | 'cap'; entryA: string; entryB: string;
}
export interface TournamentState {
  now: string; tournament: TournamentInfo | null; previous: TournamentInfo | null;
  me: { entry: TournamentFighter; tactics: CpuTactics; tacticsUpdatedAt: string | null } | null;
  myMatch: TournamentMatchView | null; history: TournamentMatchView[];
  progress: { total: number; resolved: number; alive: number } | null; champion: TournamentFighter | null;
}
export interface TournamentReplay {
  id: string; round: number; stage: StageId; difficulty: CpuDifficulty; simVersion: number; engineVersion: string; roundsToWin?: number; seed: number;
  a: TournamentFighter; b: TournamentFighter; tacticsA: CpuTactics; tacticsB: CpuTactics;
  winner: 'a' | 'b'; scoreA: number; scoreB: number; decidedBy: 'ko' | 'cap'; frames: number;
}
export interface BracketMatch { id: string; round: number; slot: number; revealed: boolean; a?: string; b?: string; aPortrait?: string; bPortrait?: string; winnerEntryId?: string; entryA: string; entryB: string; scoreA?: number; scoreB?: number }

/** https://host desde wss://host/ws (el servidor online sirve también la API de torneos). */
function apiBase(): string {
  const configured = (import.meta.env.VITE_ONLINE_WS_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/^ws/i, 'http').replace(/\/ws\/?$/, '').replace(/\/+$/, '');
  if (location.protocol === 'https:') throw new Error('Servidor online sin configurar.');
  return `http://${location.host}`;
}
async function call<T>(path: string, init?: { method?: 'POST'; body?: unknown }): Promise<T> {
  const token = await getOnlineAccessToken();
  if (!token) throw new Error('Inicia sesión para ver el torneo.');
  let response: Response;
  try {
    response = await fetch(apiBase() + path, {
      method: init?.method || 'GET', headers: { Authorization: 'Bearer ' + token, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(45000),
    });
  } catch { throw new Error('No se pudo contactar con el servidor. Si estaba dormido, tarda hasta 30 s: reintenta.'); }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);
  return data as T;
}
export const fetchTournamentState = () => call<TournamentState>('/tournament/state');
export const joinTournament = (fighterLocalId: string, instagram: string, videoConsent: boolean) =>
  call<{ entryId: string }>('/tournament/join', { method: 'POST', body: { fighterLocalId, instagram, videoConsent } });
export const saveTournamentTactics = (tactics: CpuTactics) =>
  call<{ tactics: CpuTactics }>('/tournament/tactics', { method: 'POST', body: { tactics } });
/** Tu combate en directo: sin ganador ni marcador y SIN tácticas: el combate se pinta desde la traza de /tournament/live/trace. */
export interface TournamentLive {
  matchId: string; round: number; tournamentId: string; youAre: 'a' | 'b'; anchorMs: number; endsAtMs: number; frames: number;
  stage: StageId; difficulty: CpuDifficulty; simVersion: number; engineVersion: string; roundsToWin: number;
  a: TournamentFighter; b: TournamentFighter; hasTrace?: boolean;
}
/** Traza de reproducción: s = deltas de estado por fotograma, x = sonidos [frame, método, argumentos]. */
export interface LiveTrace { frames: number; states: Record<string, unknown>[]; sounds: [number, string, (number | string | boolean)[]][] }
export async function fetchLiveTrace(matchId: string): Promise<LiveTrace> {
  const r = await call<{ v: number; frames: number; s: Record<string, unknown>[]; x: LiveTrace['sounds'] }>('/tournament/live/trace?id=' + encodeURIComponent(matchId));
  const states: Record<string, unknown>[] = []; let cur: Record<string, unknown> = {};
  for (const d of r.s) { cur = { ...cur, ...d }; states.push(cur); }
  return { frames: r.frames, states, sounds: r.x };
}
export const fetchTournamentLive = () => call<{ now: string; live: TournamentLive | null }>('/tournament/live');
const LIVE_SEEN_KEY = 'pb_trn_live_seen';
/** Combates en directo ya vistos (o con el resultado ya pedido) en este dispositivo: quitan el velo de spoilers. */
export function liveSeen(matchId: string): boolean {
  try { return (JSON.parse(localStorage.getItem(LIVE_SEEN_KEY) || '[]') as string[]).includes(matchId); } catch { return false; }
}
export function markLiveSeen(matchId: string): void {
  try { const a = (JSON.parse(localStorage.getItem(LIVE_SEEN_KEY) || '[]') as string[]).filter(x => x !== matchId); a.push(matchId); localStorage.setItem(LIVE_SEEN_KEY, JSON.stringify(a.slice(-30))); } catch { /* sin almacenamiento: el velo cae solo al acabar la ventana */ }
}
export const fetchTournamentMatch = (id: string) => call<TournamentReplay>('/tournament/match?id=' + encodeURIComponent(id));
export const fetchTournamentBracket = (tournament: string, round: number, offset = 0) =>
  call<{ round: number; total: number; matches: BracketMatch[] }>(`/tournament/bracket?tournament=${tournament}&round=${round}&offset=${offset}`);

export interface TournamentVideoState { enabled: boolean; status?: 'none' | 'queued' | 'ready' | 'failed'; dayNo?: number; requestedAt?: string; url?: string }
/** Solo el propietario ve la función (enabled:false para el resto). La URL del vídeo es firmada y caduca en 5 min. */
export const fetchTournamentVideo = (tournament: string) => call<TournamentVideoState>('/tournament/video?tournament=' + encodeURIComponent(tournament));
export const requestTournamentVideo = (tournament: string, day: number, force = false) =>
  call<TournamentVideoState>('/tournament/video', { method: 'POST', body: { tournament, day, ...(force ? { force: true } : {}) } });

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Imagen no legible.')); r.readAsDataURL(blob); });
}
async function imageDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo cargar el arte de un luchador del torneo.');
  return blobToDataUrl(await r.blob());
}
/** Luchador congelado + su arte descargado: listo para el motor. */
export async function toFighterProfile(f: TournamentFighter): Promise<FighterProfile> {
  const [portraitDataUrl, spriteSheetDataUrl] = await Promise.all([imageDataUrl(f.portraitUrl), imageDataUrl(f.sheetUrl)]);
  return { ...(f.fighter as FighterProfile), id: 'tournament_' + f.id, fighterName: f.name, portraitDataUrl, spriteSheetDataUrl, isPreset: false };
}
export { normalizeCpuTactics };
