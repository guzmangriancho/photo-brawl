const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const live = require(path.join(root, 'server/runtime/engine/FightEngine.js'));
const e2 = require(path.join(root, 'server/tournament/archive/e2/engine/FightEngine.js'));
const T = require(path.join(root, 'server/runtime/engine/cpuTactics.js'));

const mv = (fw, up, sup) => ({ lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'OVERHEAD_SMASH' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: fw, visualAction: '' }, specialUp: { name: 'S', mechanic: up, visualAction: '' }, ultimateSuper: { name: 'O', mechanic: sup, visualAction: '' } });
const prof = (n, archetype, power, m, passive = 'DOUBLE_JUMP') => ({ id: n, fighterName: n, archetype, stats: { hp: 25, power, technique: 25, speed: 25 }, moveset: m, passiveTrait: passive, portraitDataUrl: '', spriteSheetDataUrl: '' });
const GRAB = prof('g', 'GRAPPLER_TANK', 25, mv('COMMAND_GRAB_SLAM', 'INVINCIBLE_UPPERCUT', 'OMEGA_SUPLEX'), 'HEAVY_ARMOR_STARTUP');
const TELE = prof('t', 'TRICKSTER', 25, mv('TELEPORT_BEHIND', 'VERTICAL_TORNADO', 'METEOR_SCREEN_DROP'));
const DUMMY = prof('d', 'SHOTO_BALANCED', 25, mv('SLIDE_LOW_KICK', 'INVINCIBLE_UPPERCUT', 'GIANT_BEAM_LASER'));

function start(E, a, b, simVersion) {
  const e = new E.FightEngine(a, b, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: T.normalizeCpuTactics({}), p2: T.normalizeCpuTactics({}) }, 7);
  if (simVersion) e.simVersion = simVersion;
  return e;
}
function attackOf(a, sv, slot = 'SP_FORWARD') {
  const e = start(live, a, DUMMY, sv);
  e.startMove(e.p1, e.p2, slot);
  return e.p1.currentAttack;
}

test('v3 nerfs the command grab: less damage, slower start, longer recovery, no armor', () => {
  const o = attackOf(GRAB, 2), n = attackOf(GRAB, 3);
  assert.ok(n.damage < o.damage * 0.85, `${n.damage} vs ${o.damage}`);
  assert.ok(n.startup > o.startup && n.recovery > o.recovery);
  assert.equal(o.hasArmor, true); assert.equal(n.hasArmor, false);
});
test('v3 nerfs the teleport and the omega suplex', () => {
  const o = attackOf(TELE, 2), n = attackOf(TELE, 3);
  assert.ok(n.startup >= o.startup * 2 && n.recovery > o.recovery && n.damage < o.damage);
  const so = attackOf(GRAB, 2, 'SUPER'), sn = attackOf(GRAB, 3, 'SUPER');
  assert.ok(sn.damage < so.damage * 0.85);
});
test('v3 counter: a grab does not connect on a defender who is in the air', () => {
  const e = start(live, GRAB, DUMMY, 3);
  e.p2.x = e.p1.x + 40; e.p2.y = e.p1.y - 120; e.p2.vy = -1; // airborne, inside the grab box
  const hp = e.p2.hp;
  e.startMove(e.p1, e.p2, 'SP_FORWARD');
  for (let i = 0; i < 20; i++) e.step();
  assert.equal(e.p2.grabbedBy, null);
});
const SPIN = prof('s', 'SHOTO_BALANCED', 25, mv('SPINNING_ADVANCE', 'INVINCIBLE_UPPERCUT', 'MULTI_HIT_RUSH_COMBO'));
test('v3 fixes the spinning advance: all its hits can land, v2 keeps the old behaviour', () => {
  const dmg = (sv) => {
    const e = new live.FightEngine(SPIN, DUMMY, '1P_VS_2P', 'SKI_RESORT', 'NORMAL'); e.simVersion = sv;
    e.p2.x = e.p1.x + 60; e.startMove(e.p1, e.p2, 'SP_FORWARD');
    const hp = e.p2.hp;
    for (let i = 0; i < 40; i++) e.step();
    return hp - e.p2.hp;
  };
  const o = dmg(2), n = dmg(3);
  assert.ok(n >= o * 2.5, `v3 ${n} vs v2 ${o}`);
});
test('replays of older versions keep playing exactly like the frozen archived engines', () => {
  const pairs = [[GRAB, DUMMY], [DUMMY, GRAB], [TELE, GRAB], [GRAB, TELE], [TELE, DUMMY]];
  for (const [a, b] of pairs) for (const seed of [1, 99, 4242]) {
    const run = (E, sv) => {
      const e = new E.FightEngine(a, b, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', { p1: T.normalizeCpuTactics({}), p2: T.normalizeCpuTactics({ distance: 20 }) }, seed);
      if (sv) e.simVersion = sv; e.roundsToWin = 1; e.beginVersusIntro();
      let f = 0; while (!e.roundOver && f < 36000) { e.step(); f++; }
      return [f, e.p1RoundWins, e.p2RoundWins, e.p1.hp, e.p2.hp];
    };
    assert.deepEqual(run(live, 2), run(e2), `${a.fighterName} vs ${b.fighterName} seed ${seed}`);
  }
});
test('engine and seed versions agree', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(root, 'src/engine/fightSeed.ts'), 'utf8');
  assert.match(src, new RegExp('SIM_VERSION = ' + live.ENGINE_SIM_VERSION + ';'));
});
