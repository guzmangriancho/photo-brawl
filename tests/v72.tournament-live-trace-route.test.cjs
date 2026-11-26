process.env.SUPABASE_URL = 'https://db.example.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.TOURNAMENT_LIVE = '1';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const T = require('../server/tournament/tournament.cjs');
const sim = require('../server/tournament/sim.cjs');

const mv = { lightNormal: { name: 'P', style: 'FAST_JAB' }, heavyNormal: { name: 'G', style: 'LONG_ROUNDHOUSE' }, specialNeutral: { name: 'B', mechanic: 'STRAIGHT_FIREBALL', visualAction: '', primaryHex: '#40d9f5' }, specialForward: { name: 'I', mechanic: 'SLIDE_LOW_KICK', visualAction: '' }, specialUp: { name: 'S', mechanic: 'INVINCIBLE_UPPERCUT', visualAction: '' }, ultimateSuper: { name: 'O', mechanic: 'GIANT_BEAM_LASER', visualAction: '' } };
const prof = (n, archetype, hp) => ({ id: n, fighterName: n, archetype, stats: { hp, power: 25, technique: 25, speed: 25 }, moveset: mv, passiveTrait: 'DOUBLE_JUMP', portraitDataUrl: '', spriteSheetDataUrl: '' });
const ID = { t: '11111111-1111-4111-8111-111111111111', m: '22222222-2222-4222-8222-222222222222', m2: '33333333-3333-4333-8333-333333333333' };
const ent = (id, acct, name, fd) => ({ id, account_id: acct, display_name: name, instagram: null, status: 'active', eliminated_round: null, fighter_data: fd, portrait_path: id + '/p.png', sheet_path: id + '/s.png', tournament_id: ID.t });
const FA = prof('Ana', 'SHOTO_BALANCED', 25), FB = prof('Beto', 'RUSHDOWN', 25), FC = prof('Cleo', 'SHOTO_BALANCED', 25);
const ENTRIES = [ent('eA', 'acctA', 'Ana', FA), ent('eB', 'acctB', 'Beto', FB), ent('eC', 'acctC', 'Cleo', FC)];
const TA = { distance: 83, closeHeavy: 71 }, TB = { distance: 21, midTech: 64 };
const strip = f => ({ ...f, id: 'a', spriteSheetDataUrl: '', portraitDataUrl: '' });
const s = sim.simulate('e3', strip(FA), { ...strip(FB), id: 'b' }, TA, TB, 'SKI_RESORT', 'NORMAL', { roundsToWin: 1 });
const match = { id: ID.m, round_no: 1, entry_a: 'eA', entry_b: 'eB', status: 'resolved', resolved_at: new Date().toISOString(), frames: s.frames, seed: s.seed, sim_version: 3, engine_version: 'e3', rounds_to_win: 1,
  winner_entry: s.winner === 'a' ? 'eA' : 'eB', score_a: s.scoreA, score_b: s.scoreB, decided_by: s.decidedBy, tactics_a: TA, tactics_b: TB };
const other = { ...match, id: ID.m2, entry_a: 'eC', entry_b: 'eB' };
function mockFetch() {
  global.fetch = async url => {
    const u = new URL(url); const q = u.searchParams; const path = u.pathname.replace('/rest/v1/', '');
    let body = [];
    if (path === 'tournaments') body = q.get('status') === 'eq.finished' ? [] : [{ id: ID.t, status: 'simulating', stage: 'SKI_RESORT', difficulty: 'NORMAL' }];
    else if (path === 'tournament_entries') {
      const acct = (q.get('account_id') || '').replace('eq.', '');
      const ids = (q.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      body = acct ? ENTRIES.filter(e => e.account_id === acct) : ENTRIES.filter(e => ids.includes(e.id));
    } else if (path === 'tournament_matches') {
      const id = (q.get('id') || '').replace('eq.', '');
      const or = q.get('or') || '';
      const mine = or.match(/entry_a\.eq\.([^,]+),entry_b\.eq\.([^)]+)/);
      if (id) body = [match, other].filter(m => m.id === id);
      else body = mine ? [match].filter(m => mine[1] === m.entry_a || mine[1] === m.entry_b) : [];
    }
    return { ok: true, status: 200, headers: { get: () => '' }, text: async () => JSON.stringify(body), json: async () => body };
  };
}

test('la traza corresponde al mismo combate, luchadores y resultado que la simulación oficial guardada, y no contiene tácticas ni semilla', async () => {
  mockFetch();
  const live = (await T.liveFor('acctA')).live;
  assert.equal(live.matchId, ID.m);
  const gz = await T.liveTraceFor('acctA', ID.m);
  const body = JSON.parse(zlib.gunzipSync(gz).toString());
  // misma duración que la que guarda el servidor y que anuncia /live
  assert.equal(body.frames, match.frames);
  assert.equal(body.frames, live.frames);
  // misma identidad: los nombres de la traza son los de A y B del combate y el último estado coincide con el resultado oficial
  const text = JSON.stringify(body);
  let cur = {}; for (const d of body.s) cur = { ...cur, ...d };
  assert.equal(cur.snapshot.p1RoundWins, match.score_a);
  assert.equal(cur.snapshot.p2RoundWins, match.score_b);
  assert.equal(cur.snapshot.roundOver, true);
  assert.equal(cur.snapshot.winnerName, match.winner_entry === 'eA' ? 'Ana' : 'Beto');
  assert.ok(!text.includes('Cleo'));
  for (const w of ['tactic', 'seed', 'closeHeavy', 'midTech', 'distance', String(match.seed)]) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), w);
  // los dos contendientes reciben exactamente los mismos bytes
  assert.ok((await T.liveTraceFor('acctB', ID.m)).equals(gz));
});
test('tercero, no inscrito o combate ajeno: sin traza', async () => {
  mockFetch();
  assert.equal(await T.liveTraceFor('acctC', ID.m), null);
  assert.equal(await T.liveTraceFor('acctZ', ID.m), null);
  assert.equal(await T.liveTraceFor('acctA', ID.m2), null);
  assert.equal(await T.liveTraceFor('acctA', 'no-es-uuid'), null);
});
test('apagado: sin TOURNAMENT_LIVE=1 tampoco hay traza', async () => {
  mockFetch(); delete process.env.TOURNAMENT_LIVE;
  assert.equal(await T.liveTraceFor('acctA', ID.m), null);
  process.env.TOURNAMENT_LIVE = '1';
});
