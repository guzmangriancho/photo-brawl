import type {ReactNode} from 'react';
import {leagueFor,leagueProgress} from '../services/progressionService';
import './progression.css';

/** Entire frame is CSS-rendered square pixels, no gradients that blur pixel art. */
export function LeagueFrame({trophies=0,children,compact=false,className=''}:{
  trophies?:number;children:ReactNode;compact?:boolean;className?:string;
}){
  const league=leagueFor(trophies);
  return <span className={`pb-league-frame pb-league--${league.key.toLowerCase()} ${compact?'is-compact':''} ${className}`.trim()} title={`${league.label} · ${trophies} copas`}>
    {children}
  </span>;
}
export function LeagueBadge({trophies=0,progress=false}:{trophies?:number;progress?:boolean}){
  const league=leagueFor(trophies);
  return <span className={`pb-league-badge pb-league--${league.key.toLowerCase()}`} title={`${league.label}: ${trophies} copas`}>
    <span aria-hidden="true" className="pb-league-diamond">◆</span>
    <strong>{league.label}</strong>
    <span className="pb-league-cups">{trophies} <span aria-hidden="true">COPAS</span></span>
    {progress&&league.next!==null&&<span className="pb-league-progress" role="progressbar" aria-label={`Hacia ${leagueFor(league.next).label}`} aria-valuemin={league.min} aria-valuemax={league.next} aria-valuenow={trophies}>
      <span style={{width:`${leagueProgress(trophies)*100}%`}}/>
    </span>}
  </span>;
}

/** Numeric trophy total for leaderboards: no league name, pure pixel-art cup. */
export function PixelCupTotal({trophies}:{trophies:number}){
  return <span className="pb-pixel-cup-total" title={`${trophies} copas`} aria-label={`${trophies} copas`}>
    <strong>{trophies.toLocaleString('es-ES')}</strong>
    <svg className="pb-pixel-cup" viewBox="0 0 24 24" role="img" aria-label="Copa" shapeRendering="crispEdges">
      <path fill="#9b511c" d="M5 2h14v3h4v8h-4v3h-4v3h4v3H5v-3h4v-3H5v-3H1V5h4z"/>
      <path fill="#ffda55" d="M6 3h12v9h-3v3H9v-3H6zM2 6h3v6H3V9H2zM19 6h3v3h-1v3h-2zM10 16h4v4h4v1H6v-1h4z"/>
      <path fill="#fff6b1" d="M7 4h3v7H8V8H7zM3 6h2v2H3zM12 17h2v2h-2z"/>
      <path fill="#de8c29" d="M15 5h2v6h-2zM9 12h6v2H9zM7 20h10v1H7z"/>
    </svg>
  </span>;
}

/** Compact fighter-card plate: league name + pixel cup total, with a thin bar toward the next league. */
export function LeagueCupPlate({trophies=0}:{trophies?:number}){
  const league=leagueFor(trophies);
  return <span className={`pb-league-plate pb-league--${league.key.toLowerCase()}`} title={`${league.label}: ${trophies} copas`}>
    <span className="pb-league-plate-name"><span aria-hidden="true">◆</span>{league.label}</span>
    <PixelCupTotal trophies={trophies}/>
    {league.next!==null&&<span className="pb-league-plate-bar" role="progressbar" aria-label={`Hacia ${leagueFor(league.next).label}`} aria-valuemin={league.min} aria-valuemax={league.next} aria-valuenow={trophies}>
      <span style={{width:`${leagueProgress(trophies)*100}%`}}/>
    </span>}
  </span>;
}
