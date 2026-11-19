import {useEffect,useState} from 'react';
import {usePlayerAccount} from './usePlayerAccount';
import {FAVORITE_CHANGED,readFavoriteFighter} from './favoriteFighterService';
import type {FavoriteFighter} from './favoriteFighterService';

const EMPTY:FavoriteFighter={localId:null,avatarPath:null};
/** Shared via Supabase plus an event, so every open screen reflects a change. */
export function useFavoriteFighter(){
  const {user}=usePlayerAccount();
  const [favorite,setFavorite]=useState<FavoriteFighter>(EMPTY);
  useEffect(()=>{
    let mounted=true;
    let revision=0;
    setFavorite(EMPTY); // Do not show the preceding account's private state.
    if(!user?.id)return;
    const refresh=()=>{const request=++revision;void readFavoriteFighter(user.id).then(value=>{if(mounted&&request===revision)setFavorite(value);})
      .catch(error=>{if(mounted&&request===revision)console.warn('No se pudo cargar el favorito',error);});};
    window.addEventListener(FAVORITE_CHANGED,refresh);
    window.addEventListener('pb-transfer-changed',refresh);
    window.addEventListener('focus',refresh);
    refresh();
    return()=>{mounted=false;revision++;window.removeEventListener(FAVORITE_CHANGED,refresh);window.removeEventListener('pb-transfer-changed',refresh);window.removeEventListener('focus',refresh);};
  },[user?.id]);
  return favorite;
}
