const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/components/groupFightArena.css'), 'utf8');

test('V42: group arena preserves aspect ratio while filling screen height in landscape', () => {
  const landscape = css.match(/@media \(orientation: landscape\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(landscape, 'landscape rules exist');
  assert.match(landscape, /\.pb-group-stage\s*\{[^}]*width:\s*calc\(100dvh \* 16 \/ 9\)/);
  assert.match(landscape, /\.pb-group-stage\s*\{[^}]*height:\s*100dvh/);
  assert.match(landscape, /\.pb-group-stage\s*\{[^}]*aspect-ratio:\s*16 \/ 9/);
  assert.doesNotMatch(landscape, /\.pb-group-stage\s*\{[^}]*aspect-ratio:\s*auto/);
});

test('V42: stage canvas follows stage box, and HUD remains inside viewport', () => {
  assert.match(css, /\.pb-group-stage canvas\s*\{[^}]*width:\s*100%;\s*height:\s*100%/);
  assert.match(css, /\.pb-group-hud\s*\{[^}]*width:\s*min\(100vw,\s*100%\)/);
});
