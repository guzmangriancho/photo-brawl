import type { FighterProfile, StageId } from '../types/fighter';
import type { EngineSnapshot, InputState, MoveSlot, FighterState } from '../engine/FightEngine';

export const ONLINE_PROTOCOL = 1;
export type PlayerRole = 'host' | 'guest';
export type RoomStatus = 'waiting' | 'playing' | 'interrupted' | 'finished';
export interface RoomView {
  code: string;
  role: PlayerRole;
  status: RoomStatus;
  host: { name: string; ready: boolean; connected: boolean };
  guest: { name: string; ready: boolean; connected: boolean } | null;
  stage: StageId;
}
export interface NetworkFighter {
  x: number; y: number; vx: number; vy: number; facing: 1 | -1;
  hp: number; maxHp: number; meter: number; state: FighterState; stateFrame: number;
  hitstunFrames: number; blockstunFrames: number; invincibleFrames: number;
  lightChainCount: number; comboCount: number; comboDamage: number; comboTimer: number;
  jumpsRemaining: number; airDashUsed: boolean; hasArmorActive: boolean;
  currentAttack: Record<string, unknown> | null;
  grabbedBy: 0 | 1 | null; grabSlamTimer: number;
}
export interface NetworkState {
  frame: number;
  snapshot: EngineSnapshot;
  p1: NetworkFighter;
  p2: NetworkFighter;
  projectiles: object[];
  particles: object[];
  callouts: object[];
  afterimages: object[];
  shockwaves: object[];
  meteors: object[];
  crossSlashes: object[];
  superFlashFrames: number; superFlashOwner: 0 | 1;
  hitstopFrames: number; shakeIntensity: number;
  announceTimer: number; roundTimerFrames: number;
}
export type ControlKey = keyof InputState;
export const CONTROL_KEYS: ControlKey[] = [
  'left','right','up','down','light','heavy','spNeutral','spForward','spUp',
  'superBtn','romanCancel','dashLeft','dashRight',
];
export type RemoteAction = { kind: 'move'; slot: MoveSlot } | { kind: 'jump' } | { kind: 'dash'; dir: -1 | 1 };
export interface OnlineStart {
  role: PlayerRole;
  code: string;
  p1: FighterProfile;
  p2: FighterProfile;
  stage: StageId;
}
export interface OnlineIncoming {
  type: string;
  [key: string]: unknown;
}
export function packControls(input: InputState): number {
  let value = 0;
  CONTROL_KEYS.forEach((key, i) => { if (input[key]) value |= (1 << i); });
  return value;
}
export function unpackControls(value: number): InputState {
  const result = {} as InputState;
  CONTROL_KEYS.forEach((key, i) => { result[key] = Boolean(value & (1 << i)); });
  return result;
}
