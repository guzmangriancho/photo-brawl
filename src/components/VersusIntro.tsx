import React from 'react';
import type { FighterProfile, StageId } from '../types/fighter';
import { STAGE_ART } from '../data/stages';
import './versusIntro.css';

type IntroMode = 'DUEL' | '2V2' | 'FREE_FOR_ALL';
interface Props {
  fighters: readonly FighterProfile[];
  stage: StageId;
  mode: IntroMode;
  framesLeft: number;
}

/** Driven by the engine's frame counter (not a wall-clock CSS timer).
 * This keeps online presentation, countdown and reconnects perfectly aligned. */
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function versusMotion(framesLeft: number, totalFrames = 90) {
  const t = clamp(1 - framesLeft / totalFrames);
  const incoming = clamp(t / 0.29);
  const settled = 1 - Math.pow(1 - incoming, 3);
  const leaving = clamp((t - 0.81) / 0.19);
  const visible = clamp(t / 0.07) * (1 - leaving * leaving);
  const sideOffset = (1 - settled) * 110 + leaving * 8;
  const centerReveal = clamp((t - 0.23) / 0.09);
  const centerScale = 0.65 + 0.35 * centerReveal + Math.sin(Math.PI * centerReveal) * 0.11;
  return { visible, sideOffset, centerReveal, centerScale, labelOpacity: clamp((t - 0.29) / 0.12) * (1 - leaving) };
}

const SEAT_COLORS = ['red', 'blue', 'green', 'gold'] as const;

/** Presentation only. The authoritative engine freezes its clock while this is visible. */
export function VersusIntro({ fighters, stage, mode, framesLeft }: Props) {
  const reducedMotion = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const motion = reducedMotion
    ? { visible: 1, sideOffset: 0, centerReveal: 1, centerScale: 1, labelOpacity: 1 }
    : versusMotion(framesLeft);
  const groups = mode === '2V2'
    ? [[0, 2], [1, 3]]
    : [[0], [1]];
  const label = mode === '2V2' ? '2 VS 2' : mode === 'FREE_FOR_ALL' ? 'FREE FOR ALL' : '1 VS 1';
  const image = STAGE_ART[stage]?.image;
  return <div
    className={`pb-vs-intro ${mode === 'FREE_FOR_ALL' ? 'pb-vs-intro--ffa' : 'pb-vs-intro--duel'}`}
    style={{ opacity: motion.visible, backgroundImage: `linear-gradient(90deg,rgba(6,16,37,.84),rgba(10,26,53,.62),rgba(6,16,37,.84)), url("${image}")` }}
    role="status" aria-live="off" aria-label={`Preparando combate ${label}. ${fighters.map(f => f.fighterName).join(' contra ')}`}
  >
    <div className="pb-vs-vignette" aria-hidden="true" />
    <div className="pb-vs-layout">
      <div className="pb-vs-overline" style={{opacity:motion.labelOpacity}}><span>PHOTO BRAWL</span><span>{label}</span></div>
      {mode === 'FREE_FOR_ALL'
        ? <div className="pb-vs-ffa-grid">
            {fighters.slice(0, 4).map((f, seat) => <div key={seat}
              className={`pb-vs-portrait pb-vs-portrait--${SEAT_COLORS[seat]} pb-vs-ffa-card`}
              style={{opacity:motion.visible,transform:`translateX(${seat % 2 ? motion.sideOffset : -motion.sideOffset}%)`}}>
              <span className="pb-vs-seat">P{seat + 1}</span>
              <img src={f.portraitDataUrl} alt="" draggable={false} />
              <strong title={f.fighterName}>{f.fighterName}</strong>
            </div>)}
            <div className="pb-vs-ffa-center" aria-hidden="true" style={{opacity:motion.centerReveal,transform:`translate(-50%, -50%) scale(${motion.centerScale})`}}>FFA</div>
          </div>
        : <div className={`pb-vs-matchup ${mode === '2V2' ? 'pb-vs-matchup--teams' : ''}`}>
            {groups.map((team, side) => <div key={side} className={`pb-vs-side pb-vs-side--${side ? 'right' : 'left'}`} style={{opacity:motion.visible,transform:`translateX(${side ? motion.sideOffset : -motion.sideOffset}%)`}}>
              {mode === '2V2' && <span className="pb-vs-team-name">EQUIPO {side ? 'AZUL' : 'ROJO'}</span>}
              <div className="pb-vs-side-portraits">
                {team.map(seat => <div key={seat} className={`pb-vs-portrait pb-vs-portrait--${side ? 'blue' : 'red'}`}>
                  <span className="pb-vs-seat">P{seat + 1}</span>
                  <img src={fighters[seat].portraitDataUrl} alt="" draggable={false} />
                  <strong title={fighters[seat].fighterName}>{fighters[seat].fighterName}</strong>
                </div>)}
              </div>
            </div>)}
            <div className="pb-vs-center-symbol" aria-hidden="true" style={{opacity:motion.centerReveal,transform:`translate(-50%, -50%) scale(${motion.centerScale})`}}>VS</div>
          </div>
      }
      <div className="pb-vs-stage-label" style={{opacity:motion.labelOpacity}}>{STAGE_ART[stage]?.name ?? 'ARENA ARCADE'}</div>
    </div>
  </div>;
}
