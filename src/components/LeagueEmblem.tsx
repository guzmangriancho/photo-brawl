import type {ReactNode} from 'react';
import {leagueFor,leagueProgress} from '../services/progressionService';
import './progression.css';

/** Entire frame is CSS-rendered square pixels, no gradients that blur pixel art. */
export function LeagueFrame({trophies=0,children,compact=false,className=''}:{
  trophies?:number;children:ReactNode;compact?:boolean;className?:string;
}){
  const league=leagueFor(trophies);
  return <span className={`pb-league-frame pb-league--${league.key.toLowerCase()} ${compact?'is-compact':''} ${className}`.trim()} title={`${league.label} · ${trophies} copas`}>
    {children}<span className="pb-league-frame-stamp" aria-hidden="true">{league.label[0]}</span>
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
