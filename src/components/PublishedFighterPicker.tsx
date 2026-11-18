import React, {useEffect, useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import type {FighterProfile} from '../types/fighter';
import { COMMUNITY_PAGE_SIZE, loadPublishedFighter, searchPublishedFighters } from '../services/publishedFighters';
import type {PublishedFighterCard} from '../services/publishedFighters';
import './publishedFighterPicker.css';

/** For friendly online rooms and rematches; never shown in ranked rooms. */
export function PublishedFighterPicker({onSelect}:{onSelect:(fighter:FighterProfile)=>void}){
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(0);
  const [items,setItems]=useState<PublishedFighterCard[]>([]);
  const [loading,setLoading]=useState(true);
  const [selecting,setSelecting]=useState<string|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{setPage(0);},[query]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setItems([]);
    const timer=setTimeout(()=>{void searchPublishedFighters(query,page).then(rows=>{
      if(active)setItems(rows);
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'No se pudo cargar la comunidad.');})
      .finally(()=>{if(active)setLoading(false);});},query?300:0);
    return()=>{active=false;clearTimeout(timer);};
  },[query,page]);
  const choose=async(item:PublishedFighterCard)=>{
    if(selecting)return;
    setSelecting(item.id);setError('');
    try{onSelect(await loadPublishedFighter(item.entry));}
    catch(err){setError(err instanceof Error?err.message:'No se pudo cargar el luchador.');}
    finally{setSelecting(null);}
  };
  return <div className="pb-published-picker">
    <input id="pb-published-search" type="search" value={query} maxLength={40} placeholder="Buscar luchadores..." aria-label="Buscar luchadores" onChange={event=>setQuery(event.target.value)}/>
    <div className="pb-online-fighter-list pb-published-grid" aria-label="Luchadores de la comunidad">
      {items.map(item=><button type="button" key={item.id} disabled={!!selecting} onClick={()=>void choose(item)}>
        <img src={item.portraitUrl} alt=""/><span title={`${item.name} · @${item.author}`}>{item.name}</span>
      </button>)}
      {loading&&<p role="status">CARGANDO COMUNIDAD…</p>}
      {!loading&&!items.length&&<p>NO HAY LUCHADORES PUBLICADOS EN ESTA PÁGINA.</p>}
    </div>
    <div className="pb-online-picker-pages pb-published-pages"><button type="button" disabled={page===0||loading||!!selecting} onClick={()=>setPage(p=>Math.max(0,p-1))} aria-label="Página anterior"><ChevronLeft size={16}/></button>
      <span>{page+1}</span>
      <button type="button" disabled={loading||!!selecting||items.length<COMMUNITY_PAGE_SIZE} onClick={()=>setPage(p=>p+1)} aria-label="Página siguiente"><ChevronRight size={16}/></button></div>
    {selecting&&<small role="status">DESCARGANDO RETRATO Y SPRITES…</small>}
    {error&&<p role="alert" className="pb-published-error">{error}</p>}
  </div>;
}
