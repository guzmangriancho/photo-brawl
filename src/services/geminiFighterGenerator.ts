import { FighterDesignSchema, FighterProfile } from '../types/fighter';
import { processPortrait, processSpriteSheet, resizePhotoForGemini } from '../engine/SpriteProcessor';
import { buildAnalysisPrompt, buildPortraitPrompt, buildSpritePrompt, needsProjectileSprite } from './fighterPrompts';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const FIGHTER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fighterName: { type: 'STRING', description: 'Short uppercase arcade name, max 16 chars' },
    subtitle: { type: 'STRING', description: 'Catchy Spanish arcade title, max 24 chars' },
    archetype: {
      type: 'STRING',
      enum: ['RUSHDOWN', 'GRAPPLER_TANK', 'ZONER_MAGE', 'TRICKSTER', 'SHOTO_BALANCED'],
    },
    stats: {
      type: 'OBJECT',
      properties: {
        hp: { type: 'INTEGER', description: '15 to 35' },
        speed: { type: 'INTEGER', description: '15 to 35' },
        power: { type: 'INTEGER', description: '15 to 35' },
        technique: { type: 'INTEGER', description: '15 to 35' },
      },
      required: ['hp', 'speed', 'power', 'technique'],
    },
    passiveTrait: {
      type: 'STRING',
      enum: [
        'DOUBLE_JUMP',
        'AIR_DASH',
        'HEAVY_ARMOR_STARTUP',
        'FAST_METER_GAIN',
        'LONG_REACH_LIMBS',
        'VAMPIRIC_ON_SPECIAL',
      ],
    },
    traitDescription: {
      type: 'STRING',
      description: 'Short explanation in Spanish of how the passive trait works in battle.',
    },
    moveset: {
      type: 'OBJECT',
      properties: {
        lightNormal: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            style: { type: 'STRING', enum: ['FAST_JAB', 'LOW_KICK', 'QUICK_PALM'] },
          },
          required: ['name', 'style'],
        },
        heavyNormal: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            style: {
              type: 'STRING',
              enum: ['OVERHEAD_SMASH', 'SWEEP_TRIP', 'LONG_ROUNDHOUSE', 'LAUNCHER_UPPER'],
            },
          },
          required: ['name', 'style'],
        },
        specialNeutral: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            mechanic: {
              type: 'STRING',
              enum: [
                'STRAIGHT_FIREBALL',
                'ARCING_LOB_OBJECT',
                'GROUND_SHOCKWAVE',
                'BOOMERANG_RETURN',
                'TRAP_MINE_DROP',
                'SHORT_SHOTGUN_BLAST',
              ],
            },
            visualAction: {
              type: 'STRING',
              description: 'English visual description of projectile inspired by the photo',
            },
            primaryHex: { type: 'STRING', description: 'Hex color like #FF3355' },
          },
          required: ['name', 'mechanic', 'visualAction', 'primaryHex'],
        },
        specialForward: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            mechanic: {
              type: 'STRING',
              enum: [
                'ARMORED_SHOULDER_DASH',
                'TELEPORT_BEHIND',
                'COMMAND_GRAB_SLAM',
                'SLIDE_LOW_KICK',
                'SPINNING_ADVANCE',
              ],
            },
            visualAction: { type: 'STRING' },
          },
          required: ['name', 'mechanic', 'visualAction'],
        },
        specialUp: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            mechanic: {
              type: 'STRING',
              enum: [
                'INVINCIBLE_UPPERCUT',
                'DIVE_KICK_FROM_AIR',
                'VERTICAL_TORNADO',
                'HIGH_LEAP_STOMP',
              ],
            },
            visualAction: { type: 'STRING' },
          },
          required: ['name', 'mechanic', 'visualAction'],
        },
        ultimateSuper: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            mechanic: {
              type: 'STRING',
              enum: [
                'GIANT_BEAM_LASER',
                'MULTI_HIT_RUSH_COMBO',
                'METEOR_SCREEN_DROP',
                'OMEGA_SUPLEX',
              ],
            },
            visualAction: { type: 'STRING' },
          },
          required: ['name', 'mechanic', 'visualAction'],
        },
      },
      required: [
        'lightNormal',
        'heavyNormal',
        'specialNeutral',
        'specialForward',
        'specialUp',
        'ultimateSuper',
      ],
    },
    animationDirection: {
      type: 'OBJECT',
      properties: {
        stanceStyle: { type: 'STRING' },
        light: { type: 'OBJECT', properties: {
          attackType: { type: 'STRING', enum: ['PUNCH','KICK','ELBOW','KNEE','SWEEP','HEADBUTT','SHOULDER','OTHER'] },
          strikingLimb: { type: 'STRING', enum: ['LEFT_FIST','RIGHT_FIST','LEFT_FOOT','RIGHT_FOOT','LEFT_ELBOW','RIGHT_ELBOW','LEFT_KNEE','RIGHT_KNEE','TORSO','BOTH_HANDS'] },
          windupAction: { type: 'STRING' }, activeAction: { type: 'STRING' },
        }, required: ['attackType','strikingLimb','windupAction','activeAction'] },
        heavy: { type: 'OBJECT', properties: {
          attackType: { type: 'STRING', enum: ['PUNCH','KICK','ELBOW','KNEE','SWEEP','HEADBUTT','SHOULDER','OTHER'] },
          strikingLimb: { type: 'STRING', enum: ['LEFT_FIST','RIGHT_FIST','LEFT_FOOT','RIGHT_FOOT','LEFT_ELBOW','RIGHT_ELBOW','LEFT_KNEE','RIGHT_KNEE','TORSO','BOTH_HANDS'] },
          windupAction: { type: 'STRING' }, activeAction: { type: 'STRING' },
        }, required: ['attackType','strikingLimb','windupAction','activeAction'] },
      }, required: ['stanceStyle','light','heavy']
    },
    visualDescriptionForSprite: {
      type: 'STRING',
      description:
        'Detailed English description of face, hair, beard/glasses, exact clothes, colors, accessories, and shoes from the photo for 16-bit pixel art sprite generation.',
    },
  },
  required: [
    'fighterName',
    'subtitle',
    'archetype',
    'stats',
    'passiveTrait',
    'traitDescription',
    'moveset',
    'visualDescriptionForSprite',
    'animationDirection',
  ],
};


