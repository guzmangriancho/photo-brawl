import type { FighterProfile } from '../types/fighter';
import { normalizeCpuTactics, type CpuTactics } from './cpuTactics';

/**
 * Bump this number whenever a change to FightEngine, cpuTactics or the move data
 * can alter how a CPU vs CPU fight plays out. Saved "recipes" (fighters + tactics)
 * only recreate the same fight while this number and the fighters' gameplay data match.
 * tests/v65.reproducible-cpu-fights.test.cjs fails when the engine changes without a bump.
 */
export const SIM_VERSION = 3;
/** Versions whose fights replay identically with this engine when roundsToWin is 2 (e2 only adds the roundsToWin option; v3 balance changes are gated by FightEngine.simVersion, so older fights keep their old numbers). */
export const REPLAYABLE_SIM_VERSIONS = [1, 2, 3];
export const DEFAULT_ROUNDS_TO_WIN = 2;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).filter(k => obj[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(obj[k])).join(',') + '}';
}

export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Everything of a fighter that the engine reads to play the fight. Images and names are not included. */
export function fighterFingerprint(p: FighterProfile): string {
  const g = { archetype: p.archetype, stats: p.stats, moveset: p.moveset, passiveTrait: p.passiveTrait, scaleMultiplier: p.scaleMultiplier };
  return hash32(stable(g)).toString(16).padStart(8, '0');
}

export interface FightRecipe {
  v: number;
  p1: string; p2: string;
  stage: string; difficulty: string;
  tactics: { p1: CpuTactics; p2: CpuTactics };
  /** Only present when it is not the default 2, so every seed made before e2 stays the same. */
  rtw?: number;
}

export function fightRecipe(p1: FighterProfile, p2: FighterProfile, stage: string, difficulty: string,
  tactics?: { p1?: Partial<CpuTactics>; p2?: Partial<CpuTactics> }, opts?: { simVersion?: number; roundsToWin?: number }): FightRecipe {
  const rtw = opts?.roundsToWin;
  return { v: opts?.simVersion ?? SIM_VERSION, ...(rtw && rtw !== DEFAULT_ROUNDS_TO_WIN ? { rtw } : {}), p1: fighterFingerprint(p1), p2: fighterFingerprint(p2), stage, difficulty,
    tactics: { p1: normalizeCpuTactics(tactics?.p1), p2: normalizeCpuTactics(tactics?.p2) } };
}

/** The same matchup with the same tactics always gets the same seed, hence the same fight. */
export function cpuFightSeed(p1: FighterProfile, p2: FighterProfile, stage: string, difficulty: string,
  tactics?: { p1?: Partial<CpuTactics>; p2?: Partial<CpuTactics> }, opts?: { simVersion?: number; roundsToWin?: number }): number {
  return hash32(stable(fightRecipe(p1, p2, stage, difficulty, tactics, opts)));
}
