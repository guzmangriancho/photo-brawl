import { getLang } from '../i18n';
import type { FighterDesignSchema, SpecialNeutralMechanic, AttackAnimationDirection } from '../types/fighter';

const PROJECTILE_MECHANICS: SpecialNeutralMechanic[] = [
  'STRAIGHT_FIREBALL', 'ARCING_LOB_OBJECT', 'BOOMERANG_RETURN', 'TRAP_MINE_DROP',
];
export function needsProjectileSprite(mechanic: SpecialNeutralMechanic): boolean {
  return PROJECTILE_MECHANICS.includes(mechanic);
}

export function buildAnalysisPrompt(name?: string): string {
  const LANG = getLang() === 'en' ? 'ENGLISH' : 'SPANISH';
  return `PHOTO BRAWL — DESIGN BRIEF (attach the ORIGINAL PHOTO to this prompt).
You are a professional fighting-game character designer, animator, and balance designer. Build a distinctive, playable 2D 16-bit arcade fighter inspired by visible details in the attached photo, not a generic character. Describe ONLY visible facial features, hairstyle, clothing, colors and accessories; do not infer sensitive characteristics, identity or personality from the photo. Turn motifs of the outfit or visible objects into a fun fictional combat theme.
Return ONLY a complete JSON object, no Markdown, satisfying the following EXACT CURRENT GAME DATA FORMAT (not the legacy 4-move format):
{
 "fighterName":"MAX 16 CHARS", "subtitle":"SHORT ${LANG} SUBTITLE", "archetype":"RUSHDOWN|GRAPPLER_TANK|ZONER_MAGE|TRICKSTER|SHOTO_BALANCED",
 "stats":{"hp":25,"speed":25,"power":25,"technique":25},
 "passiveTrait":"DOUBLE_JUMP|AIR_DASH|HEAVY_ARMOR_STARTUP|FAST_METER_GAIN|LONG_REACH_LIMBS|VAMPIRIC_ON_SPECIAL",
 "traitDescription":"${LANG} explanation of chosen passive gameplay effect",
 "moveset":{
   "lightNormal":{"name":"${LANG} NAME","style":"FAST_JAB|LOW_KICK|QUICK_PALM"},
   "heavyNormal":{"name":"${LANG} NAME","style":"OVERHEAD_SMASH|SWEEP_TRIP|LONG_ROUNDHOUSE|LAUNCHER_UPPER"},
   "specialNeutral":{"name":"${LANG} NAME","mechanic":"STRAIGHT_FIREBALL|ARCING_LOB_OBJECT|GROUND_SHOCKWAVE|BOOMERANG_RETURN|TRAP_MINE_DROP|SHORT_SHOTGUN_BLAST","visualAction":"ENGLISH VISUAL DESCRIPTION","primaryHex":"#55EEFF"},
   "specialForward":{"name":"${LANG} NAME","mechanic":"ARMORED_SHOULDER_DASH|TELEPORT_BEHIND|COMMAND_GRAB_SLAM|SLIDE_LOW_KICK|SPINNING_ADVANCE","visualAction":"ENGLISH VISUAL DESCRIPTION"},
   "specialUp":{"name":"${LANG} NAME","mechanic":"INVINCIBLE_UPPERCUT|DIVE_KICK_FROM_AIR|VERTICAL_TORNADO|HIGH_LEAP_STOMP","visualAction":"ENGLISH VISUAL DESCRIPTION"},
   "ultimateSuper":{"name":"${LANG} NAME","mechanic":"GIANT_BEAM_LASER|MULTI_HIT_RUSH_COMBO|METEOR_SCREEN_DROP|OMEGA_SUPLEX","visualAction":"ENGLISH VISUAL DESCRIPTION"}
 },
 "visualDescriptionForSprite":"DETAILED ENGLISH visual description of photo's actual visible outfit, face and accessories",
 "animationDirection":{
  "stanceStyle":"ENGLISH description of distinctive fighting guard",
  "light":{"attackType":"PUNCH|KICK|ELBOW|KNEE|SWEEP|HEADBUTT|SHOULDER|OTHER", "strikingLimb":"LEFT_FIST|RIGHT_FIST|LEFT_FOOT|RIGHT_FOOT|LEFT_ELBOW|RIGHT_ELBOW|LEFT_KNEE|RIGHT_KNEE|TORSO|BOTH_HANDS", "windupAction":"ENGLISH pose with correct weighted support and chambered striking limb", "activeAction":"ENGLISH next frame extending EXACT SAME striking limb"},
  "heavy":{"attackType":"PUNCH|KICK|ELBOW|KNEE|SWEEP|HEADBUTT|SHOULDER|OTHER", "strikingLimb":"LEFT_FIST|RIGHT_FIST|LEFT_FOOT|RIGHT_FOOT|LEFT_ELBOW|RIGHT_ELBOW|LEFT_KNEE|RIGHT_KNEE|TORSO|BOTH_HANDS", "windupAction":"ENGLISH pose loading striking limb", "activeAction":"ENGLISH adjacent frame using EXACT SAME limb"}
 }
}
MANDATORY: each integer stat 15..35 AND sum EXACTLY 100. All six moves MUST be in current game's supported mechanics above, but their NAMES, visual themes and animations must be unique and fit the photograph. Choose exactly ONE passive: DOUBLE_JUMP must never be given to everyone. Balance the character for fun and counterplay (weakness as well as strength); no invincible everything. Choreograph light and heavy in TWO CONTINUOUS FRAMES each; do not load a punch then kick. Facing RIGHT. Spell names in Spanish, visual actions in English.
${name?.trim() ? `MANDATORY FIGHTER NAME: ${name.trim().toUpperCase().slice(0,16)}.` : 'Invent a fun, short original fighter name.'}`;
}

