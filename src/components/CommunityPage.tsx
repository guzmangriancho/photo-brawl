import React, {useEffect, useState} from 'react';
import {ArrowLeft, ChevronLeft, ChevronRight, CloudUpload, Crown, Heart, LockKeyhole, Search, ShieldCheck, UserRound, UsersRound, X} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import {usePlayerAccount} from '../services/usePlayerAccount';
import {supabaseConfigured} from '../services/supabaseClient';
import {
  cloudEntry, fighterLikes, fighterPublicUrl, getPublicProfile, leaderboard, listCommunity,
  publishFighter, toggleFighterLike, unpublishFighter,
} from '../services/communityService';
import type {CommunityFighter, LeaderboardPlayer} from '../services/communityService';
import './community.css';

type Tab='ranking'|'explore'|'mine';
const PER_PAGE=6;
const moveNames=(fighter:CommunityFighter)=>{
  const m=fighter.fighter_data?.moveset;
  if(!m)return [];
  return [m.lightNormal,m.heavyNormal,m.specialNeutral,m.specialForward,m.specialUp,m.ultimateSuper]
    .map((v,i)=>({label:['GOLPE','FUERTE','TÉCNICA','AVANCE','ANTIAÉREO','SÚPER'][i],name:v?.name||'—'}));
};
const textError=(error:unknown)=>error instanceof Error?error.message:'No se ha podido contactar con Supabase.';

interface Props {
  initialTab:'ranking'|'explore';
  fighters:FighterProfile[];
  onAccount:()=>void;
}

/** The same data-driven screen serves the leaderboard and the public fighter gallery.
 *  Nothing in this screen starts a match or changes a local character automatically. */
