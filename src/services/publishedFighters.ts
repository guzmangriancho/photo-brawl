/** Community fighters remain read-only; selecting one for a friendly match does
 * not import it into the player's collection or claim ownership. */
import type { FighterProfile } from '../types/fighter';
import { cloudEntry, fighterPublicUrl, listCommunity, saveFighterCloud } from './communityService';
import type { CommunityFighter } from './communityService';

export type PublishedFighterCard = {
  id: string;
  name: string;
  author: string;
  portraitUrl: string;
  entry: CommunityFighter;
};
export const COMMUNITY_PAGE_SIZE = 6;

export async function searchPublishedFighters(query: string, page: number): Promise<PublishedFighterCard[]> {
  // Ask for one extra row to know if there is another page without a count query.
  const items = await listCommunity(query, page, COMMUNITY_PAGE_SIZE);
  return items.filter(item => Boolean(item.public_portrait_path && item.public_sheet_path))
    .map(item => ({ id: item.id, name: item.fighter_name,
      author: item.player_profiles?.username || 'COMUNIDAD',
      portraitUrl: fighterPublicUrl(item.public_portrait_path), entry: item }));
}

function readPublicImage(url: string): Promise<string> {
  // Public storage paths only; never load private paths or service-role credentials.
  return fetch(url, { mode: 'cors' }).then(async response => {
    if (!response.ok) throw new Error('No se pudo descargar la imagen pública.');
    const blob = await response.blob();
    if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 3_100_000)
      throw new Error('La imagen pública no tiene un formato admitido.');
    return new Promise<string>((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen pública.'));
      reader.readAsDataURL(blob);
    });
  });
}
export async function loadPublishedFighter(entry: CommunityFighter): Promise<FighterProfile> {
  if (!entry.public_portrait_path || !entry.public_sheet_path)
    throw new Error('El luchador no tiene sus imágenes públicas disponibles.');
  const [portraitDataUrl,spriteSheetDataUrl] = await Promise.all([
    readPublicImage(fighterPublicUrl(entry.public_portrait_path)),
    readPublicImage(fighterPublicUrl(entry.public_sheet_path)),
  ]);
  return {
    ...entry.fighter_data,
    // A canonical community key can never masquerade as an owned local ID in ranked.
    id: `community_${entry.id}`,
    fighterName: entry.fighter_name,
    isPreset: false,
    portraitDataUrl,
    spriteSheetDataUrl,
  };
}

/** Ranked players must have an own fighter registered under their verified
 * Supabase account. Automatically back up a new own fighter privately. */
export async function ensureRankedOwnFighter(fighter: FighterProfile): Promise<void> {
  if(fighter.id.startsWith('community_')||fighter.isPreset)
    throw new Error('En clasificatorias solo puedes usar tus propios luchadores.');
  if(!await cloudEntry(fighter.id))await saveFighterCloud(fighter);
}
