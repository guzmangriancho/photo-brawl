const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), vm = require('node:vm');
const tactics = require('./helpers/cpuTactics.cjs');
let rnd = () => 0.5;
const M = Object.create(Math); M.random = () => rnd();
function loadEngine() {
  const file = path.join(__dirname, '../src/engine/FightEngine.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const soundFX = new Proxy({ muted: true }, { get: (t, p) => p === 'muted' ? t.muted : () => {} });
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, Math: M, Date, console,
    require: id => id.includes('cpuTactics') ? tactics : id.includes('SoundFX') ? { soundFX } : id.includes('SpriteProcessor') ? { loadImage: async () => null } : id.includes('stages') ? { STAGE_ART: {}, getLargeArena: () => undefined } : null });
  return mod.exports.FightEngine;
}
const FightEngine = loadEngine();
const moveset = { lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'LONG_ROUNDHOUSE' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: 'SLIDE_LOW_KICK', visualAction: '' }, specialUp: { name: 'S', mechanic: 'INVINCIBLE_UPPERCUT', visualAction: '' }, ultimateSuper: { name: 'O', mechanic: 'GIANT_BEAM_LASER', visualAction: '' } };
const prof = n => ({ id: n, fighterName: n, archetype: 'SHOTO_BALANCED', stats: { hp: 25, power: 25, technique: 25, speed: 25 }, moveset, passiveTrait: 'DOUBLE_JUMP', portraitDataUrl: '', spriteSheetDataUrl: '' });
function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function run(seed, tac, frames = 3000) {
  rnd = seeded(seed);
  const e = new FightEngine(prof('a'), prof('b'), 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', tac); e.announceTimer = 0;
  const slots = {}; let d = 0, n = 0;
  for (let i = 0; i < frames; i++) {
    e.step();
    if (e.p1.state === 'ATTACK' && e.p1.stateFrame === 1) { const k = e.p1.currentAttack && e.p1.currentAttack.slot; slots[k] = (slots[k] || 0) + 1; }
    if (!e.roundOver) { d += Math.abs(e.p1.x - e.p2.x); n++; }
  }
  return { slots, dist: d / n };
}
test('normalizing keeps the close mix at 100 and clamps values', () => {
  const t = tactics.normalizeCpuTactics({ closeLight: 300, closeHeavy: 0, closeTech: 100, distance: -9 });
  assert.equal(Math.round(t.closeLight + t.closeHeavy + t.closeTech), 100);
  assert.equal(t.distance, 0);
  const moved = tactics.setCloseMix(tactics.DEFAULT_CPU_TACTICS, 'closeHeavy', 70);
  assert.equal(moved.closeLight + moved.closeHeavy + moved.closeTech, 100);
  assert.equal(moved.closeHeavy, 70);
});
test('close attack mix steers which normal the CPU chooses', () => {
  const total = (mix) => { const out = {}; for (let s = 1; s <= 8; s++) { const r = run(s, { p1: { distance: 0, ...mix } }); for (const k in r.slots) out[k] = (out[k] || 0) + r.slots[k]; } return out; };
  const jab = total({ closeLight: 90, closeHeavy: 5, closeTech: 5 }), heavy = total({ closeLight: 5, closeHeavy: 90, closeTech: 5 });
  assert.ok((jab.LIGHT || 0) > 3 * (heavy.LIGHT || 0), 'jab-heavy mix throws many more jabs');
  assert.ok((heavy.HEAVY || 0) > 1.5 * (jab.HEAVY || 0), 'heavy mix throws many more heavies');
});
test('each side follows its own distance tactic', () => {
  let near = 0, far = 0;
  for (let s = 1; s <= 8; s++) { near += run(s, { p1: { distance: 0 }, p2: { distance: 100 } }).dist; far += run(s, { p1: { distance: 100 }, p2: { distance: 0 } }).dist; }
  assert.ok(near < far, 'a near-fighting P1 closes distance more than a far-keeping P1');
});
test('default tactics reproduce the classic AI exactly (same seed, same result)', () => {
  const a = run(7, undefined), b = run(7, { p1: tactics.DEFAULT_CPU_TACTICS, p2: tactics.DEFAULT_CPU_TACTICS });
  assert.deepEqual(a, b);
});
