// Flujo completo del vídeo de torneo contra un Supabase y un GitHub falsos (https local con certificado temporal).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');

const TID = '11111111-2222-4333-8444-555555555555', OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const ADMIN_TOKEN = 'admin-token-' + 'x'.repeat(30), USER_TOKEN = 'user-token-' + 'y'.repeat(30);
const SECRET = 's'.repeat(40);
const db = { videos: new Map(), tournaments: new Map([[TID, 'finished'], [OTHER, 'round_open']]), storage: new Map(), dispatches: [], ghStatus: 204 };
let server, T, dir;

function body(req) { return new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbv-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', dir + '/k.pem', '-out', dir + '/c.pem', '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  server = https.createServer({ key: fs.readFileSync(dir + '/k.pem'), cert: fs.readFileSync(dir + '/c.pem') }, async (req, res) => {
    const u = new URL(req.url, 'https://x'), p = u.pathname, b = await body(req);
    const auth = req.headers.authorization || '';
    if (p === '/auth/v1/user') {
      const id = auth === 'Bearer ' + ADMIN_TOKEN ? 'aaaaaaaa-0000-4000-8000-000000000001' : auth === 'Bearer ' + USER_TOKEN ? 'bbbbbbbb-0000-4000-8000-000000000002' : null;
      return id ? json(res, 200, { id }) : json(res, 401, {});
    }
    if (p === '/rest/v1/rpc/pb_is_admin') return json(res, 200, auth === 'Bearer ' + ADMIN_TOKEN);
    if (p === '/rest/v1/tournaments') { const id = (u.searchParams.get('id') || '').replace('eq.', ''); return json(res, 200, db.tournaments.has(id) ? [{ id, status: db.tournaments.get(id) }] : []); }
    if (p === '/rest/v1/tournament_videos') {
      if (req.method === 'GET') { const id = (u.searchParams.get('tournament_id') || '').replace('eq.', ''); return json(res, 200, db.videos.has(id) ? [db.videos.get(id)] : []); }
      if (req.method === 'POST') { const o = JSON.parse(b); db.videos.set(o.tournament_id, o); res.writeHead(201); return res.end(); }
      if (req.method === 'PATCH') { const id = (u.searchParams.get('tournament_id') || '').replace('eq.', ''); Object.assign(db.videos.get(id), JSON.parse(b)); res.writeHead(204); return res.end(); }
    }
    if (p.startsWith('/storage/v1/object/sign/tournament-videos/')) return json(res, 200, { signedURL: p.replace('/storage/v1', '') + '?token=abc' });
    if (p.startsWith('/storage/v1/object/tournament-videos/') && req.method === 'POST') { db.storage.set(p, b.length); res.writeHead(200); return res.end('{}'); }
    if (p.startsWith('/repos/') && p.endsWith('/dispatches')) { db.dispatches.push({ auth, body: JSON.parse(b), path: p }); res.writeHead(db.ghStatus); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, r));
  const base = 'https://localhost:' + server.address().port;
  Object.assign(process.env, { NODE_TLS_REJECT_UNAUTHORIZED: '0', SUPABASE_URL: base, SUPABASE_SECRET_KEY: 'svc-key-' + 'z'.repeat(30), SUPABASE_PUBLISHABLE_KEY: 'pub-key-' + 'p'.repeat(20),
    VIDEO_EXPORT_SECRET: SECRET, GITHUB_DISPATCH_TOKEN: 'gh-token-fake', GITHUB_API_BASE: base });
  T = require('../server/tournament/tournament.cjs');
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function call(method, url, { token, headers, body: bd, raw } = {}) {
  return new Promise(resolve => {
    const chunks = bd === undefined ? [] : [raw ? bd : Buffer.from(JSON.stringify(bd))];
    const req = { url, method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(headers || {}) }, socket: { remoteAddress: '1.2.3.4' },
      on(ev, fn) { if (ev === 'data') chunks.forEach(c => fn(c)); if (ev === 'end') setImmediate(fn); return this; }, destroy() {} };
    const res = { writeHead(c) { this.code = c; }, end(b) { let o = null; try { o = JSON.parse(b); } catch { /* vacío */ } resolve({ code: this.code, body: o }); } };
    T.handleHttp(req, res, { corsOrigin: '' });
  });
}
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000)]);

