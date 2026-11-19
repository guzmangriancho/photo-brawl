import React, {useEffect, useState} from 'react';
import {ArrowLeft, ChevronLeft, ChevronRight, CloudUpload, Crown, Heart, LockKeyhole, Search, ShieldCheck, UserRound, UsersRound, X} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import {usePlayerAccount} from '../services/usePlayerAccount';
import {supabaseConfigured} from '../services/supabaseClient';
import {
  cloudEntry, fighterLikes, fighterPublicUrl, getPublicProfile, leaderboard, listAllFightersForAdmin, listCommunity,
  publishFighter, toggleFighterLike, unpublishFighter,
} from '../services/communityService';
import type {CommunityFighter, LeaderboardPlayer} from '../services/communityService';
import {CommunityArtwork} from './CommunityArtwork';
import {LeagueFrame,LeagueBadge} from './LeagueEmblem';
import {duoLeaderboard,fighterLeaderboard,fighterCupsById,LEAGUES} from '../services/progressionService';
import type {DuoRank,FighterRank} from '../services/progressionService';
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
  adminView?:boolean;
  fighters:FighterProfile[];
  onAccount:()=>void;
}

/** The same data-driven screen serves the leaderboard and the public fighter gallery.
 *  Nothing in this screen starts a match or changes a local character automatically. */
