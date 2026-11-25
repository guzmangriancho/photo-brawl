#!/usr/bin/env node
'use strict';
/* Convierte la exportación de un torneo terminado (el JSON con tournament/rounds/matches que devuelve el servidor)
 * en el spec que lee make.cjs. Descarga el arte de cada luchador (portraitUrl/sheetUrl) a <dir>/art.
 * Uso: node spec-from-export.cjs export.json spec.json [--repo ../..] */
const fs=require('fs'),path=require('path');
const [,,inp,outp,...rest]=process.argv;
const dayArg=rest.indexOf('--day')>=0?Number(rest[rest.indexOf('--day')+1]):null; // numero de dia: lo fija quien lanza el video
const repo=path.resolve(rest[rest.indexOf('--repo')+1]||path.join(__dirname,'..','..'));
// Antes de nada: el torneo guardado debe poder reproducirse tal cual (validate.cjs); si no, no se genera video.
require('child_process').execFileSync(process.execPath,[path.join(__dirname,'validate.cjs'),inp,'--repo',repo],{stdio:'inherit'});
const ex=JSON.parse(fs.readFileSync(inp,'utf8'));
const dir=path.dirname(path.resolve(outp)),artDir=path.join(dir,'art');fs.mkdirSync(artDir,{recursive:true});
const STAGE_IMG={SUNKEN_ATLANTIS:'atlantis',SPIRIT_FOREST:'forest',CELESTIAL_TEMPLE:'celestial',VOLCANIC_FORTRESS:'volcan',SKI_RESORT:'snow'};
async function dl(url,file){if(fs.existsSync(file))return;const r=await fetch(url);if(!r.ok)throw new Error('No se pudo bajar '+url+' ('+r.status+')');fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));}
(async()=>{
  const ms=Object.values(ex.matches).sort((a,b)=>a.round-b.round||a.slot-b.slot);
  if(!ms.length)throw new Error('El torneo no tiene combates.');
  const ev=[...new Set(ms.map(m=>m.engineVersion))];if(ev.length!==1)throw new Error('Torneo con varias versiones de motor: '+ev);
  const engineDir=path.join(repo,'server/tournament/archive',ev[0]);
  if(!fs.existsSync(engineDir))throw new Error('Falta el motor archivado '+ev[0]);
  const fighters={};
  for(const m of ms)for(const e of [m.a,m.b]){
    if(fighters[e.name])continue;
    const sheet=path.join(artDir,e.id+'_sheet.png'),portrait=path.join(artDir,e.id+'_portrait.png');
    await dl(e.sheetUrl,sheet);await dl(e.portraitUrl,portrait);
    fighters[e.name]={profile:{...e.fighter,id:e.id,fighterName:e.name},sheet,portrait};
  }
  const roundNos=[...new Set(ms.map(m=>m.round))],last=Math.max(...roundNos);
  const labelOf=r=>r===last?'LA FINAL':r===last-1?'SEMIFINALES':r===last-2?'CUARTOS DE FINAL':'RONDA '+r;
  const stages={};const rounds=[];
  for(const r of roundNos){
    const fs_=ms.filter(m=>m.round===r);const stage=fs_[0].stage;stages[stage]=path.join(repo,'public/backgrounds',(STAGE_IMG[stage]||'snow')+'.jpg');
    const rts=[...new Set(fs_.map(m=>m.roundsToWin??(m.engineVersion==='e1'?2:undefined)))];
    if(rts.length!==1||rts[0]==null)throw new Error('Ronda '+r+': roundsToWin ausente o mezclado ('+rts+'). La exportación de un torneo e2 debe incluir roundsToWin por combate.');
    const rtw=rts[0];
    for(let i=0;i<fs_.length;i+=6){ // como mucho 6 combates superpuestos por tramo
      const chunk=fs_.slice(i,i+6);
      rounds.push({id:'R'+r+'_'+i,label:labelOf(r),stage,rtw,spf:chunk.length>=4?6:chunk.length>=2?4:3,noFadeOut:r===last,
        fights:chunk.map(m=>({a:m.a.name,b:m.b.name,seed:m.seed,tacticsA:m.tacticsA,tacticsB:m.tacticsB}))});
    }
  }
  const final=ms.filter(m=>m.round===last)[0];
  const spec={font:path.join(__dirname,'assets/PressStart2P-Regular.ttf'),engineDir:engineDir,introStage:rounds[0].stage,introSeconds:4,outroSeconds:5,tournamentLabel:'TORNEO',tournamentDay:Number.isFinite(dayArg)?dayArg:undefined,
    difficulty:ms[0].difficulty,stages,fighters,rounds,champion:final.winner==='a'?final.a.name:final.b.name};
  fs.writeFileSync(outp,JSON.stringify(spec,null,1));console.log('spec escrito:',outp,'campeón',spec.champion,'tramos',rounds.length);
})().catch(e=>{console.error(e.message);process.exit(1)});
