const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const live = require(path.join(root, 'server/runtime/engine/FightEngine.js'));
const e3 = require(path.join(root, 'server/tournament/archive/e3/engine/FightEngine.js'));
const e4 = require(path.join(root, 'server/tournament/archive/e4/engine/FightEngine.js'));
const T = require(path.join(root, 'server/runtime/engine/cpuTactics.js'));
const mv = (up, sup, fw = 'SLIDE_LOW_KICK') => ({ lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'OVERHEAD_SMASH' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: fw, visualAction: '' }, specialUp: { name: 'S', mechanic: up, visualAction: '' }, ultimateSuper: { name: 'O', mechanic: sup, visualAction: '' } });
const prof = (n, archetype, m, passive = 'DOUBLE_JUMP') => ({ id: n, fighterName: n, archetype, stats: { hp: 25, power: 25, technique: 25, speed: 25 }, moveset: m, passiveTrait: passive, portraitDataUrl: '', spriteSheetDataUrl: '' });
const MAGE = prof('m', 'ZONER_MAGE', mv('VERTICAL_TORNADO', 'GIANT_BEAM_LASER', 'ARMORED_SHOULDER_DASH'));
const UPPER = prof('u', 'ZONER_MAGE', mv('INVINCIBLE_UPPERCUT', 'GIANT_BEAM_LASER'));
const GRAB = prof('g', 'GRAPPLER_TANK', mv('INVINCIBLE_UPPERCUT', 'OMEGA_SUPLEX', 'COMMAND_GRAB_SLAM'), 'HEAVY_ARMOR_STARTUP');
const RUSH = prof('r', 'RUSHDOWN', mv('VERTICAL_TORNADO', 'MULTI_HIT_RUSH_COMBO'), 'AIR_DASH');

function tornado(E, a, sv) {
  const e = new E.FightEngine(a, GRAB, '1P_VS_2P', 'SKI_RESORT', 'NORMAL');
  if (sv) e.simVersion = sv;
  e.p2.x = e.p1.x + 50;
  const hp = e.p2.hp; let hits = 0, last = hp;
  e.startMove(e.p1, e.p2, 'SP_UP');
  for (let i = 0; i < 60; i++) { e.step(); if (e.p2.hp < last) { hits++; last = e.p2.hp; } }
  return { hits, dmg: hp - e.p2.hp };
}
test('v4: the vertical tornado lands all its hits (v3 landed one)', () => {
  const o = tornado(live, MAGE, 3), n = tornado(live, MAGE, 4);
  assert.equal(o.hits, 1);
  assert.ok(n.hits >= 4, `hits ${n.hits}`);
  assert.ok(n.dmg > o.dmg * 2.2, `${n.dmg} vs ${o.dmg}`);
});
test('v4: total tornado damage is 70% of nominal (below the unscaled 5 x 1/5)', () => {
  const full = (() => { const e = new live.FightEngine(MAGE, GRAB, '1P_VS_2P', 'SKI_RESORT', 'NORMAL'); e.simVersion = 4; e.p2.x = e.p1.x + 50; e.startMove(e.p1, e.p2, 'SP_UP'); return e.p1.currentAttack.damage; })();
  const n = tornado(live, MAGE, 4);
  assert.ok(n.dmg <= Math.round(full * 0.7) + 4 && n.dmg >= Math.round(full * 0.7 * 0.55), `${n.dmg} vs nominal ${full}`);
});
test('v4 leaves other uppercut/spin mechanics untouched', () => {
  const a = tornado(live, UPPER, 3), b = tornado(live, UPPER, 4);
  assert.deepEqual(a, b);
});
test('current engine at simVersion 3 equals the frozen e3 archive, and live equals frozen e4', () => {
  const pairs = [[MAGE, GRAB], [GRAB, MAGE], [RUSH, MAGE], [MAGE, UPPER], [UPPER, RUSH]];
  for (const [a, b] of pairs) for (const seed of [1, 99, 4242]) {
    const run = (E, sv) => {
      const e = new E.FightEngine(a, b, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: T.normalizeCpuTactics({}), p2: T.normalizeCpuTactics({ distance: 20 }) }, seed);
      if (sv) e.simVersion = sv; e.roundsToWin = 1; e.beginVersusIntro();
      let f = 0; while (!e.roundOver && f < 36000) { e.step(); f++; }
      return [f, e.p1RoundWins, e.p2RoundWins, e.p1.hp, e.p2.hp];
    };
    assert.deepEqual(run(live, 3), run(e3), `v3 ${a.fighterName} vs ${b.fighterName} seed ${seed}`);
    assert.deepEqual(run(live, 4), run(e4), `v4 ${a.fighterName} vs ${b.fighterName} seed ${seed}`);
  }
});
test('v4 changes tornado fights (mage vs grappler) so the version bump is needed', () => {
  const run = (E) => { const e = new E.FightEngine(MAGE, GRAB, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: T.normalizeCpuTactics({}), p2: T.normalizeCpuTactics({}) }, 7); e.roundsToWin = 1; e.beginVersusIntro(); let f = 0; while (!e.roundOver && f < 36000) { e.step(); f++; } return [f, e.p1.hp, e.p2.hp]; };
  assert.notDeepEqual(run(e3), run(e4));
});
test('engine, seed version and sim registry agree on 4', () => {
  const fs = require('node:fs');
  assert.equal(live.ENGINE_SIM_VERSION, 4);
  assert.match(fs.readFileSync(path.join(root, 'src/engine/fightSeed.ts'), 'utf8'), /SIM_VERSION = 4;/);
  const sim = require(path.join(root, 'server/tournament/sim.cjs'));
  assert.equal(sim.ENGINES.e4.simVersion, 4);
  assert.equal(sim.ENGINES.e3.simVersion, 3);
});
