'use strict';
/** Simulación de un combate de torneo. Versionada: el torneo guarda engine_version y sim_version.
 * El motor se carga SIEMPRE desde su copia inmutable en archive/eN, nunca desde server/runtime. */
const ENGINES={e1:{simVersion:1,dir:'./archive/e1'}};
const CURRENT_ENGINE='e1';
const cache={};
function engine(version){
  const spec=ENGINES[version];
  if(!spec)throw new Error('Versión de motor de torneo desconocida: '+version);
  if(!cache[version])cache[version]={spec,FightEngine:require(spec.dir+'/engine/FightEngine.js').FightEngine,
    tactics:require(spec.dir+'/engine/cpuTactics.js')};
  return cache[version];
}
function stable(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v)??'null';
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
function hash32(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;}
function fingerprint(p){
  return hash32(stable({archetype:p.archetype,stats:p.stats,moveset:p.moveset,passiveTrait:p.passiveTrait,scaleMultiplier:p.scaleMultiplier})).toString(16).padStart(8,'0');
}
/** Igual que cpuFightSeed de src/engine/fightSeed.ts (probado en tests/v66). */
function fightSeed(simVersion,p1,p2,stage,difficulty,t1,t2,norm){
  return hash32(stable({v:simVersion,p1:fingerprint(p1),p2:fingerprint(p2),stage,difficulty,tactics:{p1:norm(t1),p2:norm(t2)}}));
}
// Más de ~10 minutos de combate (36000 pasos) no es un combate normal: el motor repite rondas empatadas sin límite.
const MAX_FRAMES=60*60*10;
/** Devuelve {winner:'a'|'b',scoreA,scoreB,frames,decidedBy,seed}. Desempate fijo y acotado: rondas, vida restante, semilla. */
function simulate(version,a,b,ta,tb,stage,difficulty,opts){
  const maxFrames=(opts&&opts.maxFrames)||MAX_FRAMES;
  const {spec,FightEngine,tactics}=engine(version);
  const norm=tactics.normalizeCpuTactics;
  const seed=fightSeed(spec.simVersion,a,b,stage,difficulty,ta,tb,norm);
  const e=new FightEngine(a,b,'CPU_VS_CPU',stage,difficulty,{p1:norm(ta),p2:norm(tb)},seed);
  e.beginVersusIntro();
  let f=0;
  while(!e.roundOver&&f<maxFrames){e.step();f++;}
  const sa=e.p1RoundWins,sb=e.p2RoundWins;
  if(e.roundOver&&sa!==sb)return {winner:sa>sb?'a':'b',scoreA:sa,scoreB:sb,frames:f,decidedBy:'ko',seed};
  let w;
  if(sa!==sb)w=sa>sb?'a':'b';
  else{const ra=e.p1.hp/e.p1.maxHp,rb=e.p2.hp/e.p2.maxHp;w=ra!==rb?(ra>rb?'a':'b'):(seed&1?'a':'b');}
  return {winner:w,scoreA:sa,scoreB:sb,frames:f,decidedBy:'cap',seed};
}
module.exports={ENGINES,CURRENT_ENGINE,simulate,fightSeed,fingerprint,hash32,stable,MAX_FRAMES,engine};
