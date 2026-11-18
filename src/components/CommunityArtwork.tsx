import {useEffect,useState} from 'react';
import type {CommunityFighter} from '../services/communityService';
import {downloadAdminFighterImage,fighterPublicUrl} from '../services/communityService';

/** No private storage URLs or images appear in the public gallery. Private
 * assets are downloaded only for a verified admin and released on unmount. */
export function CommunityArtwork({fighter,asset='portrait',alt=''}:{
  fighter:CommunityFighter;asset?:'portrait'|'sheet';alt?:string;
}){
  const privatePath=fighter.is_public===false
    ?(asset==='portrait'?fighter.private_portrait_path:fighter.private_sheet_path):undefined;
  const publicPath=asset==='portrait'?fighter.public_portrait_path:fighter.public_sheet_path;
  const [privateSrc,setPrivateSrc]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    let objectUrl='';
    setPrivateSrc('');setFailed(false);
    if(privatePath){
      void downloadAdminFighterImage(privatePath).then(blob=>{
        objectUrl=URL.createObjectURL(blob);
        if(active)setPrivateSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      }).catch(()=>{if(active)setFailed(true);});
    }
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[privatePath]);
  const src=privatePath?privateSrc:fighterPublicUrl(publicPath);
  return src?<img src={src} alt={alt} loading="lazy" draggable={false}/>:
    <span className="pb-private-art-placeholder" role="img" aria-label={failed?'Imagen privada no disponible':'Cargando imagen'}>{failed?'SIN IMAGEN':'···'}</span>;
}
