import React from 'react';
import {Heart} from 'lucide-react';
/** Independent button — do not nest inside an interactive fighter selection card. */
export function FavoriteButton({active,disabled,onClick}:{active:boolean;disabled?:boolean;onClick:()=>void}){
  return <button type="button" className={`pb-favorite-toggle ${active?'is-favorite':''}`}
    disabled={disabled} aria-pressed={active} title={active?'Quitar de favoritos':'Elegir como favorito (retrato visible en el perfil público)'}
    aria-label={active?'Quitar luchador favorito':'Marcar luchador favorito'} onClick={onClick}>
    <Heart size={17} strokeWidth={2.8} fill={active?'currentColor':'none'}/>
  </button>;
}
