const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('el panel de vídeo está cableado: servicio, pantalla de torneo y solo para torneos terminados', () => {
  const svc = r('src/services/tournamentService.ts'), scr = r('src/components/TournamentScreen.tsx'), pnl = r('src/components/TournamentVideoPanel.tsx');
  assert.match(svc, /fetchTournamentVideo/); assert.match(svc, /requestTournamentVideo/);
  assert.match(scr, /bt\.status === 'finished' && <TournamentVideoPanel/);
  assert.match(pnl, /if \(!v\?\.enabled\) return null/, 'sin permiso no se pinta nada');
  assert.match(pnl, /status === 'queued'/); assert.match(pnl, /DESCARGAR VÍDEO/); assert.match(pnl, /rel="noopener noreferrer"/);
});
test('workflow: solo dispatch, sin artefactos, sin claves de Supabase, entradas validadas y por entorno', () => {
  const w = r('.github/workflows/tournament-video.yml').split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  assert.match(w, /workflow_dispatch/); assert.ok(!/\n\s+(push|pull_request|schedule):/.test(w), 'ningún otro disparador');
  assert.ok(!/upload-artifact/.test(w), 'sin artefactos en repo público');
  assert.ok(!/SUPABASE/i.test(w), 'ninguna clave de Supabase en GitHub');
  assert.ok(!/run:[^\n]*\$\{\{\s*inputs\./.test(w), 'las entradas no se interpolan en comandos');
  assert.match(w, /permissions: \{ contents: read \}/); assert.match(w, /\^\[0-9a-fA-F-\]\{36\}\$/);
});
