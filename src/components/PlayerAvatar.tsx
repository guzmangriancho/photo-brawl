import React from 'react';
import {UserRound} from 'lucide-react';
import {avatarPublicUrl} from '../services/favoriteFighterService';
/** Identical small pixel-frame avatar in rankings, account and player profiles. */
export function PlayerAvatar({path,alt='',size='normal'}:{path?:string|null;alt?:string;size?:'normal'|'small'|'large'}){
  const url=avatarPublicUrl(path);
  return <span className={`pb-player-avatar pb-player-avatar--${size}`} aria-label={alt||'Avatar del jugador'}>
    {url?<img src={url} alt={alt} loading="lazy"/>:<UserRound size={size==='small'?15:size==='large'?32:21} aria-hidden="true"/>}
  </span>;
}
