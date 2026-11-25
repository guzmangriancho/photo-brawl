const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), vm = require('node:vm');
const tactics = require('./helpers/cpuTactics.cjs');

let rnd = Math.random;
const M = Object.create(Math); M.random = () => rnd();
function transpile(rel, req, extra = {}) {
  const file = path.join(__dirname, '..', rel);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, Math: M, Date, console, JSON, Object, String, Number, Array, ...extra, require: req });
  return mod.exports;
}
const soundFX = new Proxy({ muted: true }, { get: (t, p) => p === 'muted' ? t.muted : () => {} });
const { FightEngine } = transpile('src/engine/FightEngine.ts', id => id.includes('cpuTactics') ? tactics : id.includes('SoundFX') ? { soundFX } : id.includes('SpriteProcessor') ? { loadImage: async () => null } : id.includes('stages') ? { STAGE_ART: {}, getLargeArena: () => undefined } : null);
const seedMod = transpile('src/engine/fightSeed.ts', id => id.includes('cpuTactics') ? tactics : null);

const moveset = { lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'LONG_ROUNDHOUSE' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: 'SLIDE_LOW_KICK', visualAction: '' }, specialUp: { name: 'S', mechanic: 'INVINCIBLE_UPPERCUT', visualAction: '' }, ultimateSuper: { name: 'O', mechanic: 'GIANT_BEAM_LASER', visualAction: '' } };
const prof = (n, archetype = 'SHOTO_BALANCED', hp = 25) => ({ id: n, fighterName: n, archetype, stats: { hp, power: 25, technique: 25, speed: 25 }, moveset, passiveTrait: 'DOUBLE_JUMP', portraitDataUrl: '', spriteSheetDataUrl: '' });
const A = prof('a'), B = prof('b', 'RUSHDOWN');
const TAC = { p1: { distance: 80, midTech: 70 }, p2: { distance: 20, closeHeavy: 60 } };

// Same steps the app takes: intro, then one engine.step per tick. `noisy` pollutes the inputs like a live keyboard.
function fight(p1, p2, tac, seed, { noisy = false, cosmetic = Math.random, maxFrames = 60 * 60 * 12 } = {}) {
  rnd = cosmetic;
  const e = new FightEngine(p1, p2, 'CPU_VS_CPU', 'SKI_RESORT', 'NORMAL', tac, seed);
  e.beginVersusIntro();
  const log = [];
  let f = 0;
  while (!e.roundOver && f++ < maxFrames) {
    if (noisy) { e.p1Input.left = f % 7 < 3; e.p1Input.light = f % 11 === 0; }
    e.step();
    if (f % 60 === 0) log.push([Math.round(e.p1.x), Math.round(e.p2.x), e.p1.hp, e.p2.hp].join(','));
  }
  const s = e.getSnapshot();
  return { frames: f, winner: s.winnerName, score: [s.p1RoundWins, s.p2RoundWins], hp: [e.p1.hp, e.p2.hp], digest: seedMod.hash32(log.join('|')) };
}
const lcg = seed => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

test('same seed + fighters + tactics replay the same fight frame by frame, whatever the cosmetic randomness', () => {
  const seed = seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', TAC);
  const r1 = fight(A, B, TAC, seed, { cosmetic: lcg(1) });
  const r2 = fight(A, B, TAC, seed, { cosmetic: lcg(999) });
  const r3 = fight(A, B, TAC, seed, { cosmetic: Math.random });
  assert.ok(r1.frames > 600, 'the fight actually ran');
  assert.deepEqual(r2, r1); assert.deepEqual(r3, r1);
});
test('a live keyboard/touch in CPU vs CPU does not change the fight', () => {
  const seed = seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', TAC);
  assert.deepEqual(fight(A, B, TAC, seed, { noisy: true }), fight(A, B, TAC, seed));
});
test('different seeds or different tactics give different fights', () => {
  const s1 = seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', TAC);
  const s2 = seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', { ...TAC, p1: { distance: 81, midTech: 70 } });
  assert.notEqual(s1, s2);
  assert.notDeepEqual(fight(A, B, TAC, s1).digest, fight(A, B, TAC, s1 + 1).digest);
});
test('seed ignores names and images but changes with anything the engine reads', () => {
  const base = seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', TAC);
  assert.equal(seedMod.cpuFightSeed({ ...A, fighterName: 'otro', portraitDataUrl: 'x', spriteSheetDataUrl: 'y' }, B, 'SKI_RESORT', 'NORMAL', TAC), base);
  assert.notEqual(seedMod.cpuFightSeed(prof('a', 'SHOTO_BALANCED', 30), B, 'SKI_RESORT', 'NORMAL', TAC), base);
  assert.notEqual(seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'HARD', TAC), base);
  assert.notEqual(seedMod.cpuFightSeed(B, A, 'SKI_RESORT', 'NORMAL', TAC), base, 'sides matter');
  assert.equal(seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', undefined), seedMod.cpuFightSeed(A, B, 'SKI_RESORT', 'NORMAL', { p1: tactics.DEFAULT_CPU_TACTICS }));
});
test('without a seed fights still vary (1 vs CPU keeps its randomness)', () => {
  const ds = new Set();
  for (let i = 1; i <= 4; i++) ds.add(fight(A, B, undefined, undefined, { cosmetic: lcg(i * 77), maxFrames: 1800 }).digest);
  assert.ok(ds.size > 1);
});
// Golden guard: if this fails, the engine or the AI changed how a fight plays out.
// Bump SIM_VERSION in src/engine/fightSeed.ts and update GOLDEN, so old saved recipes are known to be outdated.
test('golden fight and SIM_VERSION', () => {
  const GOLDEN = { version: 1, frames: 4849, digest: 4263831207 };
  const r = fight(A, B, TAC, 12345);
  if (process.env.PRINT_GOLDEN) console.log(JSON.stringify({ version: seedMod.SIM_VERSION, frames: r.frames, digest: r.digest, winner: r.winner, score: r.score }));
  assert.equal(seedMod.SIM_VERSION, GOLDEN.version);
  assert.equal(r.frames, GOLDEN.frames);
  assert.equal(r.digest, GOLDEN.digest);
});
