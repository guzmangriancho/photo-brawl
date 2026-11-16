/** Dependency-light schema/prompt regression tests. Run after npm install. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Date, Math, Error });
for (const filename of ['src/services/fighterPrompts.ts', 'src/services/geminiFighterGenerator.ts']) {
  const source = fs.readFileSync(path.join(base, filename), 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.equal((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  vm.runInContext(transpiled.outputText.replace(/^import [^;]+;\s*/gm, '').replace(/^export /gm, ''), context);
}
const d = {
  fighterName: 'ECO', subtitle: 'MAESTRO DEL VIENTO', archetype: 'TRICKSTER',
  stats: { hp: 22, speed: 30, power: 23, technique: 25 },
  passiveTrait: 'AIR_DASH', traitDescription: 'Puede hacer un dash en el aire.',
  visualDescriptionForSprite: 'Black hair, bright green football shirt and blue trainers.',
  animationDirection: {
    stanceStyle: 'Southpaw guard',
    light: { attackType: 'PUNCH', strikingLimb: 'LEFT_FIST', windupAction: 'Load left fist', activeAction: 'Extend left fist' },
    heavy: { attackType: 'KICK', strikingLimb: 'RIGHT_FOOT', windupAction: 'Raise right knee', activeAction: 'Extend right foot' },
  },
  moveset: {
    lightNormal: { name: 'PUÑO FLASH', style: 'FAST_JAB' },
    heavyNormal: { name: 'PATADA DE ACERO', style: 'LONG_ROUNDHOUSE' },
    specialNeutral: { name: 'ORBE', mechanic: 'STRAIGHT_FIREBALL', visualAction: 'A green energy ball', primaryHex: '#12bb55' },
    specialForward: { name: 'PASO', mechanic: 'TELEPORT_BEHIND', visualAction: 'Cloud teleport' },
    specialUp: { name: 'VOLTERETA', mechanic: 'VERTICAL_TORNADO', visualAction: 'High spinning kick' },
    ultimateSuper: { name: 'FINAL', mechanic: 'MULTI_HIT_RUSH_COMBO', visualAction: 'A rapid wind combo' },
  },
};
const parsed = context.parseFighterDesignJson(JSON.stringify(d), 'NOMBRE');
assert.equal(parsed.fighterName, 'NOMBRE');
assert.equal(parsed.stats.hp + parsed.stats.speed + parsed.stats.power + parsed.stats.technique, 100);
assert.equal(parsed.passiveTrait, 'AIR_DASH'); // no double jump added to everyone
assert.equal(parsed.animationDirection.heavy.strikingLimb, 'RIGHT_FOOT');
const adjusted = context.parseFighterDesignJson({ ...d, stats: { hp: 35, speed: 35, power: 35, technique: 35 } });
assert.equal(Object.values(adjusted.stats).reduce((a,b) => a + b), 100);
Object.values(adjusted.stats).forEach(v => assert.ok(v >= 15 && v <= 35));
assert.throws(() => context.parseFighterDesignJson({ ...d, moveset: { ...d.moveset, specialUp: { ...d.moveset.specialUp, mechanic: 'TELEPORT_ACROSS_SCREEN' } } }), /valor no reconocido/);
const sheetPrompt = context.buildSpritePrompt(parsed);
assert.match(sheetPrompt, /CELL 6: LIGHT ATTACK WINDUP/);
assert.match(sheetPrompt, /CELL 13: Ultimate pose/);
assert.match(sheetPrompt, /ONLY the isolated projectile/);
assert.match(sheetPrompt, /RIGHT_FOOT/);
assert.ok(context.needsProjectileSprite('STRAIGHT_FIREBALL'));
assert.ok(!context.needsProjectileSprite('GROUND_SHOCKWAVE'));
const noProjectile = context.buildSpritePrompt({ ...parsed, moveset: { ...parsed.moveset, specialNeutral: { ...parsed.moveset.specialNeutral, mechanic: 'GROUND_SHOCKWAVE' } } });
assert.match(noProjectile, /KO pose/);
const profile = context.buildCreatedProfile(parsed, 'data:image/png;base64,sprites', 'data:image/png;base64,portrait');
assert.equal(profile.spriteSheetLayoutVersion, 2);
assert.equal(profile.spriteSheetLastCell, 'PROJECTILE');
assert.throws(() => context.buildCreatedProfile(parsed, '', ''), /spritesheet y el retrato/);
console.log('PASS creator schema / supported mechanics / 6 moves / personalized sprite prompts');
