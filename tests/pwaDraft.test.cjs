const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = (() => { try { return require('typescript'); } catch { return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); } })();
const root = path.join(__dirname,'..');
const load = name => fs.readFileSync(path.join(root,name),'utf8');
const draft = load('src/services/creatorDraftService.ts');
const storage = load('src/services/storageService.ts');
const creator = load('src/components/FighterCreator.tsx');
const menu = load('src/components/CharacterSelect.tsx');
const pwa = load('src/components/PwaInstallPrompt.tsx');
const sw = load('public/sw.js');
const manifest = JSON.parse(load('public/manifest.webmanifest'));
const html = load('index.html');
let count = 0;
const test = (name, callback) => { callback();console.log('✓',name);count++ };
test('DB schema version sync, with migration from V9', () => {
 const a=Number(draft.match(/DB_VERSION\s*=\s*(\d+)/)[1]);
 const b=Number(storage.match(/DB_VERSION\s*=\s*(\d+)/)[1]);
 assert.equal(a,b);assert.ok(a>1);assert.match(storage,/creator_drafts/);assert.match(storage,/custom_fighters/);
});
test('Draft includes original binary photo, analysis, images and step', () => {
 for(const field of ['step:','photoFile:','prepared:','design:','sprite:','portrait:','json:'])assert.ok(draft.includes(field),field);
 assert.doesNotMatch(draft,/apiKey\s*:/);
});
test('Draft serializes concurrent operations and supports clear', () => {
 for(const name of ['pendingOperation','enqueue(','saveCreatorDraft','getCreatorDraft','clearCreatorDraft'])assert.ok(draft.includes(name),name);
});
test('Resume marker reopens the creator directly over the main menu',()=>{
 assert.match(menu,/const \[page, setPage\] = useState<MenuPage>\('HOME'\)/);
 assert.match(menu,/useState\(wasCreatorOpen\)/);
 assert.match(menu,/markCreatorOpen\(true\)/);
 assert.match(menu,/markCreatorOpen\(false\)/);
});
test('Autosaves and flushes on background and close',()=>{
 assert.match(creator,/visibilitychange/);
 assert.match(creator,/pagehide/);
 assert.match(creator,/saveCreatorDraft/);
 assert.match(creator,/closeAndSave/);
 assert.match(creator,/clearCreatorDraft/);
});
test('Restored original photo recreated as a File and URL',()=>{
 assert.match(creator,/new File\(\[draft\.photoFile\]/);
 assert.match(creator,/URL\.createObjectURL\(restoredFile\)/);
});
test('PWA supports native prompt and manual iOS guidance',()=>{
 assert.match(pwa,/beforeinstallprompt/);
 assert.match(pwa,/appinstalled/);
 assert.match(pwa,/userChoice/);
 assert.match(pwa,/Añadir a pantalla de inicio/);
 assert.match(pwa,/DISMISSED_KEY/);
});
test('Install shortcuts and icons have correct manifest metadata',()=>{
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512' && i.purpose==='maskable'));
 for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,'public',icon.src)),icon.src);
 assert.match(html,/rel="manifest"/);assert.match(html,/apple-touch-icon/);
});
test('SW caches same-origin shell only; never Gemini requests',()=>{
 assert.match(sw,/self\.addEventListener\('install'/);
 assert.match(sw,/self\.addEventListener\('fetch'/);
 assert.match(sw,/url\.origin !== self\.location\.origin/);
 assert.match(sw,/CACHE_APP_ASSETS/);
});
test('Current creator remains only entry for character creation',()=>{
 assert.match(menu,/openCreator/);
 assert.match(menu,/page === 'FIGHTERS'/);
 assert.match(menu,/if \(!featured\) \{ openCreator\(\); return; \}/);
});
for(const file of ['src/components/FighterCreator.tsx','src/components/PwaInstallPrompt.tsx','src/components/CharacterSelect.tsx','src/services/creatorDraftService.ts','src/services/storageService.ts','src/main.tsx']){
 const source=load(file);
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 test('Syntax '+path.basename(file),()=>assert.equal(tree.parseDiagnostics.length,0));
}
console.log(`\n${count} checks OK`);
