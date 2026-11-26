const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const sim = require('../server/tournament/sim.cjs');
const trace = require('../server/tournament/trace.cjs');
const tactics = require('./helpers/cpuTactics.cjs');
const mv = { lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'LONG_ROUNDHOUSE' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: 'SLIDE_LOW_KICK', visualAction: '' }, specialUp: { name: 'S', mechanic: 'INVINCIBLE_UPPERCUT', visualAction: '' }, ultimateSuper: { name: 'O', mechanic: 'GIANT_BEAM_LASER', visualAction: '' } };
const prof = (n, archetype, hp) => ({ id: n, fighterName: n, archetype, stats: { hp, power: 25, technique: 25, speed: 25 }, moveset: mv, passiveTrait: 'DOUBLE_JUMP', portraitDataUrl: '', spriteSheetDataUrl: '' });
const A = prof('a', 'SHOTO_BALANCED', 25), B = prof('b', 'RUSHDOWN', 25);
const TA = { distance: 83, closeHeavy: 71 }, TB = { distance: 21, midTech: 64 };

test('la traza tiene los mismos frames que la simulación y graba sonidos', () => {
  const s = sim.simulate('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  const t = trace.record('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  assert.equal(t.frames, s.frames);
  assert.equal(t.states.length, s.frames);
  assert.ok(t.sounds.length > 0);
});
test('la traza no contiene tácticas ni semilla (ni sus valores)', () => {
  const t = trace.record('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  const text = zlib.gunzipSync(trace.encode(t)).toString();
  const seed = sim.fightSeed(3, A, B, 'SKI_RESORT', 'NORMAL', TA, TB, tactics.normalizeCpuTactics, 1);
  for (const w of ['tactic', 'seed', 'closeHeavy', 'midTech', 'distance']) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), w);
  assert.ok(!text.includes('"' + seed + '"') && !new RegExp('[:,\\[]' + seed + '[,\\]}]').test(text));
});
test('grabar no deja el soundFX del motor modificado', () => {
  const fx = require('../server/tournament/archive/e3/engine/SoundFX.js').soundFX;
  const before = Object.keys(fx).sort().join();
  trace.record('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  assert.equal(Object.keys(fx).sort().join(), before);
});
test('es determinista en física y sonidos (solo las partículas decorativas usan azar)', () => {
  const g = () => trace.record('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  const x = g(), y = g();
  const strip = t => t.states.map(d => { const { particles, ...r } = d; return r; });
  assert.deepEqual(strip(x), strip(y));
  assert.deepEqual(x.sounds, y.sounds);
});
