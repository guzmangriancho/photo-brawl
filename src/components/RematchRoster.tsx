import React,{useState} from 'react';
import type {FighterProfile} from '../types/fighter';
import {RotateCcw, LogOut, X} from 'lucide-react';
import {PublishedFighterPicker} from './PublishedFighterPicker';
import './rematchRoster.css';
interface Props {
  players:FighterProfile[];
  roster:FighterProfile[];
  selectableSeats:number[];
  onRematch:(profiles:FighterProfile[])=>void;
  onExit:()=>void;
  requested?:boolean;
  votes?:boolean[];
  title?:string;
  labels?:string[];
  detail?:React.ReactNode;
  allowCommunity?:boolean;
}
/** Shared 2/4 participant rematch interface. Only the local seat is editable;
 * ranked rooms additionally require cloud ownership for the selected fighter. */
export function RematchRoster({players,roster,selectableSeats,onRematch,onExit,requested=false,votes,title='REVANCHA',labels,detail,allowCommunity=false}:Props){
  const [selected,setSelected]=useState<FighterProfile[]>(players);
  const [editing,setEditing]=useState<number|null>(null);
  const [source,setSource]=useState<'OWN'|'PUBLIC'>('OWN');
  const available=roster.filter(f=>!f.isPreset&&!f.id.startsWith('preset_'));
  return <section className="pb-replay" aria-label="Revancha y cambio de personajes">
    <header className="pb-replay-title"><small>PHOTO BRAWL · FIN DEL COMBATE</small><strong>{title}</strong></header>
    {detail&&<div className="pb-replay-detail">{detail}</div>}
    <div className={`pb-replay-seats ${selected.length===4?'has-four':''}`}>
      {selected.map((f,index)=>{
        const canEdit=selectableSeats.includes(index) && !requested;
        return <div className="pb-replay-seat" key={index}>
          <span className="pb-replay-seat-label">{labels?.[index]||`P${index+1}`}{votes?.[index]?' · LISTO':''}</span>
          <button type="button" disabled={!canEdit} onClick={()=>{setSource('OWN');setEditing(index);}}
            className={`pb-replay-portrait ${canEdit?'can-change':''}`} title={canEdit?'Cambiar luchador':'Luchador del rival'}
            aria-label={`${canEdit?'Cambiar':'Ver'} luchador ${index+1}: ${f.fighterName}`}>
            <img src={f.portraitDataUrl} alt=""/>{canEdit&&<span>CAMBIAR</span>}
          </button>
          <b title={f.fighterName}>{f.fighterName}</b>
        </div>;
      })}
    </div>
    <button type="button" className="pb-replay-go" disabled={requested} onClick={()=>onRematch(selected)}>
      <RotateCcw size={16}/>{requested?'ESPERANDO A LOS DEMÁS…':'PEDIR REVANCHA'}
    </button>
    <button type="button" className="pb-replay-exit" onClick={onExit}><LogOut size={15}/> SALIR</button>
    {editing!==null&&<div className="pb-replay-picker-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setEditing(null);}}>
      <section role="dialog" aria-modal="true" aria-label="Elegir nuevo luchador" className="pb-replay-picker">
        <header><strong>ELEGIR LUCHADOR · P{editing+1}</strong><button type="button" onClick={()=>setEditing(null)} aria-label="Cerrar"><X size={17}/></button></header>
        {allowCommunity&&<div className="pb-online-roster-tabs pb-replay-roster-tabs" role="group" aria-label="Origen del luchador">
          <button type="button" aria-pressed={source==='OWN'} className={source==='OWN'?'is-active':''} onClick={()=>setSource('OWN')}>MIS LUCHADORES</button>
          <button type="button" aria-pressed={source==='PUBLIC'} className={source==='PUBLIC'?'is-active':''} onClick={()=>setSource('PUBLIC')}>COMUNIDAD</button>
        </div>}
        {allowCommunity&&source==='PUBLIC'?<PublishedFighterPicker onSelect={fighter=>{setSelected(prev=>prev.map((old,i)=>i===editing?fighter:old));setEditing(null);}}/>:<>
        <div className="pb-replay-options">{available.map(f=><button type="button" key={f.id}
          className={selected[editing].id===f.id?'is-active':''}
          onClick={()=>{setSelected(prev=>prev.map((old,i)=>i===editing?f:old));setEditing(null);}}>
          <img src={f.portraitDataUrl} alt=""/><span>{f.fighterName}</span>
        </button>)}</div>
        {!available.length&&<p>No hay luchadores propios disponibles.</p>}
        </>}
      </section>
    </div>}
  </section>;
}
