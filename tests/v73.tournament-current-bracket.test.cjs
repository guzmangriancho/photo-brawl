process.env.SUPABASE_URL = 'https://db.example.test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../server/tournament/tournament.cjs');

const TID = '11111111-1111-4111-8111-111111111111';
const ent = (id, name, slot) => ({ id, account_id: 'acct' + id, display_name: name, instagram: null, status: 'active', eliminated_round: null, fighter_data: { secret: 'x' }, portrait_path: id + '/p.png', sheet_path: id + '/s.png', tournament_id: TID, slot });
const ENTRIES = [ent('e0', 'Ana', 0), ent('e1', 'Beto', 1), ent('e2', 'Cleo', 2), ent('e3', 'Dani', 3), ent('e4', 'Eva', 4), ent('e5', 'Fer', 5)];
// 6 inscritos: 2 combates de ronda previa (slot < 4) y 2 pasan directo (slot 4 y 5)
let T_ROW;
const mk = (id, slot, a, b, resolved) => ({ id, round_no: 1, slot, entry_a: a, entry_b: b, status: resolved ? 'resolved' : 'pending', winner_entry: resolved ? a : null, score_a: resolved ? 2 : null, score_b: resolved ? 1 : null, decided_by: resolved ? 'ko' : null });
let MATCHES;
function mockFetch() {
  global.fetch = async url => {
    const u = new URL(url); const q = u.searchParams; const path = u.pathname.replace('/rest/v1/', '');
    let body = [];
    if (path === 'tournaments') body = [T_ROW];
    else if (path === 'tournament_entries') {
      const ids = (q.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      const slot = q.get('slot');
      if (slot) { const n = Number(slot.replace('gte.', '')); body = ENTRIES.filter(e => e.slot >= n).map(e => ({ id: e.id })); }
      else body = ENTRIES.filter(e => ids.includes(e.id));
    } else if (path === 'tournament_matches') body = MATCHES.filter(m => String(m.round_no) === (q.get('round_no') || '').replace('eq.', ''));
    return { ok: true, status: 200, headers: { get: () => (path === 'tournament_matches' ? `0-9/${body.length}` : '') }, text: async () => JSON.stringify(body), json: async () => body };
  };
}
const base = { id: TID, status: 'round_open', stage: 'SKI_RESORT', difficulty: 'NORMAL', round_no: 1, round_count: 3, revealed_round: 0, prelim_count: 2 };

test('torneo en marcha: el cuadro actual muestra los cruces de la ronda en juego y quien pasa directo, sin resultados', async () => {
  T_ROW = { ...base };
  MATCHES = [mk('m0', 0, 'e0', 'e1', false), mk('m1', 1, 'e2', 'e3', false)];
  mockFetch();
  const r = await T.bracket(TID, 1, 0);
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches.map(m => [m.a, m.b]), [['Ana', 'Beto'], ['Cleo', 'Dani']]);
  assert.ok(r.matches.every(m => !m.revealed && m.winnerEntryId === undefined && m.scoreA === undefined));
  assert.deepEqual(r.byes.map(b => b.name), ['Eva', 'Fer']);
  assert.equal((await T.bracket(TID, 2, 0)).matches.length, 0);
});
test('mientras se simula la ronda los ganadores siguen tapados', async () => {
  T_ROW = { ...base, status: 'simulating' };
  MATCHES = [mk('m0', 0, 'e0', 'e1', true), mk('m1', 1, 'e2', 'e3', true)];
  mockFetch();
  const r = await T.bracket(TID, 1, 0);
  const text = JSON.stringify(r);
  assert.ok(r.matches.every(m => m.revealed === false && m.winnerEntryId === undefined && m.scoreA === undefined));
  assert.ok(!text.includes('secret') && !text.toLowerCase().includes('tactic') && !text.includes('seed'));
});
test('inscripcion abierta: sin cuadro', async () => {
  T_ROW = { ...base, status: 'registration' };
  MATCHES = [];
  mockFetch();
  assert.equal((await T.bracket(TID, 1, 0)).matches.length, 0);
});
test('destapada: resultados visibles', async () => {
  T_ROW = { ...base, round_no: 2, revealed_round: 1 };
  MATCHES = [mk('m0', 0, 'e0', 'e1', true), mk('m1', 1, 'e2', 'e3', true)];
  mockFetch();
  const r = await T.bracket(TID, 1, 0);
  assert.ok(r.matches.every(m => m.revealed && m.winnerEntryId));
});
