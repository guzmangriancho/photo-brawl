'use strict';
// Lanzador multiplataforma: invoca los ejecutables JS directamente con Node.
// Evita el problema de spawnSync('npm.cmd') en versiones recientes de Node/Windows.
const { spawnSync, spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');

const root = resolve(__dirname, '..');
const tsc = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
const vite = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = resolve(__dirname, 'index.cjs');
const prepare = resolve(__dirname, 'prepare.cjs');

if (!existsSync(tsc) || !existsSync(vite)) {
  console.error('[PHOTO BRAWL] Faltan dependencias. Ejecuta npm install en la carpeta del proyecto.');
  process.exit(1);
}

console.log('[PHOTO BRAWL] Compilando el motor online…');
const build = spawnSync(process.execPath, [tsc, '-p', 'server/tsconfig.json'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (build.error || build.status !== 0) {
  console.error('[PHOTO BRAWL] No se pudo compilar el motor:', build.error?.message || `código ${build.status}`);
  process.exit(build.status || 1);
}
const prepared = spawnSync(process.execPath, [prepare], { cwd: root, stdio: 'inherit', windowsHide: true });
if (prepared.error || prepared.status !== 0) {
  console.error('[PHOTO BRAWL] Error preparando el motor:', prepared.error?.message || `código ${prepared.status}`);
  process.exit(prepared.status || 1);
}

const children = [];
let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child && child.exitCode === null && !child.killed) child.kill();
  }
  // Windows puede no reenviar SIGINT a los procesos secundarios.
  process.exitCode = exitCode;
}
function launch(label, argv) {
  const child = spawn(process.execPath, argv, { cwd: root, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', err => {
    console.error(`[PHOTO BRAWL] No se pudo iniciar ${label}: ${err.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[PHOTO BRAWL] ${label} se ha detenido (${signal || `código ${code}`}).`);
      stop(code || 1);
    }
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('[PHOTO BRAWL] Iniciando servidor online (:8787) y Vite (:5173)…');
launch('servidor online', [server]);
launch('Vite', [vite, '--host', '0.0.0.0']);
