'use strict';
/* Prueba de extremo a extremo contra Postgres + PostgREST locales (no entra en `npm test`: ver run.sh).
 * Un https falso hace de Supabase (auth, storage) y reenvía /rest/v1 a PostgREST. */
const https=require('node:https'),http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const D=process.env.PGT||'/tmp/pgt';
const JWT=fs.readFileSync(D+'/service.jwt','utf8').trim();
const N=Number(process.env.N||21);
const art=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcLQAAAABJRU5ErkJggg==','base64');
const stored=new Set();
const facade=https.createServer({key:fs.readFileSync(D+'/key.pem'),cert:fs.readFileSync(D+'/cert.pem')},(req,res)=>{
  const u=new URL(req.url,'https://x');
  if(u.pathname==='/auth/v1/user'){const t=(req.headers.authorization||'').replace('Bearer user-','');
    if(!/^[0-9a-f-]{36}$/.test(t)){res.writeHead(401);return res.end('{}');}
    res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({id:t}));}
  if(u.pathname.startsWith('/storage/v1/object/fighter-private/')){res.writeHead(200,{'Content-Type':'image/png'});return res.end(art);}
  if(u.pathname.startsWith('/storage/v1/object/tournament-fighters/')&&req.method==='POST'){stored.add(u.pathname);req.resume();req.on('end',()=>{res.writeHead(200);res.end('{}');});return;}
  if(u.pathname.startsWith('/rest/v1/')){
    const p=http.request({host:'localhost',port:3000,path:u.pathname.replace('/rest/v1','')+u.search,method:req.method,headers:{...req.headers,host:'localhost:3000'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    req.pipe(p);return;}
  res.writeHead(404);res.end();
});
const rest=(path,opt={})=>fetch('http://localhost:3000/'+path,{method:opt.method||'GET',headers:{Authorization:'Bearer '+JWT,'Content-Type':'application/json',Prefer:'return=representation'},body:opt.body&&JSON.stringify(opt.body)}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(path+' '+r.status+' '+t);return t?JSON.parse(t):null;});
const MV={lightNormal:{name:'P',style:'FAST_JAB'},heavyNormal:{name:'G',style:'LONG_ROUNDHOUSE'},specialNeutral:{name:'B',mechanic:'STRAIGHT_FIREBALL',visualAction:'x',primaryHex:'#40d9f5'},specialForward:{name:'I',mechanic:'SLIDE_LOW_KICK',visualAction:'x'},specialUp:{name:'S',mechanic:'INVINCIBLE_UPPERCUT',visualAction:'x'},ultimateSuper:{name:'O',mechanic:'GIANT_BEAM_LASER',visualAction:'x'}};
const ARCH=['RUSHDOWN','GRAPPLER_TANK','ZONER_MAGE','TRICKSTER','SHOTO_BALANCED'];
function stats(i){const hp=22+i%7,sp=22+(i*3)%7,pw=22+(i*5)%7;return {hp,speed:sp,power:pw,technique:100-hp-sp-pw};}
(async()=>{
  await new Promise(r=>facade.listen(8443,r));
  const env={...process.env,PORT:'8788',SUPABASE_URL:'https://localhost:8443',SUPABASE_SECRET_KEY:JWT,SUPABASE_PUBLISHABLE_KEY:'pub-key-for-tests-xxxxxxxxxxxx',NODE_TLS_REJECT_UNAUTHORIZED:'0',TOURNAMENT_MIN_GAP_MS:'0',TOURNAMENT_TICK_LIMIT:'100000',TOURNAMENT_API_LIMIT:'1000000',ONLINE_ALLOWED_ORIGINS:'http://localhost:5173'};
  const srv=spawn('node',['server/index.cjs'],{env,stdio:['ignore','pipe','pipe']});
  let slog='';srv.stdout.on('data',d=>slog+=d);srv.stderr.on('data',d=>slog+=d);
  const API='http://localhost:8788';
  const call=async(path,{method='GET',token,body}={})=>{const r=await fetch(API+path,{method,headers:{...(token?{Authorization:'Bearer user-'+token}:{}),'Content-Type':'application/json'},body:body&&JSON.stringify(body)});return {status:r.status,json:await r.json().catch(()=>null)};};
  try{
    for(let i=0;i<30;i++){try{const r=await fetch(API+'/health');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
    const health=await (await fetch(API+'/health')).json();assert.equal(health.tournaments,true);
    await rest('tournaments?id=not.is.null',{method:'DELETE'});await rest('fighters?id=not.is.null',{method:'DELETE'});await rest('player_profiles?id=not.is.null',{method:'DELETE'});
    const players=[];
    for(let i=0;i<N;i++){
      const [p]=await rest('player_profiles',{method:'POST',body:{}});
      const data={id:'f'+i,fighterName:'Luchador '+i,archetype:ARCH[i%5],passiveTrait:'DOUBLE_JUMP',traitDescription:'t',subtitle:'s',stats:stats(i),moveset:MV,visualDescriptionForSprite:'v',createdAt:1,scaleMultiplier:1};
      await rest('fighters',{method:'POST',body:{owner_id:p.id,local_id:'f'+i,fighter_name:'Luchador '+i,archetype:data.archetype,fighter_data:data,private_portrait_path:p.id+'/a/portrait.png',private_sheet_path:p.id+'/a/sheet.png'}});
      players.push(p.id);
    }
    // sin torneo: nadie puede apuntarse
    assert.equal((await call('/tournament/join',{method:'POST',token:players[0],body:{fighterLocalId:'f0'}})).status,400);
    assert.equal((await call('/tournament/state')).status,400,'sin sesión se rechaza');
    const [t]=await rest('tournaments',{method:'POST',body:{registration_closes_at:new Date(Date.now()+3600e3).toISOString(),window_minutes:1,registration_minutes:1,auto_next:true}});
    // inscripción
    assert.equal((await call('/tournament/join',{method:'POST',token:players[0],body:{fighterLocalId:'f0',instagram:'no válido!'}})).status,400);
    assert.equal((await call('/tournament/join',{method:'POST',token:players[0],body:{fighterLocalId:'f_otro'}})).status,400,'luchador ajeno/inexistente');
    for(let i=0;i<N;i++){const r=await call('/tournament/join',{method:'POST',token:players[i],body:{fighterLocalId:'f'+i,instagram:i===1?'@amigo_1':'',videoConsent:i===1}});assert.equal(r.status,200,JSON.stringify(r.json));}
    await call('/tournament/join',{method:'POST',token:players[2],body:{fighterLocalId:'f2'}}); // re-inscribirse sustituye, no duplica
    assert.equal((await rest('tournament_entries?select=id&tournament_id=eq.'+t.id)).length,N);
    assert.ok(stored.size>=2*N);
    let st=(await call('/tournament/state',{token:players[0]})).json;
    assert.equal(st.tournament.status,'registration');assert.equal(st.tournament.entrantCount,N);assert.equal(st.myMatch,null);
    // cierre
    await rest('tournaments?id=eq.'+t.id,{method:'PATCH',body:{registration_closes_at:new Date(Date.now()-1000).toISOString()}});
    await Promise.all(Array.from({length:8},()=>call('/tournament/tick')));
    st=(await call('/tournament/state',{token:players[0]})).json;
    assert.equal(st.tournament.status,'round_open');assert.equal(st.tournament.roundNo,1);
    assert.equal((await call('/tournament/join',{method:'POST',token:players[0],body:{fighterLocalId:'f0'}})).status,400,'tarde: rechazado');
    let P=players[0];for(const q of players){const s2=(await call('/tournament/state',{token:q})).json;if(s2.myMatch){P=q;st=s2;break;}}
    assert.ok(st.myMatch,'veo a mi rival');assert.equal(st.myMatch.opponent.fighter.stats.hp>0,true);
    const leak=JSON.stringify(st.myMatch);assert.ok(!/tactics/i.test(leak),'sin tácticas del rival: '+leak.slice(0,300));
    // tácticas: mías sí, ritmo limitado
    let r=await call('/tournament/tactics',{method:'POST',token:P,body:{tactics:{distance:90}}});assert.equal(r.status,200);
    r=await call('/tournament/tactics',{method:'POST',token:P,body:{tactics:{distance:10}}});assert.equal(r.status,400,'demasiado rápido');
    await new Promise(r=>setTimeout(r,1100));
    r=await call('/tournament/tactics',{method:'POST',token:P,body:{tactics:{distance:70}}});assert.equal(r.status,200);
    // ronda sin cortar: el combate no se puede ver
    assert.equal((await call('/tournament/match?id='+st.myMatch.id,{token:P})).status,400);
    // CORTE y edición posterior: no debe afectar a la ronda cortada
    await rest('tournaments?id=eq.'+t.id,{method:'PATCH',body:{round_cutoff:new Date(Date.now()-1000).toISOString()}});
    assert.equal((await rest('rpc/pb_tournament_cut_round',{method:'POST',body:{p_id:t.id}})),true);
    assert.equal((await rest('rpc/pb_tournament_cut_round',{method:'POST',body:{p_id:t.id}})),false,'segundo corte no hace nada');
    const frozen=(await rest('tournament_matches?select=*&id=eq.'+st.myMatch.id))[0];
    const mineIsA=st.myMatch.youAre==='a';
    assert.equal(Math.round((mineIsA?frozen.tactics_a:frozen.tactics_b).distance),70);
    await new Promise(r=>setTimeout(r,1100));
    assert.equal((await call('/tournament/tactics',{method:'POST',token:P,body:{tactics:{distance:5}}})).status,200);
    assert.equal(Math.round((await rest('tournament_matches?select=*&id=eq.'+st.myMatch.id))[0][mineIsA?'tactics_a':'tactics_b'].distance),70,'la edición posterior no reescribe el corte');
    // resto del torneo
    const sim=require('../../server/tournament/sim.cjs'),{normalizeCpuTactics}=require('../../server/runtime/engine/cpuTactics.js');
    let guard=0,t0=Date.now();
    for(;;){
      if(guard++>40)throw new Error('no termina');
      const [cur]=await rest('tournaments?select=status,round_no&id=eq.'+t.id);
      if(cur.status==='finished')break;
      if(cur.status==='round_open')await rest('tournaments?id=eq.'+t.id,{method:'PATCH',body:{round_cutoff:new Date(Date.now()-1000).toISOString()}});
      const tk=await Promise.all([call('/tournament/tick'),call('/tournament/tick'),call('/tournament/tick')]);if(process.env.DBG)console.log(cur.status,cur.round_no,JSON.stringify(tk.map(x=>x.json)));
    }
    const ms=Date.now()-t0;
    const [fin]=await rest('tournaments?select=*&id=eq.'+t.id);
    assert.equal(fin.status,'finished');assert.ok(fin.champion_entry_id);
    const ms_all=await rest('tournament_matches?select=*&tournament_id=eq.'+t.id);
    assert.equal(ms_all.length,N-1);assert.ok(ms_all.every(m=>m.status==='resolved'&&m.winner_entry&&m.engine_version==='e1'&&m.sim_version===1));
    assert.equal((await rest('tournament_entries?select=id&status=eq.champion&tournament_id=eq.'+t.id)).length,1);
    // un solo ganador por combate y cada ganador pasa: nadie juega dos veces en la misma ronda
    for(let rd=1;rd<=fin.round_count;rd++){const ids=ms_all.filter(m=>m.round_no===rd).flatMap(m=>[m.entry_a,m.entry_b]);assert.equal(new Set(ids).size,ids.length);}
    // siguiente torneo abierto automáticamente
    const next=await rest('tournaments?select=*&status=eq.registration');assert.equal(next.length,1);
    // detalle y recreación determinista de un combate
    st=(await call('/tournament/state',{token:P})).json;
    const sample=ms_all[ms_all.length-1];
    const d=(await call('/tournament/match?id='+sample.id,{token:players[3]})).json;
    assert.ok(d&&d.a&&d.b&&d.tacticsA);
    const again=sim.simulate(d.engineVersion==='e1'?'e1':'e1',{...d.a.fighter,id:'a'},{...d.b.fighter,id:'b'},d.tacticsA,d.tacticsB,d.stage,d.difficulty);
    assert.equal(again.winner,d.winner);assert.equal(again.frames,d.frames);assert.equal(again.seed,d.seed);
    const br=(await call('/tournament/bracket?tournament='+t.id+'&round=1',{token:P})).json;assert.ok(br.matches.length>0);
    console.log(JSON.stringify({ok:true,players:N,rounds:fin.round_count,matches:ms_all.length,seconds:ms/1000,decidedByCap:ms_all.filter(m=>m.decided_by==='cap').length,msPerFight:Math.round(ms/ms_all.length)}));
  }catch(e){console.error('FALLO',e);console.error(slog.slice(-1500));process.exitCode=1;}
  finally{srv.kill();facade.close();}
})();
