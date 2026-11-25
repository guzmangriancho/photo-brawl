# Archivo inmutable de motores de torneo

Cada carpeta `eN/` es una copia **congelada** del motor compilado (FightEngine, IA CPU, escenarios, tipos)
tal y como jugó los combates de los torneos que usan `engine_version = 'eN'`.
**No se edita nunca.** Si el motor o la IA cambian el resultado de un combate:
1. Sube `SIM_VERSION` en `src/engine/fightSeed.ts`.
2. Copia `server/runtime` a `server/tournament/archive/e(N+1)/` y registra la nueva versión en `server/tournament/sim.cjs` (`ENGINES`).
3. Los torneos ya creados siguen con su `engine_version`.
`tests/v66.tournament-engine-archive.test.cjs` falla si el motor actual cambia sin archivo nuevo.