function strikeInstruction(a: AttackAnimationDirection | undefined, name: string, fallback: string): string {
  if (!a) return `${name}: ${fallback}. Make cell windup and cell impact a continuous matching attack.`;
  return `${name}: attackType=${a.attackType}, strikingLimb=${a.strikingLimb}. WINDUP: ${a.windupAction} IMPACT: ${a.activeAction} Same limb in both frames, anatomical continuity.`;
}

export function buildSpritePrompt(design: FighterDesignSchema): string {
  const projectile = needsProjectileSprite(design.moveset.specialNeutral.mechanic);
  const d = design.animationDirection;
  return `PHOTO BRAWL — GENERATE ONE SPRITE SHEET. Attach the SAME ORIGINAL PHOTO as reference. The finished image must be square, ideally EXACTLY 1024x1024, with a 4x4 layout: sixteen equal cells, left-to-right then top-to-bottom. Each cell 256x256. No borders, padding, gutters, labels, letters, watermark, or panels. Pure #00FF00 (RGB 0,255,0) solid flat background in ALL cells, absolutely no ground or shadows. This green is for automatic removal. No image-wide background artwork.
CHARACTER: same person visually as reference with exact observed outfit and accessories; ${design.visualDescriptionForSprite}. All full-body fighter poses face SCREEN RIGHT; consistent head, proportions, body scale, feet baseline and camera. Premium 16-bit arcade fighting sprite art, high-quality crisp pixel clusters (around 128px effective detail per cell), distinct readable anatomy, strong shadow clusters, consistent palette, NO blurry pixel upscaling.
MOVES: ${JSON.stringify(design.moveset)}.
CELL 0: idle fighting stance frame 1; ${d?.stanceStyle || 'guard pose matching fighter motif'}.
CELL 1: consecutive idle breath frame 2 with essentially unchanged foot placement.
CELL 2: walk cycle phase A, anatomical LEFT leg forward, RIGHT leg trailing, arms counter-swing.
CELL 3: walk cycle phase B, anatomical RIGHT leg forward, LEFT leg trailing, arms swapped. Different leading feet! 
CELL 4: airborne jump; bent knees, dynamic pose.
CELL 5: standing guard/block pose.
CELL 6: LIGHT ATTACK WINDUP. ${strikeInstruction(d?.light, design.moveset.lightNormal.name, design.moveset.lightNormal.style)}
CELL 7: LIGHT ATTACK IMPACT, immediate follow-up of cell 6, extend EXACT striking limb named above.
CELL 8: HEAVY ATTACK WINDUP. ${strikeInstruction(d?.heavy, design.moveset.heavyNormal.name, design.moveset.heavyNormal.style)}
CELL 9: HEAVY ATTACK IMPACT, immediate follow-up of cell 8, extend EXACT striking limb named above.
CELL 10: Neutral special pose: ${design.moveset.specialNeutral.visualAction} (${design.moveset.specialNeutral.mechanic}); charge/release visual, not a generic punch.
CELL 11: Forward special pose: ${design.moveset.specialForward.visualAction} (${design.moveset.specialForward.mechanic}); visibly distinct from cell 10.
CELL 12: Upward special pose: ${design.moveset.specialUp.visualAction} (${design.moveset.specialUp.mechanic}); lift/special angle visibly distinct.
CELL 13: Ultimate pose: ${design.moveset.ultimateSuper.visualAction} (${design.moveset.ultimateSuper.mechanic}); readable dramatic silhouette.
CELL 14: hurt recoil animation, stagger backwards, full-body.
CELL 15: ${projectile ? `ONLY the isolated projectile / object of ${design.moveset.specialNeutral.name}, ${design.moveset.specialNeutral.visualAction}, ${design.moveset.specialNeutral.primaryHex}. NO PERSON visible. Center projectile in last cell.` : 'KO pose, character lying flat on floor with closed eyes, same clothes and appearance. No projectile in this cell because fighter does not use an isolated projectile.'}
FINAL QUALITY CHECK: legs in walk 2/3 opposite; prep/impact 6→7 and 8→9 anatomically continuous with EXACT SAME attacking limbs; all 16 cells correct; choma green exactly #00FF00, no gradients, no text. Do NOT add additional frames or reorder cells.`;
}

export function buildPortraitPrompt(design: FighterDesignSchema): string {
 return `PHOTO BRAWL — generate a single SQUARE character-selection portrait, ideally 512x512. Attach the SAME ORIGINAL PHOTO as identity/outfit reference. Render chest-up of this fighter, not a sprite sheet. Character: ${design.fighterName}, ${design.subtitle}. Preserve ONLY actually visible face, hairstyle, facial hair, eyewear, top clothing and accessories accurately. Specific description: ${design.visualDescriptionForSprite}. Cohesive premium 16-bit arcade pixel-art portrait with crisp detailed pixel clusters, bold highlights and shadows, clean facial silhouette, vivid ${design.moveset.specialNeutral.primaryHex} accent lighting. Dark midnight blue cyber-arcade gradient background, subtle electric-blue gridded glow. Face occupies upper 65%, centered with enough headroom. No text, names, logos, frames, watermarks or extra people.`;
}
