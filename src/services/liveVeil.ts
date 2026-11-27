/** Estado de la consulta a /tournament/live y velo anti spoilers.
 *  El velo del propio combate depende de esa respuesta. Mientras no se sepa si hay un directo en ventana (primer intento pendiente o fallido
 *  sin respuesta anterior) el torneo se puede usar (inscripción, tácticas) pero el campeón, los resultados y el cuadro quedan tapados.
 *  - 'loading': primer intento en curso (pantalla de carga).
 *  - 'unknown': el intento falló y no hay respuesta previa: pantalla usable con todo tapado y reintento con espera creciente, sin límite.
 *  - 'ready': hay una respuesta válida (una posterior que falle no la quita: se conserva). */
export type LiveGate = 'loading' | 'unknown' | 'ready';
export function liveGate(haveInfo: boolean, failed: boolean): LiveGate {
  if (haveInfo) return 'ready';
  return failed ? 'unknown' : 'loading';
}
/** Espera antes del siguiente reintento tras el fallo número n (n>=1): 2 s, 4 s, 6 s, 8 s y 10 s como máximo. */
export function liveRetryDelayMs(consecutiveFails: number): number {
  return Math.min(10000, 2000 * Math.max(1, Math.floor(consecutiveFails)));
}
