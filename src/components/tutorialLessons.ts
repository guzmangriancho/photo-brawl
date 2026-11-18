/**
 * V27 · Escuela Arcade. Las etapas se validan con el estado REAL del motor;
 * pulsar un botón sin ejecutar el movimiento no da el ejercicio por superado.
 * Los presets gratuitos son los únicos luchadores utilizados aquí.
 */
import { FLOOR_Y, type FightEngine } from '../engine/FightEngine';

export type TutorialDummyMode = 'IDLE' | 'GUARD_HIGH' | 'TUTORIAL_JABS';
export type TutorialLessonId =
  | 'MOVE' | 'DASH' | 'JUMP' | 'GUARD_WALK' | 'JAB' | 'CHAIN'
  | 'FINISHER' | 'LOW' | 'SPECIAL' | 'FORWARD' | 'UP'
  | 'BLOCK' | 'PARRY' | 'SUPER' | 'COMPLETE';

export interface TutorialLesson {
  id: TutorialLessonId;
  title: string;
  instruction: string;
  keyboard: string;
  tip: string;
  dummy: TutorialDummyMode;
  setup?: 'CLOSE' | 'SPECIALS' | 'DEFENSE';
}

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {id:'MOVE',title:'CAMINA',instruction:'Mueve el joystick a izquierda o derecha.',keyboard:'TECLADO: A / D',tip:'Aprende a ajustar la distancia antes de atacar.',dummy:'IDLE'},
  {id:'DASH',title:'DASH RÁPIDO',instruction:'Desliza el joystick rápido a un lado.',keyboard:'TECLADO: MAYÚS o doble A / D',tip:'El dash te acerca o te saca del alcance rival.',dummy:'IDLE'},
  {id:'JUMP',title:'SALTO',instruction:'Pulsa SALTO para despegar del suelo.',keyboard:'TECLADO: W',tip:'Con la habilidad DOBLE SALTO puedes repetirlo en el aire.',dummy:'IDLE'},
  {id:'GUARD_WALK',title:'DEFENSA MÓVIL',instruction:'Mantén CUBRIR y camina con el joystick.',keyboard:'TECLADO: Q + A / D',tip:'La guardia no te obliga a retroceder. Abajo + CUBRIR protege los bajos.',dummy:'IDLE'},
  {id:'JAB',title:'GOLPE CERTERO',instruction:'Acércate y conecta un GOLPE (A).',keyboard:'TECLADO: F',tip:'Un jab solo sirve si alcanza al rival: mira tu distancia.',dummy:'IDLE',setup:'CLOSE'},
  {id:'CHAIN',title:'ENLAZA JABS',instruction:'Conecta un segundo GOLPE antes de que termine el primero.',keyboard:'TECLADO: F → F',tip:'Dos golpes conectados inician una cadena; machacar A sin acertar no sirve.',dummy:'IDLE'},
  {id:'FINISHER',title:'REMATE FUERTE',instruction:'Tras dos jabs, remata con otro A o mantén A.',keyboard:'TECLADO: F → F → F o H',tip:'El remate fuerte debe alcanzar al rival dentro del combo.',dummy:'IDLE'},
  {id:'LOW',title:'ROMPE GUARDIA',instruction:'El rival se cubre arriba. Haz ABAJO + GOLPE.',keyboard:'TECLADO: S + F',tip:'Los ataques bajos atraviesan la guardia alta. ¡Haz que conecte!',dummy:'GUARD_HIGH',setup:'CLOSE'},
  {id:'SPECIAL',title:'TÉCNICA NEUTRA',instruction:'Pulsa TÉCNICA (B) sin marcar una dirección.',keyboard:'TECLADO: G',tip:'No puedes disparar sin parar: los proyectiles tienen recuperación.',dummy:'IDLE',setup:'SPECIALS'},
  {id:'FORWARD',title:'TÉCNICA DE AVANCE',instruction:'Pulsa hacia el RIVAL + TÉCNICA (B).',keyboard:'TECLADO: D + G (si miras a la derecha)',tip:'Adelante significa siempre hacia tu adversario.',dummy:'IDLE'},
  {id:'UP',title:'TÉCNICA ANTIAÉREA',instruction:'Marca ARRIBA en el joystick + TÉCNICA.',keyboard:'TECLADO: W + G',tip:'Arriba en el joystick elige la técnica; SALTO va en otro botón.',dummy:'IDLE'},
  {id:'BLOCK',title:'BLOQUEA EL JAB',instruction:'El rival atacará. Mantén CUBRIR hasta detener un golpe.',keyboard:'TECLADO: Q',tip:'Puedes defenderte sin retroceder. Observa cuándo prepara el jab.',dummy:'TUTORIAL_JABS',setup:'DEFENSE'},
  {id:'PARRY',title:'PARRY PERFECTO',instruction:'Suelta CUBRIR y púlsalo JUSTO al llegar el jab.',keyboard:'TECLADO: suelta Q y vuelve a pulsar Q',tip:'La ventana dura 5 fotogramas: anticipa la luz del golpe. El parry empuja al rival.',dummy:'TUTORIAL_JABS'},
  {id:'SUPER',title:'ATAQUE SÚPER',instruction:'Pulsa el gran botón SÚPER que aparece abajo, en el centro.',keyboard:'TECLADO: Y',tip:'En entrenamiento la barra está llena. En combate real necesitas 100%.',dummy:'IDLE',setup:'SPECIALS'},
  {id:'COMPLETE',title:'¡ESCUELA COMPLETADA!',instruction:'¡Ya sabes moverte, encadenar, cubrir y contraatacar!',keyboard:'PRACTICA LIBRE',tip:'Prueba distintas técnicas en TRAINING y enfréntate a otros jugadores.',dummy:'IDLE'},
] as const;

