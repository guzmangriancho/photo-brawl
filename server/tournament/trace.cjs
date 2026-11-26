'use strict';
/** Traza de reproducción de un combate de torneo: lo que hace falta para PINTAR la pelea (estado por fotograma con todos los efectos +
 *  eventos de sonido), sin tácticas, sin semilla y sin ningún dato del que se puedan derivar. El cliente la reproduce con
 *  applyNetworkState en lugar de recalcular el combate, así que no necesita las tácticas del rival antes de que se destapen.
 *  Los sonidos los dispara el motor dentro de step(): se graban sustituyendo temporalmente los métodos de su soundFX (el archivo
 *  archivado del motor no se toca). */
const zlib=require('node:zlib');
const sim=require('./sim.cjs');

/** Graba todo; devuelve {frames,rtw,states,sounds} con states[i] = delta respecto al fotograma anterior. */
function record(version,a,b,ta,tb,stage,difficulty,opts){
  const {spec,FightEngine,tactics}=sim.engine(version);
  const norm=tactics.normalizeCpuTactics;
  const rtw=version==='e1'?2:((opts&&opts.roundsToWin)||2);
  const seed=sim.fightSeed(spec.simVersion,a,b,stage,difficulty,ta,tb,norm,rtw);
  const sfxMod=require(spec.dir+'/engine/SoundFX.js');
  const fx=sfxMod.soundFX;
  let frame=0;const sounds=[];const saved={};
  const proto=Object.getPrototypeOf(fx);
  for(const k of Object.getOwnPropertyNames(proto)){
    if(k==='constructor'||typeof fx[k]!=='function')continue;
    if(/^(set|get|unlock|resume|init|stop|suspend)/i.test(k))continue;
    saved[k]=Object.prototype.hasOwnProperty.call(fx,k)?fx[k]:undefined;
    fx[k]=(...args)=>{sounds.push([frame,k,args.filter(x=>typeof x==='number'||typeof x==='string'||typeof x==='boolean')]);};
  }
  const states=[];
  try{
    const e=new FightEngine(a,b,'CPU_VS_CPU',stage,difficulty,{p1:norm(ta),p2:norm(tb)},seed);
    if(version!=='e1')e.roundsToWin=rtw;
    e.beginVersusIntro();
    const max=(opts&&opts.maxFrames)||sim.MAX_FRAMES;
    const prev={};
    while(!e.roundOver&&frame<max){
      e.step();frame++;
      const st=e.exportNetworkState();const d={};
      for(const key of Object.keys(st)){const j=JSON.stringify(st[key]);if(prev[key]!==j){prev[key]=j;d[key]=st[key];}}
      states.push(d);
    }
  }finally{
    for(const k of Object.keys(saved)){if(saved[k]===undefined)delete fx[k];else fx[k]=saved[k];}
  }
  return {frames:frame,rtw,states,sounds};
}
/** Cuerpo listo para enviar: JSON comprimido con gzip. Sin ganador ni marcador final explícitos: el cliente los ve al reproducir. */
function encode(trace){return zlib.gzipSync(JSON.stringify({v:1,frames:trace.frames,s:trace.states,x:trace.sounds}));}
module.exports={record,encode};