const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-3.1-flash-image';
export interface CreatorPhoto { base64: string; mimeType: string; previewUrl: string }
export const prepareCreatorPhoto = (file: File): Promise<CreatorPhoto> => resizePhotoForGemini(file, 768);

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: falta un objeto JSON válido.`);
  return value as Record<string, unknown>;
}
function ensureText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: falta texto.`);
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${label}: valor no reconocido (${String(value)}).`);
  return value as T;
}
function normalizeStats(raw: Record<string, unknown>): FighterDesignSchema['stats'] {
  const keys = ['hp','speed','power','technique'] as const;
  const stats = { hp: 25, speed: 25, power: 25, technique: 25 };
  keys.forEach(key => {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw new Error(`stats.${key}: número no válido.`);
    stats[key] = Math.min(35, Math.max(15, Math.round(raw[key] as number)));
  });
  let sum = keys.reduce((a, k) => a + stats[k], 0);
  // Adjust the least disruptive attribute values until all 4 add to 100.
  for (let i = 0; sum !== 100 && i < 120; i++) {
    const key = keys[i % 4];
    if (sum < 100 && stats[key] < 35) { stats[key]++; sum++; }
    if (sum > 100 && stats[key] > 15) { stats[key]--; sum--; }
  }
  return stats;
}

/** Validator shared by Gemini and the copy-paste JSON fallback. Rejects unknown combat mechanics. */
export function parseFighterDesignJson(input: unknown, nameHint?: string): FighterDesignSchema {
  let raw: unknown = input;
  if (typeof input === 'string') {
    const cleaned = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { raw = JSON.parse(cleaned); } catch { throw new Error('JSON inválido. Copia el análisis completo, sin texto alrededor.'); }
  }
  const d = ensureObject(raw, 'Análisis');
  const m = ensureObject(d.moveset, 'moveset');
  const l = ensureObject(m.lightNormal, 'lightNormal');
  const h = ensureObject(m.heavyNormal, 'heavyNormal');
  const n = ensureObject(m.specialNeutral, 'specialNeutral');
  const fw = ensureObject(m.specialForward, 'specialForward');
  const up = ensureObject(m.specialUp, 'specialUp');
  const su = ensureObject(m.ultimateSuper, 'ultimateSuper');
  const design: FighterDesignSchema = {
    fighterName: (nameHint?.trim() || ensureText(d.fighterName, 'fighterName')).toUpperCase().slice(0, 16),
    subtitle: ensureText(d.subtitle, 'subtitle').toUpperCase().slice(0, 32),
    archetype: choice(d.archetype, ['RUSHDOWN','GRAPPLER_TANK','ZONER_MAGE','TRICKSTER','SHOTO_BALANCED'] as const, 'archetype'),
    stats: normalizeStats(ensureObject(d.stats, 'stats')),
    passiveTrait: choice(d.passiveTrait, ['DOUBLE_JUMP','AIR_DASH','HEAVY_ARMOR_STARTUP','FAST_METER_GAIN','LONG_REACH_LIMBS','VAMPIRIC_ON_SPECIAL'] as const, 'passiveTrait'),
    traitDescription: ensureText(d.traitDescription, 'traitDescription').slice(0, 280),
    visualDescriptionForSprite: ensureText(d.visualDescriptionForSprite, 'visualDescriptionForSprite').slice(0, 1500),
    moveset: {
      lightNormal: { name: ensureText(l.name, 'lightNormal.name').slice(0, 42), style: choice(l.style, ['FAST_JAB','LOW_KICK','QUICK_PALM'] as const, 'lightNormal.style') },
      heavyNormal: { name: ensureText(h.name, 'heavyNormal.name').slice(0, 42), style: choice(h.style, ['OVERHEAD_SMASH','SWEEP_TRIP','LONG_ROUNDHOUSE','LAUNCHER_UPPER'] as const, 'heavyNormal.style') },
      specialNeutral: { name: ensureText(n.name, 'specialNeutral.name').slice(0, 42), mechanic: choice(n.mechanic, ['STRAIGHT_FIREBALL','ARCING_LOB_OBJECT','GROUND_SHOCKWAVE','BOOMERANG_RETURN','TRAP_MINE_DROP','SHORT_SHOTGUN_BLAST'] as const, 'specialNeutral.mechanic'), visualAction: ensureText(n.visualAction, 'specialNeutral.visualAction').slice(0, 350), primaryHex: /^#[0-9a-f]{6}$/i.test(String(n.primaryHex)) ? String(n.primaryHex) : '#38bdf8' },
      specialForward: { name: ensureText(fw.name, 'specialForward.name').slice(0, 42), mechanic: choice(fw.mechanic, ['ARMORED_SHOULDER_DASH','TELEPORT_BEHIND','COMMAND_GRAB_SLAM','SLIDE_LOW_KICK','SPINNING_ADVANCE'] as const, 'specialForward.mechanic'), visualAction: ensureText(fw.visualAction, 'specialForward.visualAction').slice(0, 350) },
      specialUp: { name: ensureText(up.name, 'specialUp.name').slice(0, 42), mechanic: choice(up.mechanic, ['INVINCIBLE_UPPERCUT','DIVE_KICK_FROM_AIR','VERTICAL_TORNADO','HIGH_LEAP_STOMP'] as const, 'specialUp.mechanic'), visualAction: ensureText(up.visualAction, 'specialUp.visualAction').slice(0, 350) },
      ultimateSuper: { name: ensureText(su.name, 'ultimateSuper.name').slice(0, 42), mechanic: choice(su.mechanic, ['GIANT_BEAM_LASER','MULTI_HIT_RUSH_COMBO','METEOR_SCREEN_DROP','OMEGA_SUPLEX'] as const, 'ultimateSuper.mechanic'), visualAction: ensureText(su.visualAction, 'ultimateSuper.visualAction').slice(0, 350) },
    },
  };
  if (d.animationDirection) {
    const anim = ensureObject(d.animationDirection, 'animationDirection');
    function strike(key: 'light'|'heavy') {
      const a = ensureObject(anim[key], `animationDirection.${key}`);
      return { attackType: choice(a.attackType, ['PUNCH','KICK','ELBOW','KNEE','SWEEP','HEADBUTT','SHOULDER','OTHER'] as const, 'attackType'), strikingLimb: choice(a.strikingLimb, ['LEFT_FIST','RIGHT_FIST','LEFT_FOOT','RIGHT_FOOT','LEFT_ELBOW','RIGHT_ELBOW','LEFT_KNEE','RIGHT_KNEE','TORSO','BOTH_HANDS'] as const, 'strikingLimb'), windupAction: ensureText(a.windupAction, 'windupAction').slice(0, 400), activeAction: ensureText(a.activeAction, 'activeAction').slice(0, 400) };
    }
    design.animationDirection = { stanceStyle: ensureText(anim.stanceStyle, 'stanceStyle').slice(0, 280), light: strike('light'), heavy: strike('heavy') };
  }
  return design;
}

function geminiError(status: number, message: string): Error {
  let msg = message;
  try { msg = JSON.parse(message)?.error?.message || message; } catch { /* plain text */ }
  const detail = String(msg).replace(/AIza[\w-]+/g, '[clave oculta]').slice(0, 220);
  if (status === 400 || status === 403 || status === 401) return new Error(`Gemini (${status}): comprueba tu clave, modelo y permisos. ${detail}`);
  if (status === 429) return new Error('Gemini ha alcanzado tu cuota (429). Puedes copiar el prompt y generar el recurso manualmente.');
  return new Error(`Gemini (${status}): ${detail}. Puedes usar el prompt manual.`);
}

async function requestGemini(apiKey: string, model: string, body: unknown): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('No se pudo conectar a Gemini. Comprueba tu conexión y restricciones de la API Key; también puedes usar el modo manual.'); }
  if (!response.ok) throw geminiError(response.status, await response.text());
  return response.json();
}

/** Run only the first step so the rest of the assets can be retried separately. */
export async function analyzeCreatorPhoto(apiKey: string, photo: CreatorPhoto, nameHint?: string): Promise<FighterDesignSchema> {
  const result = await requestGemini(apiKey, TEXT_MODEL, {
    contents: [{ role: 'user', parts: [{ text: buildAnalysisPrompt(nameHint) }, { inlineData: { mimeType: photo.mimeType, data: photo.base64 } }] }],
    generationConfig: { temperature: 0.8, responseMimeType: 'application/json', responseSchema: FIGHTER_RESPONSE_SCHEMA },
  });
  const text = result?.candidates?.[0]?.content?.parts?.map((p: {text?:string}) => p.text || '').join('');
  if (!text) throw new Error('Gemini no devolvió el JSON de diseño. Puedes pegarlo manualmente.');
  return parseFighterDesignJson(text, nameHint);
}

async function renderImage(apiKey: string, photo: CreatorPhoto, prompt: string): Promise<string> {
  const data = await requestGemini(apiKey, IMAGE_MODEL, {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: photo.mimeType, data: photo.base64 } }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  });
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const part = parts.find((item: any) => !!item?.inlineData?.data);
  if (!part) throw new Error('El modelo no ha devuelto una imagen. Usa el prompt manual o vuelve a intentar.');
  return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
}
export async function generateCreatorSheet(apiKey: string, photo: CreatorPhoto, design: FighterDesignSchema): Promise<string> {
  const raw = await renderImage(apiKey, photo, buildSpritePrompt(design));
  return processSpriteSheet(raw, needsProjectileSprite(design.moveset.specialNeutral.mechanic) ? 'PROJECTILE' : 'KO');
}
export async function generateCreatorPortrait(apiKey: string, photo: CreatorPhoto, design: FighterDesignSchema): Promise<string> {
  const raw = await renderImage(apiKey, photo, buildPortraitPrompt(design));
  return processPortrait(raw);
}

export function buildCreatedProfile(design: FighterDesignSchema, spriteSheetDataUrl: string, portraitDataUrl: string): FighterProfile {
  if (!spriteSheetDataUrl || !portraitDataUrl) throw new Error('Debes añadir el spritesheet y el retrato.');
  return { ...design, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, isPreset: false, createdAt: Date.now(), spriteSheetDataUrl, portraitDataUrl, spriteSheetKeyVersion: 3,
    spriteSheetLayoutVersion: 2,
    spriteSheetLastCell: needsProjectileSprite(design.moveset.specialNeutral.mechanic) ? 'PROJECTILE' : 'KO',
    scaleMultiplier: design.archetype === 'GRAPPLER_TANK' ? 1.14 : design.archetype === 'RUSHDOWN' ? 0.96 : 1,
  };
}

// Backwards-compatible standalone pipeline for integrations still using the V8 signature.
export async function createFighterFromPhoto(apiKey: string, file: File, hint: string|undefined, onProgress: (s:string)=>void): Promise<FighterProfile> {
  onProgress('Preparando foto…'); const photo = await prepareCreatorPhoto(file);
  onProgress('Analizando personaje…'); const design = await analyzeCreatorPhoto(apiKey, photo, hint);
  onProgress('Generando spritesheet y retrato…');
  const [sheet, portrait] = await Promise.all([generateCreatorSheet(apiKey, photo, design), generateCreatorPortrait(apiKey, photo, design)]);
  return buildCreatedProfile(design, sheet, portrait);
}
