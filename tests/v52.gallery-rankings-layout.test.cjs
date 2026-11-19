'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const page=read('src/components/CommunityPage.tsx');
const social=read('src/components/community.css');
const leagues=read('src/components/LeagueEmblem.tsx');
const css=read('src/components/progression.css');

test('explorar mantiene seis luchadores paginados y dos columnas por tres filas en vertical',()=>{
  assert.match(page,/const PER_PAGE=6/);
  assert.match(social,/@media \(max-width:620px\) and \(orientation:portrait\)/);
  assert.match(social,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:max-content/);
  assert.match(social,/grid-template-rows:none;grid-auto-rows:max-content;align-content:start/);
  assert.match(social,/overflow-y:auto;overscroll-behavior:contain/); // V52 fallback on desktop; V53 overrides on mobile portrait.
  assert.match(page,/<strong title=\{f\.fighter_name\}>\{f\.fighter_name\}<\/strong>/);
});

test('los retratos son cuadrados y los nombres tienen espacio propio, sin letras en el marco',()=>{
  assert.match(social,/\.pb-community-card>\.pb-league-frame\{[\s\S]*?aspect-ratio:1;flex:0 0 auto/);
  assert.match(social,/\.pb-community-card>strong\{[\s\S]*?white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere/);
  assert.doesNotMatch(leagues,/pb-league-frame-stamp|league\.label\[0\]/);
  assert.doesNotMatch(css,/pb-league-frame-stamp/);
  assert.match(css,/\.pb-league-frame:before,\.pb-league-frame:after/);
});

test('ranking quita leyenda inferior y descripciones; botón abre las seis ligas con rangos',()=>{
  assert.doesNotMatch(page,/pb-rank-league-guide|pb-rank-explainer/);
  assert.match(page,/pb-rank-leagues-button/);
  assert.match(page,/aria-label="Ver ligas y rangos de copas"/);
  assert.match(page,/showLeagues&&<div className="pb-social-overlay/);
  assert.match(page,/LEAGUES\.map\(league=><div/);
  assert.match(page,/league\.min\.toLocaleString\('es-ES'\)/);
  assert.match(page,/league\.next===null\?'\+':/);
  assert.match(page,/event\.key==='Escape'/);
  assert.match(page,/SIN CLASIFICACIONES TODAVÍA/);
  assert.doesNotMatch(page,/SE CONSERVA EL HISTORIAL DE SIEMPRE|ROTAR PERSONAJES SUMA PROGRESO|LAS COPAS EMPIEZAN CON LA PRIMERA/);
});

test('ranking horizontal prioriza resultados y mantiene desplazamiento interno',()=>{
  assert.match(social,/@media \(orientation:landscape\) and \(max-height:500px\)/);
  assert.match(social,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-auto-rows:minmax\(48px,max-content\)/);
  assert.match(social,/\.pb-community-page \.pb-community-leaderboard\{[\s\S]*?overflow-y:auto;overscroll-behavior:contain/);
  assert.match(read('public/sw.js'),/pb-shell-v5[23]-/);
});

test('componentes TSX son sintácticamente válidos',()=>{
  const ts=require('typescript');
  for(const name of ['src/components/CommunityPage.tsx','src/components/LeagueEmblem.tsx']){
    const tree=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.equal(tree.parseDiagnostics.length,0,name);
  }
});
