import type { FighterDesignSchema, FighterProfile } from '../types/fighter';

/** Visual prestige only: identical ruleset and a competitive budget of 100 points. */
export const ULTIMATE_CUPS = 1000;
export const ULTIMATE_WINS = 15;

export function ultimateUnlocked(progress:{best_trophies:number;wins:number}|null|undefined):boolean{
  return Boolean(progress && (progress.best_trophies>=ULTIMATE_CUPS || progress.wins>=ULTIMATE_WINS));
}
export function ultimateBaseJson(base:FighterProfile):FighterDesignSchema {
  const {fighterName,subtitle,archetype,stats,passiveTrait,traitDescription,moveset,visualDescriptionForSprite,animationDirection}=base;
  return {fighterName,subtitle,archetype,stats,passiveTrait,traitDescription,moveset,visualDescriptionForSprite,animationDirection};
}
export function buildUltimateBrief(base:FighterProfile):string {
  return `PHOTO BRAWL — ULTIMATE / DESPERTAR, EVOLUCIÓN 16-BIT.
Adjunta el RETRATO BASE. Conserva el rostro, pelo, silueta, paleta emblemática y tipo de combate del personaje.
Devuelve SOLO JSON sin Markdown, con EXACTAMENTE las mismas claves y estructura que BASE FIGHTER JSON.
Crea una evolución visual memorable con ojos brillantes, aura de píxeles opacos, vestimenta evolucionada y ataques con estética de jefe arcade. Nombres y subtítulos en español, descripciones visuales en inglés.
REGLAS COMPETITIVAS OBLIGATORIAS: exactamente 100 puntos (NO 105); cada stat entero 15..35. Puedes redistribuirlos. Conserva EXACTAMENTE archetype y passiveTrait, los seis valores mecánicos (lightNormal.style, heavyNormal.style, specialNeutral.mechanic, specialForward.mechanic, specialUp.mechanic, ultimateSuper.mechanic) y la strikingLimb de light y heavy cuando esté definida. Puedes evolucionar fighterName (máximo 16 caracteres), subtitle, nombres de técnicas, color del proyectil, visualAction, traitDescription y animationDirection visual. No inventes efectos jugables: cambia la apariencia, no el daño ni las ventanas de invulnerabilidad. Mantén el sprite mirando a la derecha.
BASE FIGHTER JSON:
${JSON.stringify(ultimateBaseJson(base),null,2)}`;
}
export function buildUltimatePortraitPrompt(base:FighterProfile,design:FighterDesignSchema):string {
  return `PHOTO BRAWL — AWAKENED PORTRAIT. Attach BASE CHARACTER PORTRAIT as the identity reference. Create ONE square 512x512 chest-up portrait, not a sheet. Character ${design.fighterName}, ${design.subtitle}. Keep the exact face, hairstyle and recognizable outfit from ${base.fighterName}, evolved with: ${design.visualDescriptionForSprite}. Premium Neo Geo / 16-bit arcade pixel art; crisp opaque pixel clusters, glowing eyes, dramatic hard-edged highlights in ${design.moveset.specialNeutral.primaryHex} and gold. Dark crimson-cosmic arcade background. Face upper 65%, enough headroom. NO words, badges, borders, logos, watermarks, other people.`;
}
export function buildUltimateSheetPrompt(base:FighterProfile,design:FighterDesignSchema):string {
  const d=design.animationDirection;
  const last=['STRAIGHT_FIREBALL','ARCING_LOB_OBJECT','BOOMERANG_RETURN','TRAP_MINE_DROP'].includes(design.moveset.specialNeutral.mechanic)?'ONLY isolated evolved projectile, NO person':'fallen KO pose of the evolved fighter';
  return `PHOTO BRAWL — AWAKENED SPRITE SHEET 4x4. Attach BOTH BASE 4x4 SPRITE SHEET (for original scale, anatomy and foot baseline) AND the NEW ULTIMATE PORTRAIT (for colors and face). One square 1024x1024 file: 16 cells 256x256, row-major order. NO gutters, grids, text, shadows on the floor, borders or padding. Every cell background must be perfectly flat RGB #00FF00. Aura/fire sparks must be OPAQUE dark-outlined hard pixel clusters, never semitransparent green-contaminated glow. Match base fighter size and foot position; all full-body poses FACE SCREEN RIGHT. 16-bit SNK arcade pixel art, crisp clusters, no blurred scaling.
CHARACTER ${design.fighterName}: ${design.visualDescriptionForSprite}
MOVES ${JSON.stringify(design.moveset)}
CELL 0: Awakened idle guard: ${d?.stanceStyle||'imposing guard with compact aura'}.
CELL 1: second adjacent idle breath frame; same feet.
CELL 2: walk A, LEFT leg forward.
CELL 3: walk B, RIGHT leg forward, alternate arms.
CELL 4: jump in air, knees bent.
CELL 5: guard with pixel shield.
CELL 6: light WINDUP with ${d?.light.strikingLimb||'the base striking limb'}: ${d?.light.windupAction||design.moveset.lightNormal.name}.
CELL 7: light IMPACT: ${d?.light.activeAction||'same limb as frame 6'}; exact same striking limb!
CELL 8: heavy WINDUP with ${d?.heavy.strikingLimb||'base striking limb'}: ${d?.heavy.windupAction||design.moveset.heavyNormal.name}.
CELL 9: heavy IMPACT: ${d?.heavy.activeAction||'same limb as frame 8'}; exact same striking limb!
CELL 10: neutral special: ${design.moveset.specialNeutral.visualAction}.
CELL 11: forward special: ${design.moveset.specialForward.visualAction}.
CELL 12: upward special: ${design.moveset.specialUp.visualAction}.
CELL 13: ultimate super: ${design.moveset.ultimateSuper.visualAction}.
CELL 14: recoil/hurt.
CELL 15: ${last}; ${design.moveset.specialNeutral.primaryHex}.
FINAL CHECK: 2/3 opposite legs, 6→7 and 8→9 attacking limb continuity; hard opaque aura and FLAT #00FF00 background; exact frame order.`;
}

