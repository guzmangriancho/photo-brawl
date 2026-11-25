#!/usr/bin/env node
'use strict';
/* Valida una exportacion ANTES de renderizar: vuelve a simular cada combate con el motor archivado de su version
 * (server/tournament/sim.cjs) y exige que coincida con lo guardado (ganador, marcador, frames, semilla).
 * Asi el video nunca reescribe la historia de un torneo. Uso: node validate.cjs export.json [--repo ../..]
 * Solo imprime contadores y errores; no escribe tacticas ni datos de cuentas. */
const fs=require('fs'),path=require('path');
const [,,inp,...rest]=process.argv;
const repo=path.resolve(rest[rest.indexOf('--repo')+1]||path.join(__dirname,'..','..'));
const sim=require(path.join(repo,'server/tournament/sim.cjs'));
const ex=JSON.parse(fs.readFileSync(inp,'utf8'));
let ok=0,bad=0,e1=0,e2=0;
for(const m of Object.values(ex.matches)){
  const rtw=m.roundsToWin??(m.engineVersion==='e1'?2:null);
  if(rtw==null){console.error('combate',m.id,': falta roundsToWin');bad++;continue;}
  const pa={...m.a.fighter,id:'a',spriteSheetDataUrl:'',portraitDataUrl:''},pb={...m.b.fighter,id:'b',spriteSheetDataUrl:'',portraitDataUrl:''};
  const r=sim.simulate(m.engineVersion,pa,pb,m.tacticsA,m.tacticsB,m.stage,m.difficulty,{roundsToWin:rtw});
  const same=r.winner===m.winner&&r.scoreA===m.scoreA&&r.scoreB===m.scoreB&&r.frames===m.frames&&String(r.seed)===String(m.seed);
  m.engineVersion==='e1'?e1++:e2++;
  if(same)ok++;else{bad++;console.error('combate',m.id,'ronda',m.round,': NO coincide con lo guardado (',m.engineVersion,'rtw',rtw,')');}
}
console.log(`validados ${ok} combates OK, ${bad} con problema (e1: ${e1}, e2: ${e2})`);
process.exit(bad?1:0);
