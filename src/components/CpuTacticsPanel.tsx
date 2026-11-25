import React from 'react';
import { CpuTactics, DEFAULT_CPU_TACTICS, setCloseMix, usesAttackMix } from '../engine/cpuTactics';

interface Props {
  label: string;
  name: string;
  portrait?: string;
  archetype?: string;
  tactics: CpuTactics;
  onChange: (next: CpuTactics) => void;
}

function Slider({ id, left, right, value, onChange }: { id: string; left: string; right: string; value: number; onChange: (v: number) => void }) {
  return <div className="pb-tactic-row">
    <label htmlFor={id}><span>{left}</span><span>{right}</span></label>
    <input id={id} type="range" min={0} max={100} step={5} value={Math.round(value)} onChange={e => onChange(Number(e.target.value))}/>
  </div>;
}

const MIX: { key: 'closeLight' | 'closeHeavy' | 'closeTech'; label: string }[] = [
  { key: 'closeLight', label: 'RÁPIDO' }, { key: 'closeHeavy', label: 'FUERTE' }, { key: 'closeTech', label: 'TÉCNICA' },
];

export function CpuTacticsPanel({ label, name, portrait, archetype = '', tactics, onChange }: Props) {
  const mix = usesAttackMix(archetype);
  const uid = label.replace(/\W/g, '');
  const set = (patch: Partial<CpuTactics>) => onChange({ ...tactics, ...patch });
  return <section className="pb-frame pb-tactics-panel" aria-label={`Tácticas de ${name}`}>
    <div className="pb-tactics-head">
      {portrait && <img src={portrait} alt="" draggable={false}/>}
      <div><small>{label}</small><strong>{name}</strong></div>
      <button type="button" className="pb-mini-button" onClick={() => onChange({ ...DEFAULT_CPU_TACTICS })}>RESTABLECER</button>
    </div>
    <Slider id={`${uid}-dist`} left="CERCA" right="LEJOS" value={tactics.distance} onChange={v => set({ distance: v })}/>
    {mix ? <>
    <div className="pb-tactic-mix" role="group" aria-label="Reparto de ataques a corta distancia">
      <span className="pb-tactic-mix-title">ATAQUES DE CERCA</span>
      {MIX.map(m => <div className="pb-tactic-mix-row" key={m.key}>
        <label htmlFor={`${uid}-${m.key}`}>{m.label}</label>
        <input id={`${uid}-${m.key}`} type="range" min={0} max={100} step={5} value={Math.round(tactics[m.key])} onChange={e => onChange(setCloseMix(tactics, m.key, Number(e.target.value)))}/>
        <b>{Math.round(tactics[m.key])}%</b>
      </div>)}
    </div>
    <Slider id={`${uid}-mid`} left="MEDIA: SOLO ACERCARSE" right={tactics.distance > 50 ? 'AVANCE: SOLO AL ACERCARSE' : 'TÉCNICA DE AVANCE'} value={tactics.midTech} onChange={v => set({ midTech: v })}/>
    <Slider id={`${uid}-far`} left="LEJOS: SOLO ACERCARSE" right="TÉCNICA A DISTANCIA" value={tactics.farTech} onChange={v => set({ farTech: v })}/>
    </> : <small className="pb-tactic-note">{archetype === 'ZONER_MAGE'
      ? 'ESTILO PROPIO (zoner): con distancia alta se aleja y lanza proyectiles; de cerca usa su ascendente. Ataques y técnicas siguen su tabla.'
      : 'ESTILO PROPIO (tanque): no tiene ataque a larga distancia. Con distancia alta se aleja y espera; solo pelea si el rival entra o lo acorrala.'}</small>}
    <Slider id={`${uid}-hit`} left="SEGUIR ENCIMA TRAS ACERTAR" right="APARTARSE" value={tactics.afterHit} onChange={v => set({ afterHit: v })}/>
    <Slider id={`${uid}-block`} left="INSISTIR SI BLOQUEAN" right="RETIRARSE" value={tactics.afterBlock} onChange={v => set({ afterBlock: v })}/>
    {mix && <Slider id={`${uid}-jump`} left="ENTRAR POR SUELO" right="ENTRAR SALTANDO" value={tactics.jumpIn} onChange={v => set({ jumpIn: v })}/>}
  </section>;
}