/** Do not silently normalize a 105-point AI JSON or permit a new gameplay mechanic. */
export function validateUltimateJson(base:FighterProfile,raw:unknown):FighterDesignSchema{
  const value=typeof raw==='string'?JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')):raw;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Pega un objeto JSON completo.');
  const v=value as Record<string,any>;
  const keys=['hp','speed','power','technique'] as const;
  if(!v.stats||keys.some(k=>!Number.isInteger(v.stats[k])||v.stats[k]<15||v.stats[k]>35)||keys.reduce((s,k)=>s+v.stats[k],0)!==100)
    throw new Error('Las estadísticas de la evolución deben sumar exactamente 100 (cada una 15–35).');
  if(v.archetype!==base.archetype||v.passiveTrait!==base.passiveTrait)
    throw new Error('La evolución debe conservar el arquetipo y la pasiva originales.');
  const slots=[['lightNormal','style'],['heavyNormal','style'],['specialNeutral','mechanic'],['specialForward','mechanic'],['specialUp','mechanic'],['ultimateSuper','mechanic']] as const;
  for(const [move,key] of slots){if(v.moveset?.[move]?.[key]!==(base.moveset[move] as unknown as Record<string,unknown>)[key])
    throw new Error(`La técnica ${move} debe conservar ${key}; cambia el efecto visual y el nombre, no la mecánica.`);}
  for(const move of ['light','heavy'] as const){
    const limb=base.animationDirection?.[move].strikingLimb;
    if(limb && v.animationDirection?.[move]?.strikingLimb!==limb)
      throw new Error(`La animación ${move} debe conservar el mismo miembro de ataque que el original.`);
  }
  // Reuse the game's own exhaustive enum/name/field validation without importing UI code.
  return parseUltimateDesign(value);
}

// Dynamic import is not necessary: the parser is pure and shared by the standard creator.
import {parseFighterDesignJson as parseUltimateDesign} from './geminiFighterGenerator';
