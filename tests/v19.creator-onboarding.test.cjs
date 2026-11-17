const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname,'..');
const load = p => fs.readFileSync(path.join(root,p),'utf8');
const creator = load('src/components/FighterCreator.tsx');
const draft = load('src/services/creatorDraftService.ts');
const css = load('src/components/fighterCreator.css');
const prompts = load('src/services/fighterPrompts.ts');
const tests = [
  ['El modo guiado es el predeterminado',()=>assert.match(creator,/useState<CreatorMode>\('guided'\)/)],
  ['Sin key se puede copiar el prompt de análisis y pegar JSON',()=>{assert.match(creator,/COPIAR PROMPT DE FICHA/);assert.match(creator,/PEGAR JSON Y VALIDAR/);assert.match(creator,/parseFighterDesignJson\(json/)}],
  ['Hay dos proveedores oficiales y ambos abren en nueva pestaña',()=>{assert.match(creator,/https:\/\/gemini\.google\.com\/app/);assert.match(creator,/https:\/\/chatgpt\.com\//);assert.match(creator,/target="_blank" rel="noopener noreferrer"/)}],
  ['La API key es opcional, solo visible en modo automático',()=>{assert.match(creator,/mode==='guided'\s*\?/);assert.match(creator,/TENGO API KEY/);assert.match(creator,/GENERAR PERSONAJE COMPLETO/)}],
  ['Spritesheet y retrato tienen prompt e importación independiente',()=>{assert.match(creator,/showPrompt\(artStep\)/);assert.match(creator,/importImage\(artStep/);assert.match(creator,/SUBIR SPRITESHEET/);assert.match(creator,/SUBIR RETRATO/)}],
  ['Guía de cuatro pasos con navegación',()=>{assert.equal((creator.match(/title:'[1-4] · /g)||[]).length,4);assert.match(creator,/¿CÓMO SE HACE\?/);assert.match(creator,/pb-creator-help-dialog/)}],
  ['El borrador guarda modo y sigue siendo compatible con anteriores',()=>{assert.match(draft,/mode\?: 'guided' \| 'automatic'/);assert.match(creator,/draft\.mode === 'automatic' \? 'automatic' : 'guided'/);assert.match(creator,/latestDraft\.current = \{step,mode,/)}],
  ['Se conservan validación, procesamiento y guardado final',()=>{for(const v of ['parseFighterDesignJson','processSpriteSheet','processPortrait','saveCustomFighter','saveCreatorDraft','clearCreatorDraft'])assert.ok(creator.includes(v),v)}],
  ['Prompts conservan seis ataques y formato 4x4',()=>{assert.match(prompts,/CELL 13: Ultimate pose/);assert.match(prompts,/CELL 15:/);assert.match(prompts,/lightNormal/);assert.match(prompts,/ultimateSuper/)}],
  ['No hay scroll en el documento y los diálogos quedan limitados',()=>{assert.match(css,/\.pb-creator-body\{flex:1;min-height:0;overflow:hidden/);assert.match(css,/\.pb-creator-help-dialog\{[^}]*height:min/);assert.match(css,/@media \(orientation:landscape\) and \(max-height:430px\)/)}],
  ['TSX y TS son sintácticamente válidos',()=>{for(const file of ['src/components/FighterCreator.tsx','src/services/creatorDraftService.ts']){let source=load(file);let node=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(node.parseDiagnostics.length,0,node.parseDiagnostics.map(x=>x.messageText).join(','))}}],
];
for(const [name,run] of tests){run();console.log('✓',name)}
console.log(`OK: ${tests.length} comprobaciones del creador V19`);