test('usuario normal: función apagada, no puede pedir ni ver vídeos', async () => {
  assert.deepEqual((await call('GET', '/tournament/video?tournament=' + TID, { token: USER_TOKEN })).body, { enabled: false });
  const r = await call('POST', '/tournament/video', { token: USER_TOKEN, body: { tournament: TID, day: 1 } });
  assert.deepEqual(r.body, { enabled: false });
  assert.equal(db.dispatches.length, 0);
  assert.equal(db.videos.size, 0);
});
test('admin: valida torneo, día y estado antes de lanzar', async () => {
  assert.match((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: OTHER, day: 1 } })).body.error, /aún no ha terminado/);
  assert.match((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 0 } })).body.error, /día/);
  assert.match((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 1.5 } })).body.error, /día/);
  assert.equal(db.dispatches.length, 0);
});
test('admin pide el vídeo: se anota y se lanza el workflow con solo id y día', async () => {
  const r = await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 3 } });
  assert.equal(r.code, 200); assert.equal(r.body.status, 'queued'); assert.equal(r.body.dayNo, 3);
  assert.equal(db.dispatches.length, 1);
  const d = db.dispatches[0];
  assert.equal(d.auth, 'Bearer gh-token-fake');
  assert.match(d.path, /\/repos\/guzmangriancho\/photo-brawl\/actions\/workflows\/tournament-video\.yml\/dispatches$/);
  assert.deepEqual(d.body, { ref: 'main', inputs: { tournament_id: TID, day: '3' } });
  assert.equal((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 3 } })).code, 409, 'no se duplica mientras está en marcha');
  assert.equal((await call('GET', '/tournament/video?tournament=' + TID, { token: ADMIN_TOKEN })).body.status, 'queued');
});
test('rutas del workflow: sin secreto 401, con secreto sube mp4 y queda listo', async () => {
  const q = '/tournament/video-upload?tournament=' + TID;
  assert.equal((await call('PUT', q, { body: mp4, raw: true })).code, 401);
  assert.equal((await call('PUT', q, { headers: { 'x-export-secret': 'n'.repeat(40) }, body: mp4, raw: true })).code, 401);
  const H = { 'x-export-secret': SECRET };
  assert.equal((await call('PUT', q, { headers: H, body: Buffer.alloc(3000), raw: true })).code, 400, 'no es un mp4');
  assert.equal((await call('PUT', '/tournament/video-upload?tournament=' + OTHER, { headers: H, body: mp4, raw: true })).code, 409, 'sin petición abierta');
  const ok = await call('PUT', q, { headers: H, body: mp4, raw: true });
  assert.equal(ok.code, 200); assert.equal(db.storage.size, 1);
  assert.equal(db.videos.get(TID).status, 'ready');
  assert.equal((await call('PUT', q, { headers: H, body: mp4, raw: true })).code, 409, 'ya no hay petición abierta');
});
test('listo: el admin recibe URL firmada de bucket privado; regenerar exige force', async () => {
  const g = (await call('GET', '/tournament/video?tournament=' + TID, { token: ADMIN_TOKEN })).body;
  assert.equal(g.status, 'ready'); assert.match(g.url, /\/storage\/v1\/object\/sign\/tournament-videos\/.+\.mp4\?token=/);
  assert.equal((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 3 } })).code, 409);
  assert.equal((await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 3, force: true } })).code, 200);
  assert.equal(db.dispatches.length, 2);
});
test('fallos: el workflow marca fallido; un dispatch rechazado deja fallido y no filtra detalles', async () => {
  assert.equal((await call('POST', '/tournament/video-failed?tournament=' + TID, { headers: { 'x-export-secret': SECRET } })).code, 200);
  assert.equal((await call('GET', '/tournament/video?tournament=' + TID, { token: ADMIN_TOKEN })).body.status, 'failed');
  db.ghStatus = 403;
  const r = await call('POST', '/tournament/video', { token: ADMIN_TOKEN, body: { tournament: TID, day: 4 } });
  assert.equal(r.code, 502); assert.ok(!JSON.stringify(r.body).includes('gh-token'));
  assert.equal(db.videos.get(TID).status, 'failed');
});
test('petición en marcha sin vídeo tras 45 min se muestra como fallida', () => {
  const V = require('../server/tournament/video.cjs');
  assert.equal(V.viewOf({ status: 'queued', requested_at: new Date(Date.now() - 46 * 60000).toISOString(), day_no: 1 }).status, 'failed');
  assert.equal(V.viewOf({ status: 'queued', requested_at: new Date().toISOString(), day_no: 1 }).status, 'queued');
});
