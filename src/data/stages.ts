import type { StageId } from '../types/fighter';

/** Gameplay geometry is in the engine's 960×540 world coordinates. */
export type ArenaPlatform = { id: string; x1: number; x2: number; y: number; type: 'one_way' };
export type LargeArena = { floorY: number; fighterScale: number; platforms: readonly ArenaPlatform[] };


/** Stable identifiers: older rooms and saved selections remain compatible. */
export const STAGE_ART: Record<StageId, { name: string; short: string; image: string }> = {
  SKI_RESORT: { name: 'ESTACIÓN DE ESQUÍ', short: 'NIEVE', image: '/backgrounds/snow.jpg' },
  NIGHT_PLAZA: { name: 'CALLEJÓN NEÓN', short: 'NEÓN', image: '/backgrounds/neon.jpg' },
  SUMMER_SUMMIT: { name: 'PLAYA TROPICAL', short: 'PLAYA', image: '/backgrounds/beach.jpg' },
  TEMPLE_SUNSET: { name: 'TEMPLO DEL ATARDECER', short: 'TEMPLO', image: '/backgrounds/asia.jpg' },
  INDUSTRIAL_ROOFTOP: { name: 'AZOTEA INDUSTRIAL', short: 'AZOTEA', image: '/backgrounds/rooftop.jpg' },
  SUNKEN_ATLANTIS: { name: 'ATLÁNTIDA SUMERGIDA', short: 'ATLÁNTIDA', image: '/backgrounds/atlantis.jpg' },
  SPIRIT_FOREST: { name: 'BOSQUE DE LOS ESPÍRITUS', short: 'BOSQUE', image: '/backgrounds/forest.jpg' },
  CELESTIAL_TEMPLE: { name: 'TEMPLO CELESTIAL', short: 'CELESTIAL', image: '/backgrounds/celestial.jpg' },
  VOLCANIC_FORTRESS: { name: 'FORTALEZA VOLCÁNICA', short: 'VOLCÁN', image: '/backgrounds/volcan.jpg' },
};
export const STAGE_IDS = Object.keys(STAGE_ART) as StageId[];
export const LARGE_ARENA_IDS: StageId[]=['SUNKEN_ATLANTIS','SPIRIT_FOREST','CELESTIAL_TEMPLE','VOLCANIC_FORTRESS'];

/**
 * V32 – hand-aligned collision planes for the four user-supplied panoramas.
 * Reference image: 2048×1143, fitted to the 960×540 canvas.
 * Platforms are pass-through on ascent, solid on descent. The main floor is
 * continuous and solid. Main floor aligned near the visual middle of its perspectival ground. Tweak using Training > COLISIONES.
 */
export const LARGE_ARENAS: Partial<Record<StageId, LargeArena>> = {
  SUNKEN_ATLANTIS: {
    floorY: 482, fighterScale: 0.64,
    platforms: [
      { id: 'LEFT_LOW', x1: 0, x2: 240, y: 325, type: 'one_way' },
      { id: 'LEFT_HIGH', x1: 189, x2: 385, y: 211, type: 'one_way' },
      { id: 'RIGHT_HIGH', x1: 577, x2: 771, y: 211, type: 'one_way' },
      { id: 'RIGHT_LOW', x1: 722, x2: 960, y: 328, type: 'one_way' },
    ],
  },
  SPIRIT_FOREST: {
    floorY: 488, fighterScale: 0.64,
    platforms: [
      { id: 'LEFT_BRANCH', x1: 0, x2: 352, y: 302, type: 'one_way' },
      { id: 'CENTER_BRANCH', x1: 351, x2: 610, y: 171, type: 'one_way' },
      { id: 'RIGHT_BRANCH', x1: 608, x2: 960, y: 303, type: 'one_way' },
    ],
  },
  CELESTIAL_TEMPLE: {
    floorY: 489, fighterScale: 0.64,
    platforms: [
      { id: 'LEFT_TERRACE', x1: 128, x2: 345, y: 329, type: 'one_way' },
      { id: 'CENTER_TERRACE', x1: 370, x2: 591, y: 202, type: 'one_way' },
      { id: 'RIGHT_TERRACE', x1: 613, x2: 833, y: 329, type: 'one_way' },
    ],
  },
  VOLCANIC_FORTRESS: {
    floorY: 478, fighterScale: 0.64,
    platforms: [
      { id: 'LEFT_BATTLEMENT', x1: 0, x2: 219, y: 214, type: 'one_way' },
      { id: 'CENTER_BRIDGE', x1: 290, x2: 669, y: 316, type: 'one_way' },
      { id: 'RIGHT_BATTLEMENT', x1: 743, x2: 960, y: 214, type: 'one_way' },
    ],
  },
};

export function getLargeArena(stage: StageId): LargeArena | undefined {
  return LARGE_ARENAS[stage];
}
