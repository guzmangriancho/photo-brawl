# V27 · Escuela Arcade (tutorial de combate)

## Acceso

Inicio → **Tutorial** → elegir uno de los cuatro personajes gratuitos → **Empezar tutorial**. El modo es `TRAINING`, separado de los luchadores creados por el usuario y de las partidas normales/online.

## Los 14 ejercicios

1. **Camina:** mover al personaje una distancia real.
2. **Dash:** ejecutar un impulso (gesto horizontal rápido en el joystick; Mayús o doble dirección en teclado).
3. **Salta:** despegar del suelo (SALTO / W).
4. **Defensa móvil:** avanzar o retroceder manteniendo **CUBRIR** (Q).
5. **Jab certero:** conectar GOLPE (A / F) con el rival.
6. **Enlaza jabs:** lograr dos impactos seguidos dentro del mismo combo.
7. **Remate fuerte:** terminar un combo de al menos tres impactos con HEAVY (tercer A o mantener A / H).
8. **Golpe bajo:** atacar abajo + A / S+F contra un muñeco que defiende alto. Debe golpear.
9. **Técnica neutra:** usar B sin dirección / G.
10. **Técnica hacia delante:** joystick hacia rival + B / dirección adelante + G.
11. **Técnica hacia arriba:** joystick arriba + B / W+G.
12. **Defensa de jab:** bloquear un golpe real manteniendo CUBRIR / Q.
13. **Parry:** soltar la guardia y activarla dentro de los cinco fotogramas previos al impacto de un jab. El golpe se cancela y el rival retrocede.
14. **Súper:** lanzar el súper con el botón grande que aparece al centro inferior al tener 100 % de medidor / Y.

Al completar todos los ejercicios se puede practicar libremente, repetir la escuela o volver al menú.

## Diseño y validación

- Tarjeta superpuesta compacta, con contador, progreso, objetivo, ayuda opcional y botones **SALTAR PASO / SALIR**; sin scroll interno.
- Solo se avanza por evidencia del motor (`state`, `hasHit`, `comboCount`, `blockstunFrames`, `parryBursts`, etc.). Pulsar un botón sin acertar no completa un combo ni un golpe bajo. Los saltos manuales son explícitos.
- Al cambiar a ejercicios ofensivos o defensivos, el rival se reposiciona de forma segura para dar espacio al ataque. La barra de súper está llena en entrenamiento.
- Para el bloqueo y el parry, `TUTORIAL_JABS` envía jabs espaciados cada 100 fotogramas, con arranque prolongado de 30 fotogramas y un aviso visual cerca del impacto. Esa demora se aplica **exclusivamente en `TRAINING` con este muñeco**, no en CPU, versus online ni otros entrenamientos.
- Se elimina el conteo duplicado de `keydown` y `keyup` del tutorial anterior. Los controles móviles de V26 permanecen intactos.

## Pruebas y despliegue

- `npm run test:v27` cubre pasos, combos, defensas, parry, configuración del muñeco y validación real de golpes.
- `npm test` mantiene las suites existentes.
- `npm run build:server-engine` verifica que el motor conserva su compatibilidad con el servidor online.
- El frontend requiere las dependencias originales completas para `npm run build`. No hay nuevas migraciones SQL ni modificaciones a los luchadores guardados.
- La versión de caché se ha actualizado a `pb-shell-v27-arcade-school`; tras desplegar, cerrar y reabrir la PWA si continúa apareciendo la anterior.
