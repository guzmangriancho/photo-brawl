const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/components/fightArena.css'), 'utf8');
const arena = fs.readFileSync(path.join(__dirname, '../src/components/FightArena.tsx'), 'utf8');
const controls = fs.readFileSync(path.join(__dirname, '../src/components/MobileControls.tsx'), 'utf8');
const v34 = css.slice(css.indexOf('/* V34 · Portrait mobile combat:'));
test('vertical portrait hides the teaching panel', () => {
  assert.match(v34, /\.arena-mobile-guide\s*\{\s*display:\s*none\s*!important/);
});
test('HUD has reserved space outside the stage canvas only in portrait', () => {
  assert.match(v34, /\.arena-shell\s*\{[^}]*padding-top:\s*65px/s);
  assert.match(v34, /\.arena-stage\s*\{[^}]*overflow:\s*visible/s);
  assert.match(v34, /\.arena-hud\s*\{[^}]*top:\s*-65px/s);
});
test('super is above the four right buttons, not over a button', () => {
  assert.match(v34, /\.mobile-super-center\s*\{[^}]*left:\s*auto;[^}]*right:\s*calc\([^}]*bottom:\s*calc\(100% \+ 10px\)/s);
  assert.match(controls, /\{superReady\s*&&\s*\(/);
  assert.match(controls, /mobile-super mobile-super-center/);
});
test('portrait tuning does not remove combat controls, HUD or training collision switch', () => {
  assert.match(arena, /className="arena-hud"/);
  assert.match(arena, /COLISIONES \{showArenaCollisions/);
  assert.match(controls, /mobile-utility-row/);
  assert.match(controls, /mobile-actions/);
});
