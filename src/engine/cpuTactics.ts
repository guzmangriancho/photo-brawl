// Style controls for a CPU fighter. They only reweight decisions the CPU
// already makes (distance, attack choice, approach). They never change combat
// rules, cooldowns, meter costs or reaction speed (that stays with difficulty).
export interface CpuTactics {
  /** 0 = pelea muy cerca, 100 = mantiene distancia. 50 = comportamiento clásico. */
  distance: number;
  /** Reparto de ataques a corta distancia (suman 100): golpe rápido / fuerte / técnica. */
  closeLight: number;
  closeHeavy: number;
  closeTech: number;
  /** A media distancia (100-270 px): 0 = solo se acerca, 100 = siempre técnica de avance. Clásico: 44. */
  midTech: number;
  /** Lejos (>270 px): 0 = solo se acerca, 100 = siempre técnica a distancia. Clásico: 42. */
  farTech: number;
  /** 0 = sigue encima tras acertar, 100 = pega y se aparta. */
  afterHit: number;
  /** 0 = insiste tras ser bloqueado, 100 = se aparta y vuelve a entrar. */
  afterBlock: number;
  /** 0 = avanza siempre por el suelo, 100 = entra saltando. Clásico: 22. */
  jumpIn: number;
}

export const DEFAULT_CPU_TACTICS: CpuTactics = {
  distance: 50, closeLight: 42, closeHeavy: 28, closeTech: 30, midTech: 44, farTech: 42,
  afterHit: 0, afterBlock: 0, jumpIn: 22,
};

const clamp=(v:number,lo=0,hi=100)=>Math.min(hi,Math.max(lo,Number.isFinite(v)?v:lo));

export function normalizeCpuTactics(input?: Partial<CpuTactics> | null): CpuTactics {
  const base={...DEFAULT_CPU_TACTICS,...(input||{})};
  let l=clamp(base.closeLight),h=clamp(base.closeHeavy),t=clamp(base.closeTech);
  const sum=l+h+t;
  if(sum<=0){l=DEFAULT_CPU_TACTICS.closeLight;h=DEFAULT_CPU_TACTICS.closeHeavy;t=DEFAULT_CPU_TACTICS.closeTech;}
  else{l=l*100/sum;h=h*100/sum;t=t*100/sum;}
  return {distance:clamp(base.distance),closeLight:l,closeHeavy:h,closeTech:t,
    midTech:clamp(base.midTech),farTech:clamp(base.farTech),afterHit:clamp(base.afterHit),afterBlock:clamp(base.afterBlock),jumpIn:clamp(base.jumpIn)};
}

/** Zoner and grappler keep their own attack tables: the attack-mix controls only apply to the other archetypes. */
export const usesAttackMix=(archetype:string)=>archetype!=='ZONER_MAGE'&&archetype!=='GRAPPLER_TANK';

/** Multiplier for every hardcoded distance threshold. 50 -> 1 (unchanged). */
export const distanceScale=(t:CpuTactics)=>0.7+t.distance/100*0.6;

/** Changing one share keeps the three summing to 100 by taking from the others. */
export function setCloseMix(t:CpuTactics,key:'closeLight'|'closeHeavy'|'closeTech',value:number):CpuTactics{
  const v=Math.round(clamp(value));
  const others=(['closeLight','closeHeavy','closeTech'] as const).filter(k=>k!==key);
  const rest=100-v;
  const oldSum=t[others[0]]+t[others[1]];
  const first=oldSum>0?Math.round(t[others[0]]*rest/oldSum):Math.round(rest/2);
  return {...t,[key]:v,[others[0]]:first,[others[1]]:rest-first};
}
