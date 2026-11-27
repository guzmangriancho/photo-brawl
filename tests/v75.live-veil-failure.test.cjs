const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function loadVeil() {
  const out = ts.transpileModule(read('src/services/liveVeil.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', out)(m, m.exports);
  return m.exports;
}

test('liveGate: carga mientras el primer intento esta pendiente, "unknown" si falla sin respuesta previa, "ready" con respuesta', () => {
  const { liveGate } = loadVeil();
  assert.equal(liveGate(false, false), 'loading');
  assert.equal(liveGate(false, true), 'unknown');
  assert.equal(liveGate(true, false), 'ready');
  assert.equal(liveGate(true, true), 'ready', 'una respuesta anterior valida no se pierde por un fallo posterior');
});

test('liveRetryDelayMs: espera creciente con tope, nunca 0 ni infinita (sin limite de reintentos, sin martillear al servidor)', () => {
  const { liveRetryDelayMs } = loadVeil();
  assert.deepEqual([1, 2, 3, 4, 5, 6, 50].map(liveRetryDelayMs), [2000, 4000, 6000, 8000, 10000, 10000, 10000]);
  assert.equal(liveRetryDelayMs(0), 2000);
});

test('TournamentScreen: estado desconocido tapa campeon, resultados, vivos, eliminado, historial y cuadros, y la pantalla sigue usable', () => {
  const s = read('src/components/TournamentScreen.tsx');
  // El catch ya no abre la pantalla con live:null.
  assert.doesNotMatch(s, /catch \{ if \(alive\.current\) setLiveInfo\(old => old \|\| \{ live: null, offset: 0 \}\); \}/);
  // Solo el primer intento pendiente bloquea con "cargando".
  assert.match(s, /if \(loading \|\| gate === 'loading'\) return/);
  assert.match(s, /const veilAll = gate === 'unknown'/);
  // Cada punto donde se mostraba un resultado respeta veilAll.
  assert.match(s, /<b>\{veilAll \|\| \(veilId && lv\?\.tournamentId === state\.previous\.id\)/);
  assert.match(s, /CAMPEÓN: \{veilId \|\| veilAll \?/);
  assert.match(s, /veilId \|\| veilAll \? '\?' : state\?\.progress\?\.alive/);
  assert.match(s, /status === 'eliminated' && !veilId && !veilAll/);
  assert.match(s, /const alivePlayer = .*!veilAll;/);
  assert.equal((s.match(/const veiled = veilAll \|\| m\.id === veilId/g) || []).length, 3, 'historial, cuadro en arbol y cuadro en lista');
  assert.match(s, /veilId=\{veilId\} veilAll=\{veilAll\}/);
  // Con veilAll no se renderiza NINGUN participante de cuadro ni el historial (un emparejamiento de ronda posterior revela quien avanzo).
  assert.match(s, /\{veilAll \? <small className="pb-trn-note" role="note">CUADRO TAPADO/);
  assert.match(s, /state && !veilAll && state\.history\.length > 0 && me/);
  // Aviso con reintento manual.
  assert.match(s, /veilAll && <div className="pb-trn-error" role="status">No se pudo comprobar si tienes un directo/);
  assert.match(s, /liveRetryDelayMs\(liveFails\.current\)/);
});

test('el aviso nuevo tiene traduccion al ingles', () => {
  const sent = read('src/i18n/parts/sentences.ts');
  assert.match(sent, /No se pudo comprobar si tienes un directo en curso\. Hasta saberlo, el campeón, los resultados y el cuadro están tapados\. => Could not check/);
});
