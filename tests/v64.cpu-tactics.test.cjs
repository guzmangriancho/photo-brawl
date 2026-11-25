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
test('each side follows its own distance tactic (mirror setups behave alike, not as one shared value)', () => {
  let a = 0, b = 0;
  for (let s = 1; s <= 8; s++) { a += run(s, { p1: { distance: 0 }, p2: { distance: 100 } }).dist; b += run(s, { p1: { distance: 100 }, p2: { distance: 0 } }).dist; }
  assert.ok(Math.abs(a - b) / ((a + b) / 2) < 0.25, 'swapping which side keeps range gives comparable fights');
});
test('default tactics reproduce the classic AI exactly (same seed, same result)', () => {
  const a = run(7, undefined), b = run(7, { p1: tactics.DEFAULT_CPU_TACTICS, p2: tactics.DEFAULT_CPU_TACTICS });
  assert.deepEqual(a, b);
});
test('medium and far technique controls steer the CPU away from only walking', () => {
  const tech = (mid, far) => { let n = 0; for (let s = 1; s <= 8; s++) { const r = run(s, { p1: { midTech: mid, farTech: far } }); n += (r.slots.SP_FORWARD || 0) + (r.slots.SP_NEUTRAL || 0); } return n; };
  assert.ok(tech(100, 100) > 1.3 * tech(0, 0), 'more technique attacks when both sliders are high');
});
test('attack mix only applies to styles that use it', () => {
  assert.equal(tactics.usesAttackMix('SHOTO_BALANCED'), true);
  assert.equal(tactics.usesAttackMix('ZONER_MAGE'), false);
  assert.equal(tactics.usesAttackMix('GRAPPLER_TANK'), false);
});
test('maximum distance actually keeps range against a stationary rival, for every archetype', () => {
  const still = (arch, d) => {
    let sum = 0, n = 0, close = 0;
    for (let s = 1; s <= 4; s++) {
      rnd = seeded(s);
      const p1 = { ...prof('a'), archetype: arch };
      const e = new FightEngine(p1, prof('b'), 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: { distance: d } }); e.announceTimer = 0;
      const orig = e.computeCpuInput.bind(e);
      e.computeCpuInput = (c, p) => { const i = orig(c, p); if (c.index === 1) for (const k of Object.keys(i)) i[k] = false; return i; };
      for (let f = 0; f < 1800 && !e.roundOver; f++) { e.step(); if (f < 200) continue; const g = Math.abs(e.p1.x - e.p2.x); sum += g; n++; if (g < 150) close++; }
    }
    return { avg: sum / n, close: close / n };
  };
  for (const arch of ['SHOTO_BALANCED', 'ZONER_MAGE', 'GRAPPLER_TANK']) {
    const far = still(arch, 100), mid = still(arch, 90), classic = still(arch, 50);
    assert.ok(far.avg > 300 && far.close < 0.02, arch + ': max distance holds a long range (avg ' + Math.round(far.avg) + ')');
    assert.ok(mid.avg > classic.avg + 60, arch + ': 75 keeps more range than 50');
    assert.ok(far.avg > mid.avg, arch + ': 100 keeps more range than 75');
  }
});
test('the panel explains what MEDIA does while keeping range and archetype limits', () => {
  const panel = fs.readFileSync(path.join(__dirname, '../src/components/CpuTacticsPanel.tsx'), 'utf8');
  assert.ok(panel.includes('AVANCE: SOLO AL ACERCARSE'), 'MEDIA slider explains its reduced weight');
  assert.ok(panel.includes('ESTILO PROPIO (tanque)') && panel.includes('ESTILO PROPIO (zoner)'), 'archetype limits are visible');
});
test('a range-keeper pinned against the wall fights instead of standing still', () => {
  for (const arch of ['SHOTO_BALANCED', 'GRAPPLER_TANK']) {
    let attacks = 0;
    for (let s = 1; s <= 4; s++) {
      rnd = seeded(s);
      const e = new FightEngine({ ...prof('a'), archetype: arch }, prof('b'), 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: { distance: 100 } }); e.announceTimer = 0;
      e.p1.x = 70; e.p2.x = 150;
      for (let f = 0; f < 150 && !e.roundOver; f++) { e.step(); if (e.p1.state === 'ATTACK' && e.p1.stateFrame === 1) attacks++; }
    }
    assert.ok(attacks > 0, arch + ': cornered keeper attacks');
  }
});
test('a range-keeper approaching from far away jumps in only when jump-in is high', () => {
  const jumps = (j) => {
    let n = 0;
    for (let s = 1; s <= 6; s++) {
      rnd = seeded(s);
      const e = new FightEngine(prof('a'), prof('b'), 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: { distance: 100, jumpIn: j } }); e.announceTimer = 0;
      e.p1.x = 70; e.p2.x = 890;
      const orig = e.computeCpuInput.bind(e);
      e.computeCpuInput = (c, p) => { const i = orig(c, p); if (c.index === 1) for (const k of Object.keys(i)) i[k] = false; return i; };
      let prev = false;
      for (let f = 0; f < 200; f++) { e.step(); const air = e.p1.state === 'JUMP'; if (air && !prev) n++; prev = air; }
    }
    return n;
  };
  assert.ok(jumps(100) > jumps(0), 'jump-in slider changes behaviour while approaching at max distance');
});
