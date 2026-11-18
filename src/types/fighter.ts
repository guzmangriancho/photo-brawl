export type Archetype =
  | 'RUSHDOWN'
  | 'GRAPPLER_TANK'
  | 'ZONER_MAGE'
  | 'TRICKSTER'
  | 'SHOTO_BALANCED';

export type PassiveTrait =
  | 'DOUBLE_JUMP'
  | 'AIR_DASH'
  | 'HEAVY_ARMOR_STARTUP'
  | 'FAST_METER_GAIN'
  | 'LONG_REACH_LIMBS'
  | 'VAMPIRIC_ON_SPECIAL';

export type LightNormalStyle = 'FAST_JAB' | 'LOW_KICK' | 'QUICK_PALM';

export type HeavyNormalStyle =
  | 'OVERHEAD_SMASH'
  | 'SWEEP_TRIP'
  | 'LONG_ROUNDHOUSE'
  | 'LAUNCHER_UPPER';

export type SpecialNeutralMechanic =
  | 'STRAIGHT_FIREBALL'
  | 'ARCING_LOB_OBJECT'
  | 'GROUND_SHOCKWAVE'
  | 'BOOMERANG_RETURN'
  | 'TRAP_MINE_DROP'
  | 'SHORT_SHOTGUN_BLAST';

export type SpecialForwardMechanic =
  | 'ARMORED_SHOULDER_DASH'
  | 'TELEPORT_BEHIND'
  | 'COMMAND_GRAB_SLAM'
  | 'SLIDE_LOW_KICK'
  | 'SPINNING_ADVANCE';

export type SpecialUpMechanic =
  | 'INVINCIBLE_UPPERCUT'
  | 'DIVE_KICK_FROM_AIR'
  | 'VERTICAL_TORNADO'
  | 'HIGH_LEAP_STOMP';

export type UltimateSuperMechanic =
  | 'GIANT_BEAM_LASER'
  | 'MULTI_HIT_RUSH_COMBO'
  | 'METEOR_SCREEN_DROP'
  | 'OMEGA_SUPLEX';

export interface FighterStats {
  hp: number;        // 15..35 (15 = 850 HP, 35 = 1300 HP)
  speed: number;     // 15..35
  power: number;     // 15..35
  technique: number; // 15..35
}

export interface FighterMoveset {
  lightNormal: {
    name: string;
    style: LightNormalStyle;
  };
  heavyNormal: {
    name: string;
    style: HeavyNormalStyle;
  };
  specialNeutral: {
    name: string;
    mechanic: SpecialNeutralMechanic;
    visualAction: string;
    primaryHex: string;
  };
  specialForward: {
    name: string;
    mechanic: SpecialForwardMechanic;
    visualAction: string;
  };
  specialUp: {
    name: string;
    mechanic: SpecialUpMechanic;
    visualAction: string;
  };
  ultimateSuper: {
    name: string;
    mechanic: UltimateSuperMechanic;
    visualAction: string;
  };
}

export interface AttackAnimationDirection {
  attackType: 'PUNCH' | 'KICK' | 'ELBOW' | 'KNEE' | 'SWEEP' | 'HEADBUTT' | 'SHOULDER' | 'OTHER';
  strikingLimb: 'LEFT_FIST' | 'RIGHT_FIST' | 'LEFT_FOOT' | 'RIGHT_FOOT' | 'LEFT_ELBOW' | 'RIGHT_ELBOW' | 'LEFT_KNEE' | 'RIGHT_KNEE' | 'TORSO' | 'BOTH_HANDS';
  windupAction: string;
  activeAction: string;
}

export interface FighterAnimationDirection {
  stanceStyle: string;
  light: AttackAnimationDirection;
  heavy: AttackAnimationDirection;
}

export interface FighterDesignSchema {
  fighterName: string;
  subtitle: string;
  archetype: Archetype;
  stats: FighterStats;
  passiveTrait: PassiveTrait;
  traitDescription: string;
  moveset: FighterMoveset;
  visualDescriptionForSprite: string;
  /** Coherent two-frame strike choreography; optional for legacy custom fighters. */
  animationDirection?: FighterAnimationDirection;
}

export interface FighterProfile extends FighterDesignSchema {
  id: string;
  isPreset?: boolean;
  createdAt: number;
  /** Last local display-name edit; used to sync renames without overwriting newer cloud names. */
  nameUpdatedAt?: number;
  /** Last artwork revision; lets cloud restore distinguish new art from an ID collision. */
  artUpdatedAt?: number;
  spriteSheetDataUrl: string; // 1024x1024 processed PNG with transparent background and foot-grounded 4x4 grid
  portraitDataUrl: string;    // 512x512 PNG
  /** New character sheets use 16 cells with windup/impact pairs and a contextual final slot. */
  spriteSheetLayoutVersion?: 2;
  /** Version 3 also removes strong residual green halos around opaque silhouettes. */
  spriteSheetKeyVersion?: 2 | 3;
  spriteSheetLastCell?: 'PROJECTILE' | 'KO';
  scaleMultiplier?: number;   // e.g. 1.15 for heavy tanks, 0.96 for nimble rushdown
}

export type StageId = 'SKI_RESORT' | 'NIGHT_PLAZA' | 'SUMMER_SUMMIT' | 'TEMPLE_SUNSET' | 'INDUSTRIAL_ROOFTOP' | 'SUNKEN_ATLANTIS' | 'SPIRIT_FOREST' | 'CELESTIAL_TEMPLE' | 'VOLCANIC_FORTRESS';
export type GameMode = '1P_VS_CPU' | '1P_VS_2P' | 'CPU_VS_CPU' | 'TRAINING' | 'ONLINE' | '2V2' | 'FREE_FOR_ALL';
export type GroupBattleMode = '2V2' | 'FREE_FOR_ALL';
export type CpuDifficulty = 'EASY' | 'NORMAL' | 'HARD';

/**
 * Sprite Sheet 4x4 cell indices (each 256x256 in a 1024x1024 image):
 * 0 (0,0): Idle frame 1
 * 1 (0,1): Idle frame 2
 * 2 (0,2): Walk 1
 * 3 (0,3): Walk 2
 * 4 (1,0): Jump / Air
 * 5 (1,1): Block / Parry
 * 6 (1,2): Light Attack
 * 7 (1,3): Heavy Attack
 * 8 (2,0): Special Neutral
 * 9 (2,1): Special Forward
 * 10 (2,2): Special Up
 * 11 (2,3): Ultimate Super Pose
 * 12 (3,0): Hurt / Recoil
 * 13 (3,1): Knocked Down / KO
 * 14 (3,2): Victory Pose
 * 15 (3,3): Custom Projectile Sprite
 *
 * This is the LEGACY layout (presets and older custom fighters).
 * V9 generated profiles with spriteSheetLayoutVersion === 2 use:
 * 0..5 idle/walk/jump/block; 6-7 light windup-impact;
 * 8-9 heavy windup-impact; 10 neutral, 11 forward, 12 upward,
 * 13 super, 14 hurt, and 15 isolated projectile OR KO.
 * The engine selects the matching mapping at runtime.
 */
export type SpriteCellIndex =
  | 0 | 1 | 2 | 3
  | 4 | 5 | 6 | 7
  | 8 | 9 | 10 | 11
  | 12 | 13 | 14 | 15;
