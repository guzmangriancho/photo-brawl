process.env.SUPABASE_URL = 'https://db.example.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../server/tournament/tournament.cjs');

const frozen = { archetype: 'RUSHDOWN', stats: {}, moveset: {} };
const ent = (id, acct, name) => ({ id, account_id: acct, display_name: name, instagram: null, status: 'active', eliminated_round: null, fighter_data: frozen, portrait_path: id + '/p.png', sheet_path: id + '/s.png', tournament_id: 't1' });
const ENTRIES = [ent('eA', 'acctA', 'Ana'), ent('eB', 'acctB', 'Beto'), ent('eC', 'acctC', 'Cleo')];
let match;
function mockFetch() {
  global.fetch = async url => {
    const u = new URL(url);
    const q = u.searchParams;
    const path = u.pathname.replace('/rest/v1/', '');
    let body = [];
    if (path === 'tournaments') body = q.get('status') === 'eq.finished' ? [] : [{ id: 't1', status: 'simulating', stage: 'SPIRIT_FOREST', difficulty: 'NORMAL' }];
    else if (path === 'tournament_entries') {
      const acct = (q.get('account_id') || '').replace('eq.', '');
      const ids = (q.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      body = acct ? ENTRIES.filter(e => e.account_id === acct) : ENTRIES.filter(e => ids.includes(e.id));
    } else if (path === 'tournament_matches') {
      const or = q.get('or') || '';
      const mine = or.match(/entry_a\.eq\.([^,]+),entry_b\.eq\.([^)]+)/);
      body = match && match.status === 'resolved' && mine && (mine[1] === match.entry_a || mine[1] === match.entry_b) ? [match] : [];
    }
    return { ok: true, status: 200, headers: { get: () => '' }, text: async () => JSON.stringify(body), json: async () => body };
  };
}
const base = () => ({ id: 'm1', round_no: 1, entry_a: 'eA', entry_b: 'eB', status: 'resolved', resolved_at: new Date().toISOString(), frames: 1800, seed: 7, sim_version: 3, engine_version: 'e3', rounds_to_win: 1,
  winner_entry: 'eA', score_a: 1, score_b: 0, decided_by: 'ko', tactics_a: {}, tactics_b: {} });

test('el contendiente recibe SU combate, con ancla a +30 s de resolved_at y duración real frames/60, sin ganador ni marcador', async () => {
  mockFetch(); match = base();
  const r = await T.liveFor('acctA');
  assert.ok(r.live);
  assert.equal(r.live.matchId, 'm1');
  assert.equal(r.live.youAre, 'a');
  assert.equal(r.live.anchorMs, new Date(match.resolved_at).getTime() + 30000);
  assert.equal(r.live.endsAtMs - r.live.anchorMs, 30000, '1800 frames a 60 fps = 30 s');
  const text = JSON.stringify(r.live);
  for (const k of ['winner', 'scoreA', 'scoreB', 'decidedBy', 'winner_entry', 'score_a']) assert.ok(!text.includes(k), 'no debe filtrar ' + k);
  assert.equal((await T.liveFor('acctB')).live.youAre, 'b');
});
test('un tercero inscrito (otro combate) o sin inscripción no recibe nada', async () => {
  mockFetch(); match = base();
  assert.equal((await T.liveFor('acctC')).live, null);
  assert.equal((await T.liveFor('nadie')).live, null);
});
test('combate pendiente, fuera de ventana o sin frames: nada', async () => {
  mockFetch();
  match = { ...base(), status: 'pending' };
  assert.equal((await T.liveFor('acctA')).live, null);
  match = { ...base(), resolved_at: new Date(Date.now() - 10 * 60000).toISOString() };
  assert.equal((await T.liveFor('acctA')).live, null, 'pasada la ventana ya solo hay repetición');
  match = { ...base(), frames: 0 };
  assert.equal((await T.liveFor('acctA')).live, null);
});
test('el ancla se calcula desde resolved_at: una simulación tardía retrasa el directo, no lo rompe', async () => {
  mockFetch();
  match = { ...base(), resolved_at: new Date(Date.now() - 20000).toISOString() };
  const r = await T.liveFor('acctA');
  assert.ok(r.live && r.live.anchorMs > Date.now(), 'aún por empezar (ancla futura)');
});