export function CommunityPage({initialTab,fighters,onAccount,adminView=false}:Props){
  const {user,loading:authLoading}=usePlayerAccount();
  const [tab,setTab]=useState<Tab>(initialTab);
  const [leaders,setLeaders]=useState<LeaderboardPlayer[]>([]);
  const [rankMode,setRankMode]=useState<'global'|'fighter'|'duo'>('global');
  const [fighterLeaders,setFighterLeaders]=useState<FighterRank[]>([]);
  const [duoLeaders,setDuoLeaders]=useState<DuoRank[]>([]);
  const [fighterCups,setFighterCups]=useState<Record<string,number>>({});
  const [peoplePage,setPeoplePage]=useState(0);
  const [listState,setListState]=useState<{admin:boolean;items:CommunityFighter[]}>({admin:false,items:[]});
  // No renderizar resultados privados cacheados tras cerrar sesión o apagar el modo.
  const list=listState.admin===adminView?listState.items:[];
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
  const [detailArt,setDetailArt]=useState<'portrait'|'sheet'>('portrait');
  const [likes,setLikes]=useState({count:0,liked:false});
  const [author,setAuthor]=useState<{player:LeaderboardPlayer|null;fighters:CommunityFighter[]}|null>(null);

  useEffect(()=>{setTab(initialTab);setError('');setNotice('');},[initialTab]);
  useEffect(()=>{setPage(0);setDetail(null);setAuthor(null);setListState({admin:adminView,items:[]});},[adminView]);
  useEffect(()=>{
    if(!supabaseConfigured || (tab!=='ranking' && tab!=='explore'))return;
    let alive=true;
    setIsLoading(true);setError('');
    const request=tab==='ranking'?(rankMode==='fighter'?fighterLeaderboard():rankMode==='duo'?duoLeaderboard():leaderboard()):adminView?listAllFightersForAdmin(query,page,PER_PAGE):listCommunity(query,page,PER_PAGE);
    void request.then(items=>{
      if(!alive)return;
      if(tab==='ranking'){
        if(rankMode==='fighter')setFighterLeaders(items as FighterRank[]);
        else if(rankMode==='duo')setDuoLeaders(items as DuoRank[]);
        else setLeaders(items as LeaderboardPlayer[]);
      }
      else setListState({admin:adminView,items:items as CommunityFighter[]});
    }).catch(err=>{if(alive)setError(textError(err));}).finally(()=>{if(alive)setIsLoading(false);});
    return()=>{alive=false;};
  },[tab,page,query,adminView,rankMode]);
  useEffect(()=>{
    if(tab!=='explore'||!list.length)return;
    let alive=true;
    void fighterCupsById(list.map(f=>f.id)).then(cups=>{if(alive)setFighterCups(prev=>({...prev,...cups}));}).catch(()=>{});
    return()=>{alive=false;};
  },[tab,listState]);
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

  const showDetail=(fighter:CommunityFighter)=>{setError('');setDetailArt('portrait');setDetail(fighter);setAuthor(null);};
  const openAuthor=async(owner:string)=>{
    setBusy('author');setError('');
    try{const profile=await getPublicProfile(owner);setAuthor(profile);setDetail(null);
      const cups=await fighterCupsById(profile.fighters.map(f=>f.id));setFighterCups(old=>({...old,...cups}));}
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
  const rankingEntries=rankMode==='global'?leaders:rankMode==='fighter'?fighterLeaders:duoLeaders;
  const current=leaders.slice(peoplePage*10,peoplePage*10+10);
  const currentFighters=fighterLeaders.slice(peoplePage*10,peoplePage*10+10);
  const currentDuos=duoLeaders.slice(peoplePage*10,peoplePage*10+10);
  const mine=fighters.slice(myPage*PER_PAGE,(myPage+1)*PER_PAGE);

  return <section className="pb-subpage pb-frame pb-community-page pb-page-anim" aria-label="Comunidad PHOTO BRAWL">
    <div className="pb-community-top"><div><small>PHOTO BRAWL · CONECTADO A SUPABASE</small><h2>{tab==='ranking'?'CLASIFICACIÓN ONLINE':tab==='mine'?'MIS PUBLICACIONES':adminView?'ARCHIVO DE LUCHADORES':'COMUNIDAD DE LUCHADORES'}</h2></div><button type="button" className="pb-community-account" onClick={onAccount}><UserRound size={15}/>{user?'MI CUENTA':'ENTRAR'}</button></div>
    <nav className="pb-community-tabs pb-community-tabs-three" aria-label="Secciones de la comunidad">
      <button className={tab==='ranking'?'active':''} onClick={()=>{setTab('ranking');setError('');}}><Crown size={15}/> RANKING</button>
      <button className={tab==='explore'?'active':''} onClick={()=>{setTab('explore');setError('');}}><UsersRound size={15}/> EXPLORAR</button>
      <button className={tab==='mine'?'active':''} onClick={()=>{setTab('mine');setError('');}}><CloudUpload size={15}/> PUBLICAR</button>
    </nav>
    {adminView && tab==='explore'&&<div className="pb-admin-gallery-note"><ShieldCheck size={13}/> VISTA PRIVADA DE ADMIN · SOLO LECTURA</div>}
    {!supabaseConfigured?<div className="pb-community-empty"><div><LockKeyhole size={27}/><p>SUPABASE SIN CONFIGURAR</p><small>Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel y vuelve a desplegar. Tus luchadores locales están a salvo.</small></div></div>:
    tab==='ranking'?<>
      <div className="pb-rank-modes" role="group" aria-label="Clasificaciones">
        <button type="button" aria-pressed={rankMode==='global'} className={rankMode==='global'?'active':''} onClick={()=>{setRankMode('global');setPeoplePage(0);}}>ELO GLOBAL</button>
        <button type="button" aria-pressed={rankMode==='fighter'} className={rankMode==='fighter'?'active':''} onClick={()=>{setRankMode('fighter');setPeoplePage(0);}}>COPAS LUCHADOR</button>
        <button type="button" aria-pressed={rankMode==='duo'} className={rankMode==='duo'?'active':''} onClick={()=>{setRankMode('duo');setPeoplePage(0);}}>DÚOS 2V2</button>
      </div>
      <div className="pb-rank-explainer">{rankMode==='global'?'ELO DE CUENTA · SE CONSERVA EL HISTORIAL DE SIEMPRE':rankMode==='fighter'?'COPAS POR LUCHADOR · ROTAR PERSONAJES SUMA PROGRESO': 'DOS CUENTAS · UN DÚO · PUEDES CAMBIAR DE LUCHADOR'}</div>
      <div className="pb-community-leaderboard">
        {rankMode==='global'&&current.map((p,i)=><button className={`pb-rank-entry ${i+peoplePage*10<3?'podium':''}`} type="button" key={p.id} onClick={()=>void openAuthor(p.id)}><b>#{peoplePage*10+i+1}</b><span><strong>{p.display_name||p.username||'JUGADOR'}</strong><small>@{p.username} · {p.wins} V / {p.losses} D</small></span><em>{p.rating} ELO</em></button>)}
        {rankMode==='fighter'&&currentFighters.map((f,i)=><button className={`pb-rank-entry ${i+peoplePage*10<3?'podium':''}`} type="button" key={f.fighter_id} onClick={()=>void openAuthor(f.account_id)}>
          <b>#{peoplePage*10+i+1}</b>
          <LeagueFrame trophies={f.trophies} compact><img className="pb-rank-portrait" src={fighterPublicUrl(f.fighters.public_portrait_path)} alt="" loading="lazy"/></LeagueFrame>
          <span className="pb-rank-card-info"><strong>{f.fighters.fighter_name}</strong><small>@{f.fighters.player_profiles?.username||'jugador'} · {f.wins} V</small></span><LeagueBadge trophies={f.trophies}/>
        </button>)}
        {rankMode==='duo'&&currentDuos.map((duo,i)=><div className={`pb-rank-entry ${i+peoplePage*10<3?'podium':''}`} key={`${duo.player_a}-${duo.player_b}`}>
          <b>#{peoplePage*10+i+1}</b><div className="pb-duo-avatars" aria-hidden="true"><span>1P</span><span>2P</span></div>
          <span className="pb-rank-card-info"><strong>{duo.a?.display_name||duo.a?.username||'JUGADOR'} + {duo.b?.display_name||duo.b?.username||'JUGADOR'}</strong>
            <small><button type="button" onClick={()=>void openAuthor(duo.player_a)}>@{duo.a?.username||'1P'}</button> + <button type="button" onClick={()=>void openAuthor(duo.player_b)}>@{duo.b?.username||'2P'}</button> · {duo.wins} V</small>
          </span><LeagueBadge trophies={duo.trophies}/>
        </div>)}
        {!rankingEntries.length&&<div className="pb-community-empty">{isLoading?'CARGANDO CLASIFICACIÓN…':rankMode==='global'?'TODAVÍA NO HAY PARTIDAS CLASIFICATORIAS.':rankMode==='fighter'?'LAS COPAS EMPIEZAN CON LA PRIMERA CLASIFICATORIA DE V51.':'LOS DÚOS NACEN CUANDO DOS USUARIOS JUEGAN JUNTOS UN 2V2 CLASIFICATORIO.'}</div>}
      </div>
      <div className="pb-community-pages"><button type="button" disabled={!peoplePage} onClick={()=>setPeoplePage(n=>n-1)} aria-label="Anterior página"><ChevronLeft size={15}/></button><span>{peoplePage+1} / {Math.max(1,Math.ceil(rankingEntries.length/10))}</span><button type="button" disabled={(peoplePage+1)*10>=rankingEntries.length} onClick={()=>setPeoplePage(n=>n+1)} aria-label="Siguiente página"><ChevronRight size={15}/></button></div>
      <div className="pb-rank-league-guide" aria-label="Ligas disponibles">{LEAGUES.map(league=><LeagueBadge key={league.key} trophies={league.min}/>)}</div>
    </>:tab==='explore'?<>
      <form className="pb-community-search" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search);}}><input value={search} maxLength={40} placeholder={adminView?"Buscar cualquier luchador…":"Buscar luchadores públicos…"} onChange={e=>setSearch(e.target.value)} aria-label="Buscar luchadores"/><button type="submit"><Search size={15}/> BUSCAR</button></form>
      <div className="pb-community-grid">{list.length?list.map(f=><button type="button" className="pb-community-card" key={f.id} onClick={()=>showDetail(f)}><LeagueFrame trophies={fighterCups[f.id]??0}><CommunityArtwork fighter={f}/></LeagueFrame><strong>{f.fighter_name}</strong><small>{f.player_profiles?.display_name||'JUGADOR'}</small>{adminView&&<em className={f.is_public?'pb-admin-public':'pb-admin-private'}>{f.is_public?'PÚBLICO':'PRIVADO'}</em>}</button>):<div className="pb-community-empty">{isLoading?'BUSCANDO PERSONAJES…':adminView?'NO SE HAN ENCONTRADO LUCHADORES EN LA NUBE.':'TODAVÍA NO HAY LUCHADORES PUBLICADOS. ¡COMPARTE UNO DE LOS TUYOS!'}</div>}</div>
      <div className="pb-community-pages"><button type="button" disabled={!page} onClick={()=>setPage(n=>n-1)} aria-label="Página anterior"><ChevronLeft size={15}/></button><span>PÁGINA {page+1}</span><button type="button" disabled={list.length<PER_PAGE} onClick={()=>setPage(n=>n+1)} aria-label="Página siguiente"><ChevronRight size={15}/></button></div>
    </>:<>
      <div className="pb-community-info"><span><ShieldCheck size={13}/> La nube es privada hasta que publiques expresamente</span>{!user&&<button type="button" onClick={onAccount}>INICIAR SESIÓN <ChevronRight size={14}/></button>}</div>
      <div className="pb-community-grid pb-my-community-grid">{mine.length?mine.map(f=><article className="pb-community-card pb-my-community-card" key={f.id}><img src={f.portraitDataUrl} alt=""/><strong>{f.fighterName}</strong><button type="button" disabled={Boolean(busy)||authLoading} className={published[f.id]?'pb-published':''} onClick={()=>void changePublication(f)}>{busy===f.id?'GUARDANDO…':published[f.id]?'OCULTAR':'PUBLICAR'}</button></article>):<div className="pb-community-empty">NO TIENES LUCHADORES. CREA UNO DESDE EL MENÚ PRINCIPAL Y VUELVE AQUÍ PARA PUBLICARLO.</div>}</div>
      <div className="pb-community-pages"><button type="button" disabled={!myPage} onClick={()=>setMyPage(n=>n-1)} aria-label="Página anterior"><ChevronLeft size={15}/></button><span>{myPage+1} / {Math.max(1,Math.ceil(fighters.length/PER_PAGE))}</span><button type="button" disabled={(myPage+1)*PER_PAGE>=fighters.length} onClick={()=>setMyPage(n=>n+1)} aria-label="Página siguiente"><ChevronRight size={15}/></button></div>
    </>}
    {(error||notice)&&<p role={error?'alert':'status'} className={error?'pb-community-error-message':'pb-community-notice'}>{error||notice}</p>}
    {detail&&(detail.is_public!==false || adminView)&&<div className="pb-social-overlay pb-community-detail-layer" onPointerDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}><section className="pb-social-dialog pb-community-detail pb-frame" role="dialog" aria-modal="true" aria-label={`Ficha de ${detail.fighter_name}`}>
      <header className="pb-social-heading"><strong>{detail.fighter_name}</strong><button type="button" aria-label="Cerrar" onClick={()=>setDetail(null)}><X size={18}/></button></header>
      <div className="pb-community-detail-main"><LeagueFrame trophies={fighterCups[detail.id]??0}><CommunityArtwork key={`${detail.id}-${detailArt}`} fighter={detail} asset={detailArt} alt={`${detailArt==='portrait'?'Retrato':'Sprites'} de ${detail.fighter_name}`}/></LeagueFrame><div><b>{detail.fighter_data?.subtitle||detail.archetype}</b><small>{detail.archetype} · {detail.fighter_data?.passiveTrait||'SIN PASIVA'}</small><p>HP {detail.fighter_data?.stats?.hp} · SPD {detail.fighter_data?.stats?.speed} · PWR {detail.fighter_data?.stats?.power} · TEC {detail.fighter_data?.stats?.technique}</p><button type="button" onClick={()=>setDetailArt(v=>v==='portrait'?'sheet':'portrait')}>{detailArt==='portrait'?'VER SPRITES':'VER RETRATO'}</button><button type="button" onClick={()=>void openAuthor(detail.owner_id)}><UserRound size={13}/> VER PERFIL DEL CREADOR</button>{adminView&&<small className="pb-admin-detail-status">{detail.is_public?'PUBLICADO':'NO PUBLICADO · PRIVADO'}</small>}</div></div>
      <div className="pb-community-moves">{moveNames(detail).map(m=><span key={m.label}>{m.label}: {m.name}</span>)}</div>
      <div className="pb-social-actions"><button type="button" disabled={Boolean(busy)||user?.id===detail.owner_id} onClick={()=>void changeLike()}><Heart size={15} fill={likes.liked?'currentColor':'none'}/> {likes.count} · {likes.liked?'YA TE GUSTA':'ME GUSTA'}</button><button type="button" onClick={()=>setDetail(null)}><ArrowLeft size={14}/> VOLVER</button></div>
    </section></div>}
    {author&&<div className="pb-social-overlay pb-community-detail-layer" onPointerDown={e=>{if(e.target===e.currentTarget)setAuthor(null);}}><section className="pb-social-dialog pb-community-detail pb-frame" role="dialog" aria-modal="true" aria-label="Perfil público del jugador">
      <header className="pb-social-heading"><strong><UserRound size={17}/> {author.player?.display_name||'JUGADOR'}</strong><button type="button" aria-label="Cerrar" onClick={()=>setAuthor(null)}><X size={18}/></button></header>
      <div className="pb-community-author-summary">@{author.player?.username||'jugador'} · {author.player?.rating??1000} ELO · {author.player?.wins??0} V / {author.player?.losses??0} D</div>
      <div className="pb-community-author-grid">{author.fighters.length?author.fighters.slice(0,6).map(f=><button key={f.id} type="button" onClick={()=>{setAuthor(null);showDetail(f);}}><LeagueFrame trophies={fighterCups[f.id]??0} compact><img src={fighterPublicUrl(f.public_portrait_path)} alt=""/></LeagueFrame><small>{f.fighter_name}</small></button>):<p>Este jugador todavía no ha publicado luchadores.</p>}</div>
      <div className="pb-social-actions"><button type="button" onClick={()=>setAuthor(null)}><ArrowLeft size={14}/> VOLVER</button></div>
    </section></div>}
  </section>;
}