export function CommunityPage({initialTab,fighters,onAccount}:Props){
  const {user,loading:authLoading}=usePlayerAccount();
  const [tab,setTab]=useState<Tab>(initialTab);
  const [leaders,setLeaders]=useState<LeaderboardPlayer[]>([]);
  const [peoplePage,setPeoplePage]=useState(0);
  const [list,setList]=useState<CommunityFighter[]>([]);
  const [page,setPage]=useState(0);
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [myPage,setMyPage]=useState(0);
  const [published,setPublished]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState('');
  const [isLoading,setIsLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [detail,setDetail]=useState<CommunityFighter|null>(null);
  const [likes,setLikes]=useState({count:0,liked:false});
  const [author,setAuthor]=useState<{player:LeaderboardPlayer|null;fighters:CommunityFighter[]}|null>(null);

  useEffect(()=>{setTab(initialTab);setError('');setNotice('');},[initialTab]);
  useEffect(()=>{
    if(!supabaseConfigured || (tab!=='ranking' && tab!=='explore'))return;
    let alive=true;
    setIsLoading(true);setError('');
    const request=tab==='ranking'?leaderboard():listCommunity(query,page,PER_PAGE);
    void request.then(items=>{
      if(!alive)return;
      if(tab==='ranking')setLeaders(items as LeaderboardPlayer[]);
      else setList(items as CommunityFighter[]);
    }).catch(err=>{if(alive)setError(textError(err));}).finally(()=>{if(alive)setIsLoading(false);});
    return()=>{alive=false;};
  },[tab,page,query]);
  useEffect(()=>{
    if(!supabaseConfigured || tab!=='mine' || !user)return;
    let alive=true;
    const visible=fighters.slice(myPage*PER_PAGE,(myPage+1)*PER_PAGE);
    setIsLoading(true);
    void Promise.all(visible.map(f=>cloudEntry(f.id)))
      .then(rows=>{if(alive)setPublished(Object.fromEntries(rows.map((row,i)=>[visible[i].id,Boolean(row?.is_public)])));})
      .catch(err=>{if(alive)setError(textError(err));})
      .finally(()=>{if(alive)setIsLoading(false);});
    return()=>{alive=false;};
  },[tab,user?.id,myPage,fighters]);
  useEffect(()=>{
    if(!detail)return;
    let alive=true;
    void fighterLikes(detail.id,user?.id).then(result=>{if(alive)setLikes(result);})
      .catch(err=>{if(alive)setError(textError(err));});
    return()=>{alive=false;};
  },[detail?.id,user?.id]);

  const showDetail=(fighter:CommunityFighter)=>{setError('');setDetail(fighter);setAuthor(null);};
  const openAuthor=async(owner:string)=>{
    setBusy('author');setError('');
    try{setAuthor(await getPublicProfile(owner));setDetail(null);}
    catch(err){setError(textError(err));}finally{setBusy('');}
  };
  const changePublication=async(fighter:FighterProfile)=>{
    if(!user){onAccount();return;}
    if(busy)return;
    const visible=Boolean(published[fighter.id]);
    if(!visible && !window.confirm(`¿Publicar «${fighter.fighterName}»? Otros jugadores podrán ver su retrato, sprites y movimientos. No se publicará tu fotografía original.`))return;
    setBusy(fighter.id);setNotice('');setError('');
    try{
      if(visible)await unpublishFighter(fighter);
      else await publishFighter(fighter);
      setPublished(previous=>({...previous,[fighter.id]:!visible}));
      setNotice(visible?'Personaje ocultado de la comunidad. Sigue guardado en tu dispositivo.':'Personaje publicado. Ya pueden verlo otros jugadores.');
    }catch(err){setError(textError(err));}finally{setBusy('');}
  };
  const changeLike=async()=>{
    if(!detail)return;
    if(!user){onAccount();return;}
    if(detail.owner_id===user.id)return;
    setBusy('like');setError('');
    try{await toggleFighterLike(detail.id,likes.liked);setLikes(p=>({liked:!p.liked,count:Math.max(0,p.count+(p.liked?-1:1))}));}
    catch(err){setError(textError(err));}finally{setBusy('');}
  };
  const current=leaders.slice(peoplePage*10,peoplePage*10+10);
  const mine=fighters.slice(myPage*PER_PAGE,(myPage+1)*PER_PAGE);

  return <section className="pb-subpage pb-frame pb-community-page pb-page-anim" aria-label="Comunidad PHOTO BRAWL">
    <div className="pb-community-top"><div><small>PHOTO BRAWL · CONECTADO A SUPABASE</small><h2>{tab==='ranking'?'CLASIFICACIÓN ONLINE':tab==='mine'?'MIS PUBLICACIONES':'COMUNIDAD DE LUCHADORES'}</h2></div><button type="button" className="pb-community-account" onClick={onAccount}><UserRound size={15}/>{user?'MI CUENTA':'ENTRAR'}</button></div>
    <nav className="pb-community-tabs pb-community-tabs-three" aria-label="Secciones de la comunidad">
      <button className={tab==='ranking'?'active':''} onClick={()=>{setTab('ranking');setError('');}}><Crown size={15}/> RANKING</button>
      <button className={tab==='explore'?'active':''} onClick={()=>{setTab('explore');setError('');}}><UsersRound size={15}/> EXPLORAR</button>
      <button className={tab==='mine'?'active':''} onClick={()=>{setTab('mine');setError('');}}><CloudUpload size={15}/> PUBLICAR</button>
    </nav>
    {!supabaseConfigured?<div className="pb-community-empty"><div><LockKeyhole size={27}/><p>SUPABASE SIN CONFIGURAR</p><small>Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel y vuelve a desplegar. Tus luchadores locales están a salvo.</small></div></div>:
    tab==='ranking'?<>
      <div className="pb-community-info"><span><Crown size={13}/> Clasificación real · sin jugadores inventados</span><button type="button" onClick={()=>{setTab('explore');setError('');}}>VER LUCHADORES <ChevronRight size={14}/></button></div>
      <div className="pb-community-leaderboard">{current.length?current.map((p,i)=><button className={`pb-rank-entry ${i+peoplePage*10<3?'podium':''}`} type="button" key={p.id} onClick={()=>void openAuthor(p.id)}><b>#{peoplePage*10+i+1}</b><span><strong>{p.display_name||p.username||'JUGADOR'}</strong><small>@{p.username} · {p.wins} V / {p.losses} D</small></span><em>{p.rating} ELO</em></button>):<div className="pb-community-empty">{isLoading?'CARGANDO CLASIFICACIÓN…':'AÚN NO HAY RESULTADOS CLASIFICATORIOS. LAS SALAS AMISTOSAS NO SUMAN ELO.'}</div>}</div>
      <div className="pb-community-pages"><button type="button" disabled={!peoplePage} onClick={()=>setPeoplePage(n=>n-1)} aria-label="Anterior página"><ChevronLeft size={15}/></button><span>{peoplePage+1} / {Math.max(1,Math.ceil(leaders.length/10))}</span><button type="button" disabled={(peoplePage+1)*10>=leaders.length} onClick={()=>setPeoplePage(n=>n+1)} aria-label="Siguiente página"><ChevronRight size={15}/></button></div>
    </>:tab==='explore'?<>
      <form className="pb-community-search" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search);}}><input value={search} maxLength={40} placeholder="Buscar luchadores públicos…" onChange={e=>setSearch(e.target.value)} aria-label="Buscar luchadores"/><button type="submit"><Search size={15}/> BUSCAR</button></form>
      <div className="pb-community-grid">{list.length?list.map(f=><button type="button" className="pb-community-card" key={f.id} onClick={()=>showDetail(f)}><img src={fighterPublicUrl(f.public_portrait_path)} alt="" loading="lazy"/><strong>{f.fighter_name}</strong><small>{f.player_profiles?.display_name||'JUGADOR'}</small></button>):<div className="pb-community-empty">{isLoading?'BUSCANDO PERSONAJES…':'TODAVÍA NO HAY LUCHADORES PUBLICADOS. ¡COMPARTE UNO DE LOS TUYOS!'}</div>}</div>
      <div className="pb-community-pages"><button type="button" disabled={!page} onClick={()=>setPage(n=>n-1)} aria-label="Página anterior"><ChevronLeft size={15}/></button><span>PÁGINA {page+1}</span><button type="button" disabled={list.length<PER_PAGE} onClick={()=>setPage(n=>n+1)} aria-label="Página siguiente"><ChevronRight size={15}/></button></div>
    </>:<>
      <div className="pb-community-info"><span><ShieldCheck size={13}/> La nube es privada hasta que publiques expresamente</span>{!user&&<button type="button" onClick={onAccount}>INICIAR SESIÓN <ChevronRight size={14}/></button>}</div>
      <div className="pb-community-grid pb-my-community-grid">{mine.length?mine.map(f=><article className="pb-community-card pb-my-community-card" key={f.id}><img src={f.portraitDataUrl} alt=""/><strong>{f.fighterName}</strong><button type="button" disabled={Boolean(busy)||authLoading} className={published[f.id]?'pb-published':''} onClick={()=>void changePublication(f)}>{busy===f.id?'GUARDANDO…':published[f.id]?'OCULTAR':'PUBLICAR'}</button></article>):<div className="pb-community-empty">NO TIENES LUCHADORES. CREA UNO DESDE EL MENÚ PRINCIPAL Y VUELVE AQUÍ PARA PUBLICARLO.</div>}</div>
      <div className="pb-community-pages"><button type="button" disabled={!myPage} onClick={()=>setMyPage(n=>n-1)} aria-label="Página anterior"><ChevronLeft size={15}/></button><span>{myPage+1} / {Math.max(1,Math.ceil(fighters.length/PER_PAGE))}</span><button type="button" disabled={(myPage+1)*PER_PAGE>=fighters.length} onClick={()=>setMyPage(n=>n+1)} aria-label="Página siguiente"><ChevronRight size={15}/></button></div>
    </>}
    {(error||notice)&&<p role={error?'alert':'status'} className={error?'pb-community-error-message':'pb-community-notice'}>{error||notice}</p>}
    {detail&&<div className="pb-social-overlay pb-community-detail-layer" onPointerDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}><section className="pb-social-dialog pb-community-detail pb-frame" role="dialog" aria-modal="true" aria-label={`Ficha de ${detail.fighter_name}`}>
      <header className="pb-social-heading"><strong>{detail.fighter_name}</strong><button type="button" aria-label="Cerrar" onClick={()=>setDetail(null)}><X size={18}/></button></header>
      <div className="pb-community-detail-main"><img src={fighterPublicUrl(detail.public_portrait_path)} alt="Retrato del luchador"/><div><b>{detail.fighter_data?.subtitle||detail.archetype}</b><small>{detail.archetype} · {detail.fighter_data?.passiveTrait||'SIN PASIVA'}</small><p>HP {detail.fighter_data?.stats?.hp} · SPD {detail.fighter_data?.stats?.speed} · PWR {detail.fighter_data?.stats?.power} · TEC {detail.fighter_data?.stats?.technique}</p><button type="button" onClick={()=>void openAuthor(detail.owner_id)}><UserRound size={13}/> VER PERFIL DEL CREADOR</button></div></div>
      <div className="pb-community-moves">{moveNames(detail).map(m=><span key={m.label}>{m.label}: {m.name}</span>)}</div>
      <div className="pb-social-actions"><button type="button" disabled={Boolean(busy)||user?.id===detail.owner_id} onClick={()=>void changeLike()}><Heart size={15} fill={likes.liked?'currentColor':'none'}/> {likes.count} · {likes.liked?'YA TE GUSTA':'ME GUSTA'}</button><button type="button" onClick={()=>setDetail(null)}><ArrowLeft size={14}/> VOLVER</button></div>
    </section></div>}
    {author&&<div className="pb-social-overlay pb-community-detail-layer" onPointerDown={e=>{if(e.target===e.currentTarget)setAuthor(null);}}><section className="pb-social-dialog pb-community-detail pb-frame" role="dialog" aria-modal="true" aria-label="Perfil público del jugador">
      <header className="pb-social-heading"><strong><UserRound size={17}/> {author.player?.display_name||'JUGADOR'}</strong><button type="button" aria-label="Cerrar" onClick={()=>setAuthor(null)}><X size={18}/></button></header>
      <div className="pb-community-author-summary">@{author.player?.username||'jugador'} · {author.player?.rating??1000} ELO · {author.player?.wins??0} V / {author.player?.losses??0} D</div>
      <div className="pb-community-author-grid">{author.fighters.length?author.fighters.slice(0,6).map(f=><button key={f.id} type="button" onClick={()=>{setAuthor(null);showDetail(f);}}><img src={fighterPublicUrl(f.public_portrait_path)} alt=""/><small>{f.fighter_name}</small></button>):<p>Este jugador todavía no ha publicado luchadores.</p>}</div>
      <div className="pb-social-actions"><button type="button" onClick={()=>setAuthor(null)}><ArrowLeft size={14}/> VOLVER</button></div>
    </section></div>}
  </section>;
}
