import React, { useEffect, useRef, useState } from 'react';
import type { InputState, MoveSlot } from '../engine/FightEngine';

interface MobileControlsProps {
  inputRef: React.MutableRefObject<InputState>;
  superReady: boolean;
  fixedStick: boolean;
  southpaw: boolean;
  opacity: number;
  comboStep: number;
  isFinisherReady: () => boolean;
  getFacing: () => 1 | -1;
  onAction: (slot: MoveSlot) => void;
  onDash: (dir: 1 | -1) => void;
  onJump: () => void;
}

type Dir = 'left' | 'right' | 'up' | 'down';
type ButtonId = 'strike' | 'skill' | 'jump' | 'super';
const directions: Dir[] = ['left', 'right', 'up', 'down'];
const HOLD_MS = 270;
const DEADZONE = 19;
const STICK_RADIUS = 39;
const emptyPad = () => ({ left: false, right: false, up: false, down: false });

type ActiveStick = {
  pointerId: number; centerX: number; centerY: number; localX: number; localY: number;
  startX: number; startY: number; startTime: number; dashed: boolean;
};

/**
 * Mobile v5: independent instant jump, direct-on-press attacks, directional
 * A variants, press-and-hold heavy follow-up and on-confirm cancel buffering.
 * The directional pad NEVER emits `up` to the jump input: a thumb swiping up
 * cannot accidentally jump or open a browser gesture as part of the move.
 * Only an explicitly DOUBLE_JUMP fighter can jump again while airborne.
 */
