import type { StageId } from '../types/fighter';

/** Stable identifiers: older rooms and saved selections remain compatible. */
export const STAGE_ART: Record<StageId, { name: string; short: string; image: string }> = {
  SKI_RESORT: { name: 'ESTACIÓN DE ESQUÍ', short: 'NIEVE', image: '/backgrounds/snow.jpg' },
  NIGHT_PLAZA: { name: 'CALLEJÓN NEÓN', short: 'NEÓN', image: '/backgrounds/neon.jpg' },
  SUMMER_SUMMIT: { name: 'PLAYA TROPICAL', short: 'PLAYA', image: '/backgrounds/beach.jpg' },
  TEMPLE_SUNSET: { name: 'TEMPLO DEL ATARDECER', short: 'TEMPLO', image: '/backgrounds/asia.jpg' },
  INDUSTRIAL_ROOFTOP: { name: 'AZOTEA INDUSTRIAL', short: 'AZOTEA', image: '/backgrounds/rooftop.jpg' },
};
export const STAGE_IDS = Object.keys(STAGE_ART) as StageId[];
