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

test('reproducir la traza con applyNetworkState deja el mismo estado visible que el combate real (vida, barras, posiciones, efectos)', () => {
  const { FightEngine } = sim.engine('e3');
  const norm = tactics.normalizeCpuTactics;
  const t = trace.record('e3', A, B, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
  const e = new FightEngine(A, B, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: norm({}), p2: norm({}) }, 1);
  let cur = {};
  const full = t.states.map(d => (cur = { ...cur, ...JSON.parse(JSON.stringify(d)) }));
  const ref = new FightEngine(A, B, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: norm(TA), p2: norm(TB) }, sim.fightSeed(3, A, B, 'SKI_RESORT', 'NORMAL', TA, TB, norm, 1));
  ref.roundsToWin = 1; ref.beginVersusIntro();
  let maxP = 0;
  for (let i = 1; i <= t.frames; i++) {
    ref.step();
    if (i % 97 && i !== t.frames) continue; // muestreo: cada 97 frames y el último
    e.applyNetworkState({ ...full[i - 1], frame: i });
    const x = ref.getSnapshot(), y = e.getSnapshot();
    assert.deepEqual(y, x, 'snapshot frame ' + i);
    assert.equal(e.p1.x, ref.p1.x); assert.equal(e.p2.y, ref.p2.y);
    maxP = Math.max(maxP, e.particles.length);
  }
  assert.equal(e.roundOver, true);
  assert.ok(maxP > 0, 'los efectos (partículas) llegan en la reproducción');
});