/** Comprueba resultados de combate, no simples clics ni intentos fallidos. */
export function tutorialLessonCompleted(id: TutorialLessonId, engine: FightEngine, originX: number): boolean {
  const p = engine.p1;
  const attack = p.currentAttack;
  switch(id) {
    case 'MOVE': return Math.abs(p.x - originX) >= 55;
    case 'DASH': return p.state === 'DASH';
    case 'JUMP': return p.y <= FLOOR_Y - 28;
    case 'GUARD_WALK': return engine.p1Input.guard && p.state === 'BLOCK_STAND' && Math.abs(p.x - originX) >= 22;
    case 'JAB': return attack?.slot === 'LIGHT' && attack.hasHit;
    case 'CHAIN': return p.comboCount >= 2 && attack?.slot === 'LIGHT' && attack.hasHit;
    case 'FINISHER': return p.comboCount >= 3 && attack?.slot === 'HEAVY' && attack.hasHit;
    case 'LOW': return attack?.slot === 'LOW' && attack.hasHit;
    case 'SPECIAL': return attack?.slot === 'SP_NEUTRAL';
    case 'FORWARD': return attack?.slot === 'SP_FORWARD';
    case 'UP': return attack?.slot === 'SP_UP';
    case 'BLOCK': return p.blockstunFrames > 0 && (p.state === 'BLOCK_STAND' || p.state === 'BLOCK_CROUCH');
    case 'PARRY': return engine.p2.state === 'HURT' && engine.parryBursts.some(burst => burst.life >= 9);
    case 'SUPER': return attack?.slot === 'SUPER' || engine.superFlashFrames > 0;
    case 'COMPLETE': return false;
  }
}

/** Escenarios de práctica. No cambia reglas ni datos de partidas online. */
export function prepareTutorialLesson(engine: FightEngine, lesson: TutorialLesson): void {
  if (lesson.setup) {
    engine.resetRound();
    engine.p1.x = 410;
    engine.p2.x = lesson.setup === 'SPECIALS' ? 650 : 492;
    engine.p1.facing = 1;
    engine.p2.facing = -1;
  }
  engine.trainingDummyMode = lesson.dummy;
}
