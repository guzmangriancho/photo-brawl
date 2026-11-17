# PHOTO BRAWL V17 · Efectos de combate

## Qué se ha cambiado

Los efectos de super, movimientos especiales, bloqueo, meteoritos, proyectiles,
ondas de choque y partículas ya no dependen de cajas de color sin detalle.
`src/engine/ArcadeVFX.ts` dibuja siluetas pixeladas por capas, estelas,
destellos radiales, medias lunas y polígonos con bordes irregulares.

Los cuatro super tienen tratamientos diferentes:
- `GIANT_BEAM_LASER`: cañón con múltiples capas, núcleo blanco, borde dentado y chispas de aceleración.
- `MULTI_HIT_RUSH_COMBO`: tajos alternos, estelas y líneas de alta velocidad.
- `METEOR_SCREEN_DROP`: cometas con colas y núcleos brillantes, además de ondas de impacto.
- `OMEGA_SUPLEX`: ondas circulares partidas y fragmentos que orbitan el agarre.

Además, la defensa alta y baja usan escudos curvos, los impactos crean estelas de
chispa direccionales y las explosiones dibujan anillos fragmentados. Los proyectiles
mantienen la imagen personalizada del personaje cuando existe: las nuevas estelas son
complementarias, nunca un reemplazo del arte generado.

## Sincronización y rendimiento

- No se modifica daño, físicas, hitboxes, ventanas de combo, estadísticas ni
  resultados de ronda.
- El módulo de efectos solo dibuja en Canvas 2D. **No añade llamadas aleatorias
  ni genera partículas durante el render**, evitando diferencias entre refrescos
  de 60 y 120 Hz y efectos de crecimiento infinito.
- Las partículas con `kind` opcional se envían en el snapshot online ya existente.
  Los clientes antiguos pueden tratarlas como cuadrados sin afectar al combate.
- Límite de 160 partículas activas en el motor, para controlar coste gráfico y
  tráfico de snapshots en móviles.
- Los personajes personalizados mantienen su color de energía `primaryHex`.
- La PWA usa una nueva versión de caché para servir la V17.

## Probar antes de publicar

```sh
npm install
npm run build
npm test
npm run dev -- --host 0.0.0.0
```

Para probar dos móviles por Internet, publicar V17 tanto en **Vercel** como en
**Render**, porque `FightEngine.ts` también lo compila el servidor.

Las pruebas de VFX se pueden ejecutar por separado con `npm run test:vfx`.
Conviene comprobar en dispositivo físico: visibilidad de bloqueos altos/bajos,
color de cada personaje, proyectil personalizado, supers de los cuatro tipos,
fluidez y rendimiento durante combos rápidos y meteoritos.

**No se alteran IndexedDB, Supabase, la migración ni los personajes creados.**
