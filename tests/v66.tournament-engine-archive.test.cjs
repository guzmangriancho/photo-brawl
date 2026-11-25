const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('typescript'), vm = require('node:vm');
const tactics = require('./helpers/cpuTactics.cjs');
const sim = require('../server/tournament/sim.cjs');
const root = path.join(__dirname, '..');

function walk(dir, base = dir, out = {}) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, base, out);
    else out[path.relative(base, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
  return out;
}
const seedMod = (() => {
  const file = path.join(root, 'src/engine/fightSeed.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, JSON, Object, String, Number, Array, Math, require: id => id.includes('cpuTactics') ? tactics : null });
  return mod.exports;
})();

const mv = { lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'LONG_ROUNDHOUSE' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: 'SLIDE_LOW_KICK', visualAction: '' }, specialUp: { name: 'S', mechanic: 'INVINCIBLE_UPPERCUT', visualAction: '' }, ultimateSuper: { name: 'O', mechanic: 'GIANT_BEAM_LASER', visualAction: '' } };
const prof = (n, archetype, hp) => ({ id: n, fighterName: n, archetype, stats: { hp, power: 25, technique: 25, speed: 25 }, moveset: mv, passiveTrait: 'DOUBLE_JUMP', portraitDataUrl: '', spriteSheetDataUrl: '' });
const A = prof('a', 'SHOTO_BALANCED', 25), B = prof('b', 'RUSHDOWN', 25);

test('the archived engine for the current SIM_VERSION exists and matches the live server runtime byte for byte', () => {
  const v = seedMod.SIM_VERSION;
  const dir = path.join(root, 'server/tournament/archive/e' + v);
  assert.ok(fs.existsSync(dir), `SIM_VERSION is ${v}: copy server/runtime to server/tournament/archive/e${v} (see archive/README.md)`);
  assert.ok(sim.ENGINES['e' + v], `register e${v} in server/tournament/sim.cjs`);
  assert.deepEqual(walk(dir), walk(path.join(root, 'server/runtime')), 'The live engine changed but its archive did not: bump SIM_VERSION and archive a new copy; never edit an archived one');
});
test('archived engines are loaded from the archive, never from server/runtime', () => {
  const { FightEngine } = sim.engine('e1');
  const live = require('../server/runtime/engine/FightEngine.js').FightEngine;
  assert.notEqual(FightEngine, live);
});
test('server seed equals the client seed (fightSeed.ts) so a replay recreates the same fight', () => {
  const T = { p1: { distance: 80, midTech: 70 }, p2: { distance: 20, closeHeavy: 60 } };
  const norm = tactics.normalizeCpuTactics;
  for (const [x, y] of [[A, B], [B, A]]) {
    assert.equal(sim.fightSeed(seedMod.SIM_VERSION, x, y, 'SKI_RESORT', 'NORMAL', T.p1, T.p2, norm), seedMod.cpuFightSeed(x, y, 'SKI_RESORT', 'NORMAL', T));
    // e1 matches keep their stored seed: the client replays them with simVersion 1
    assert.equal(sim.fightSeed(1, x, y, 'SKI_RESORT', 'NORMAL', T.p1, T.p2, norm), seedMod.cpuFightSeed(x, y, 'SKI_RESORT', 'NORMAL', T, { simVersion: 1 }));
    // best of 1 changes the seed on both sides; best of 3 (the default) never does
    assert.equal(sim.fightSeed(2, x, y, 'SPIRIT_FOREST', 'NORMAL', T.p1, T.p2, norm, 1), seedMod.cpuFightSeed(x, y, 'SPIRIT_FOREST', 'NORMAL', T, { simVersion: 2, roundsToWin: 1 }));
    assert.equal(sim.fightSeed(2, x, y, 'SPIRIT_FOREST', 'NORMAL', T.p1, T.p2, norm, 2), sim.fightSeed(2, x, y, 'SPIRIT_FOREST', 'NORMAL', T.p1, T.p2, norm));
    assert.notEqual(sim.fightSeed(2, x, y, 'SPIRIT_FOREST', 'NORMAL', T.p1, T.p2, norm, 1), sim.fightSeed(2, x, y, 'SPIRIT_FOREST', 'NORMAL', T.p1, T.p2, norm, 2));
  }
});
test('e2 at best of 3 plays exactly like frozen e1 (so e1 tournaments still replay), and best of 1 ends after one round', () => {
  const ta = { distance: 80 }, tb = { distance: 20, closeHeavy: 60 };
  const e1 = sim.engine('e1'), e2 = sim.engine('e2');
  const run = (E, rtw) => { const e = new E.FightEngine(A, B, 'CPU_VS_CPU', 'SPIRIT_FOREST', 'NORMAL', { p1: E.tactics.normalizeCpuTactics(ta), p2: E.tactics.normalizeCpuTactics(tb) }, 12345); if (rtw) e.roundsToWin = rtw; e.beginVersusIntro(); let f = 0; while (!e.roundOver && f < 36000) { e.step(); f++; } return { f, a: e.p1RoundWins, b: e.p2RoundWins }; };
  assert.deepEqual(run(e2, 2), run(e1));
  const one = run(e2, 1);
  assert.equal(one.a + one.b, 1);
  const r = sim.simulate('e2', A, B, ta, tb, 'SPIRIT_FOREST', 'NORMAL', { roundsToWin: 1 });
  assert.equal(r.roundsToWin, 1); assert.equal(r.scoreA + r.scoreB, 1);
  assert.equal(sim.simulate('e1', A, B, ta, tb, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 }).roundsToWin, 2, 'e1 ignores roundsToWin');
});
test('tournament fights are deterministic and the winner matches the client-side replay stepping', () => {
  const r1 = sim.simulate('e1', A, B, { distance: 80 }, { distance: 20, closeHeavy: 60 }, 'SKI_RESORT', 'NORMAL');
  const r2 = sim.simulate('e1', A, B, { distance: 80 }, { distance: 20, closeHeavy: 60 }, 'SKI_RESORT', 'NORMAL');
  assert.deepEqual(r1, r2);
  assert.deepEqual({ winner: r1.winner, frames: r1.frames, decidedBy: r1.decidedBy }, { winner: 'b', frames: 4950, decidedBy: 'ko' }); // golden: change => new engine version
});
test('a fight that never ends is closed by the fixed bounded tiebreak (rounds, then remaining life, then seed)', () => {
  const r1 = sim.simulate('e1', A, B, { distance: 80 }, { distance: 20 }, 'SKI_RESORT', 'NORMAL', { maxFrames: 600 });
  const r2 = sim.simulate('e1', A, B, { distance: 80 }, { distance: 20 }, 'SKI_RESORT', 'NORMAL', { maxFrames: 600 });
  assert.equal(r1.decidedBy, 'cap'); assert.equal(r1.frames, 600); assert.deepEqual(r1, r2);
  assert.ok(r1.winner === 'a' || r1.winner === 'b');
});
test('unknown engine versions are refused', () => {
  assert.throws(() => sim.simulate('e99', A, B, {}, {}, 'SKI_RESORT', 'NORMAL'), /desconocida/);
});
