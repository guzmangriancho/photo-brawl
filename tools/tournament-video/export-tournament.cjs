#!/usr/bin/env node
'use strict';
/* Baja un torneo terminado por su id usando SOLO la API que ya existe en el servidor online:
 *   GET /tournament/bracket?tournament=ID&round=N&offset=K   (lista de combates por ronda, de 40 en 40)
 *   GET /tournament/match?id=MATCH                            (combate destapado: luchadores, tacticas, semilla, resultado)
 * Modo servidor (preferido): PB_EXPORT_SECRET = VIDEO_EXPORT_SECRET del servidor (endpoint /tournament/export, solo torneos terminados).
 * Entorno: PB_API_BASE (URL del servidor online, sin barra final) y PB_TOKEN (access token de una cuenta de la app).
 * Ambos van por entorno/secretos, nunca por argumentos ni logs. Solo imprime contadores.
 * El servidor limita a 60 peticiones por minuto y cuenta, asi que se espacia (~1,1 s) y reintenta en 429.
 * Uso: node export-tournament.cjs TOURNAMENT_ID out.json */
const fs=require('fs');
const [,,tid,outp]=process.argv;
const BASE=(process.env.PB_API_BASE||'').replace(/\/+$/,''),TOKEN=process.env.PB_TOKEN||'',SECRET=process.env.PB_EXPORT_SECRET||'';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if(!UUID.test(tid||'')||!outp||!BASE||!(TOKEN||SECRET)){console.error('Uso: PB_API_BASE=... PB_TOKEN=... node export-tournament.cjs TOURNAMENT_ID out.json');process.exit(2);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const GAP=Number(process.env.PB_GAP_MS||1100);
async function get(p){
  for(let i=0;i<5;i++){
    await sleep(GAP);
    const r=await fetch(BASE+p,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(45000)});
    if(r.status===429){await sleep(20000);continue;}
    const d=await r.json().catch(()=>null);
    if(!r.ok)throw new Error('API '+r.status+' en '+p.split('?')[0]+': '+((d&&d.error)||'sin detalle'));
    return d;
  }
  throw new Error('Demasiados 429 en '+p.split('?')[0]);
}
(async()=>{
  if(SECRET){ // modo servidor: un solo GET a /tournament/export con secreto compartido (no hace falta cuenta de la app)
    for(let i=0;;i++){const r=await fetch(BASE+'/tournament/export?tournament='+tid,{headers:{'X-Export-Secret':SECRET},signal:AbortSignal.timeout(110000)});
      if(r.status===429&&i<4){await sleep(20000);continue;}
      const d=await r.json().catch(()=>null);if(!r.ok)throw new Error('API '+r.status+': '+((d&&d.error)||'sin detalle'));
      fs.writeFileSync(outp,JSON.stringify(d));console.log(`exportados ${Object.keys(d.matches).length} combates (modo servidor)`);return;}
  }
  const rounds={},matches={};let total=0;
  for(let round=1;;round++){
    const ids=[];let t=0;
    for(let off=0;;off+=40){
      const b=await get(`/tournament/bracket?tournament=${tid}&round=${round}&offset=${off}`);
      t=b.total;ids.push(...b.matches.map(m=>m.id));
      if(!b.matches.length||ids.length>=t)break;
    }
    if(!ids.length)break;
    rounds[round]=ids;total+=ids.length;
  }
  const rn=Object.keys(rounds).map(Number);
  if(!rn.length)throw new Error('El torneo no tiene combates destapados (id incorrecto o aun sin resultados).');
  const last=Math.max(...rn);
  if(rounds[last].length!==1)throw new Error('La ultima ronda destapada tiene '+rounds[last].length+' combates: el torneo no ha terminado, no se genera video.');
  for(const r of rn)for(const id of rounds[r]){matches[id]=await get('/tournament/match?id='+id);}
  fs.writeFileSync(outp,JSON.stringify({tournament:tid,rounds,matches}));
  console.log(`exportados ${total} combates en ${rn.length} rondas`);
})().catch(e=>{console.error(e.message);process.exit(1);});