export const MobileControls: React.FC<MobileControlsProps> = ({
  inputRef, superReady, fixedStick, southpaw, opacity, comboStep,
  isFinisherReady, getFacing, onAction, onDash, onJump,
}) => {
  const activeStick = useRef<ActiveStick | null>(null);
  const buttonPointers = useRef<Partial<Record<ButtonId, number>>>({});
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const padRef = useRef(emptyPad());
  const [stick, setStick] = useState({ active: false, x: 0, y: 0, dx: 0, dy: 0 });
  const [pad, setPad] = useState(emptyPad);
  const [pressed, setPressed] = useState<Partial<Record<ButtonId, boolean>>>({});
  const [chargedHold, setChargedHold] = useState(false);

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const releaseMovement = () => {
    activeStick.current = null;
    for (const dir of directions) inputRef.current[dir] = false;
    padRef.current = emptyPad();
    setStick((old) => ({ ...old, active: false, dx: 0, dy: 0 }));
    setPad(emptyPad());
  };

  const releaseEverything = () => {
    clearHoldTimer();
    releaseMovement();
    buttonPointers.current = {};
    setPressed({});
    setChargedHold(false);
  };

  useEffect(() => {
    const onBlur = () => releaseEverything();
    const onHidden = () => { if (document.hidden) releaseEverything(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      clearHoldTimer();
      for (const dir of directions) inputRef.current[dir] = false;
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef]);

  useEffect(() => {
    if (!superReady) {
      delete buttonPointers.current.super;
      setPressed((old) => old.super ? { ...old, super: false } : old);
    }
  }, [superReady]);

  const updateStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = activeStick.current;
    if (pointer?.pointerId !== event.pointerId) return;
    const dx = event.clientX - pointer.centerX;
    const dy = event.clientY - pointer.centerY;
    const dist = Math.hypot(dx, dy);
    const scale = dist > STICK_RADIUS ? STICK_RADIUS / dist : 1;
    const next = {
      left: dx < -DEADZONE,
      right: dx > DEADZONE,
      up: dy < -DEADZONE * 1.1, // B + arriba = antiaéreo, pero NO salta
      down: dy > DEADZONE * 1.1,
    };
    padRef.current = next; // synchronous even if A/B is pressed in the same RAF
    inputRef.current.left = next.left;
    inputRef.current.right = next.right;
    inputRef.current.down = next.down;
    inputRef.current.up = false;
    setPad((old) => directions.every((dir) => old[dir] === next[dir]) ? old : next);
    setStick({ active: true, x: pointer.localX, y: pointer.localY, dx: dx * scale, dy: dy * scale });

    const travelX = event.clientX - pointer.startX;
    const travelY = event.clientY - pointer.startY;
    const elapsed = performance.now() - pointer.startTime;
    if (!pointer.dashed && elapsed < 225 && Math.abs(travelX) > 60 &&
        Math.abs(travelX) > Math.abs(travelY) * 1.6) {
      pointer.dashed = true;
      onDash(travelX > 0 ? 1 : -1);
    }
  };

  const isForward = () => (getFacing() === 1 && padRef.current.right) ||
                          (getFacing() === -1 && padRef.current.left);
  const techniqueSlot = (): MoveSlot => padRef.current.up ? 'SP_UP' :
    isForward() ? 'SP_FORWARD' : 'SP_NEUTRAL';
  const strikeSlot = (): MoveSlot => padRef.current.down ? 'LOW' :
    isForward() ? 'RUSH' : 'LIGHT';

  const buttonHandlers = (id: ButtonId) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (buttonPointers.current[id] !== undefined || (id === 'super' && !superReady)) return;
      buttonPointers.current[id] = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPressed((old) => ({ ...old, [id]: true }));
      if (id === 'strike') {
        clearHoldTimer();
        setChargedHold(false);
        // Immediate press response: no waiting for release or for hold detection.
        // At confirmed A-A, third A is already a heavy finisher in the engine.
        const directional = padRef.current.down || isForward();
        const finisher = !directional && isFinisherReady();
        onAction(finisher ? 'HEAVY' : strikeSlot());
        if (!finisher) {
          const capturedId = event.pointerId;
          holdTimer.current = setTimeout(() => {
            if (buttonPointers.current.strike !== capturedId) return;
            setChargedHold(true);
            onAction('HEAVY'); // hold follows into a heavy, if first hit connects
          }, HOLD_MS);
        }
      } else if (id === 'skill') onAction(techniqueSlot());
      else if (id === 'jump') onJump();
      else if (id === 'super') onAction('SUPER');
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (buttonPointers.current[id] !== event.pointerId) return;
      if (id === 'strike') clearHoldTimer();
      delete buttonPointers.current[id];
      setPressed((old) => ({ ...old, [id]: false }));
      if (id === 'strike') setChargedHold(false);
    },
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (buttonPointers.current[id] !== event.pointerId) return;
      if (id === 'strike') clearHoldTimer();
      delete buttonPointers.current[id];
      setPressed((old) => ({ ...old, [id]: false }));
      if (id === 'strike') setChargedHold(false);
    },
    onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (buttonPointers.current[id] !== event.pointerId) return;
      if (id === 'strike') clearHoldTimer();
      delete buttonPointers.current[id];
      setPressed((old) => ({ ...old, [id]: false }));
      if (id === 'strike') setChargedHold(false);
    },
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  const forwardHeld = (getFacing() === 1 && pad.right) || (getFacing() === -1 && pad.left);
  const strikeLabel = pad.down ? 'BAJO' : forwardHeld ? 'AVANCE' :
    chargedHold ? 'FUERTE' : comboStep >= 2 ? '¡REMATA!' : comboStep === 1 ? '¡SIGUE!' : 'TAP / HOLD';
  const skillLabel = pad.up ? 'ANTIAÉREO' :
    forwardHeld ? 'AVANCE' : 'ESPECIAL';
  return (
    <nav className={`mobile-controls ${southpaw ? 'is-southpaw' : ''}`}
      style={{ '--mobile-control-opacity': opacity / 100 } as React.CSSProperties}
      aria-label="Controles táctiles del combate">
      <div className="mobile-movement-zone" role="group"
        aria-label="Joystick: mover, agacharse, bloquear; deslizar lateral para dash. El salto tiene botón propio."
        onPointerDown={(event) => {
          event.preventDefault();
          if (activeStick.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const cx = fixedStick ? rect.width * .42 : x;
          const cy = fixedStick ? rect.height * .57 : y;
          activeStick.current = {
            pointerId: event.pointerId, centerX: rect.left + cx, centerY: rect.top + cy,
            localX: cx, localY: cy, startX: event.clientX, startY: event.clientY,
            startTime: performance.now(), dashed: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          updateStick(event);
        }}
        onPointerMove={updateStick}
        onPointerUp={(event) => { if (activeStick.current?.pointerId === event.pointerId) releaseMovement(); }}
        onPointerCancel={(event) => { if (activeStick.current?.pointerId === event.pointerId) releaseMovement(); }}
        onLostPointerCapture={(event) => { if (activeStick.current?.pointerId === event.pointerId) releaseMovement(); }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="mobile-stick-hint" aria-hidden="true"><span className="mobile-stick-cross">✛</span><small>MOVER</small></div>
        {(stick.active || fixedStick) && (
          <div className={`mobile-stick ${stick.active ? 'is-active' : ''}`}
            style={{ left: stick.active ? `${stick.x}px` : '42%', top: stick.active ? `${stick.y}px` : '57%' }} aria-hidden="true">
            <span className="mobile-stick-knob" style={{ transform: `translate(${stick.active ? stick.dx : 0}px,${stick.active ? stick.dy : 0}px)` }} />
          </div>
        )}
      </div>
      <div className="mobile-action-side">
        <div className="mobile-utility-row">
          {superReady && (
            <button type="button" className={`mobile-super ${pressed.super ? 'is-pressed' : ''}`}
              aria-label="Súper cargado: ejecutar ataque definitivo" {...buttonHandlers('super')}>
              <span aria-hidden="true">✦</span><strong>SÚPER</strong>
            </button>
          )}
          <button type="button" className={`mobile-jump ${pressed.jump ? 'is-pressed' : ''}`}
            aria-label="Saltar. Pulsa una segunda vez en el aire solo si tu luchador tiene doble salto" {...buttonHandlers('jump')}>
            <span aria-hidden="true">↑</span><strong>SALTO</strong>
          </button>
        </div>
        <div className="mobile-actions">
          <button type="button" className={`mobile-action mobile-strike ${pressed.strike ? 'is-pressed' : ''} ${chargedHold ? 'is-charged' : ''} ${comboStep ? 'is-combo-ready' : ''}`}
            aria-label="Golpe A: toque inmediato, mantener para enlazar fuerte. Adelante más A avanza, abajo más A golpea bajo" {...buttonHandlers('strike')}>
            <span className="mobile-action-letter" aria-hidden="true">A</span><strong>GOLPE</strong>
            <small>{strikeLabel}</small>
            <span className="mobile-hold-indicator" aria-hidden="true" />
          </button>
          <button type="button" className={`mobile-action mobile-skill ${pressed.skill ? 'is-pressed' : ''}`}
            aria-label={`Técnica B contextual: ${skillLabel}`} {...buttonHandlers('skill')}>
            <span className="mobile-action-letter" aria-hidden="true">B</span><strong>TÉCNICA</strong><small>{skillLabel}</small>
          </button>
        </div>
      </div>
    </nav>
  );
};
