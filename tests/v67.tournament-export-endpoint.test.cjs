const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../server/tournament/tournament.cjs');
function run(path, headers) {
  return new Promise(resolve => {
    const res = { writeHead(c) { this.code = c; }, end(b) { resolve({ code: this.code, body: b }); } };
    T.handleHttp({ url: path, method: 'GET', headers: headers || {}, socket: { remoteAddress: '9.9.9.9' } }, res, { corsOrigin: '' });
  });
}
test('/tournament/export: apagado sin secreto, 401 con secreto malo, nunca devuelve datos sin secreto', async () => {
  delete process.env.VIDEO_EXPORT_SECRET;
  assert.equal((await run('/tournament/export?tournament=x')).code, 404);
  process.env.VIDEO_EXPORT_SECRET = 'a'.repeat(32);
  assert.equal((await run('/tournament/export?tournament=x')).code, 401);
  assert.equal((await run('/tournament/export?tournament=x', { 'x-export-secret': 'b'.repeat(32) })).code, 401);
  assert.equal((await run('/tournament/export?tournament=x', { 'x-export-secret': 'corto' })).code, 401);
  assert.equal(T.exportSecretOk({ headers: { 'x-export-secret': 'a'.repeat(32) } }), true);
  process.env.VIDEO_EXPORT_SECRET = 'corto';
  assert.equal(T.exportSecretOk({ headers: { 'x-export-secret': 'corto' } }), false, 'secretos cortos se rechazan');
  delete process.env.VIDEO_EXPORT_SECRET;
});
test('/tournament/export con secreto correcto llega a la capa de datos (503 si no hay Supabase configurado)', async () => {
  process.env.VIDEO_EXPORT_SECRET = 'c'.repeat(32);
  const r = await run('/tournament/export?tournament=x', { 'x-export-secret': 'c'.repeat(32) });
  assert.ok([503, 400].includes(r.code), 'codigo ' + r.code);
  delete process.env.VIDEO_EXPORT_SECRET;
});
