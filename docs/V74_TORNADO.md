# V74 - Tornado vertical multigolpe (motor v4 / e4)

Corrige una pieza, no es un reequilibrio general.

## Problema
El tornado vertical (VERTICAL_TORNADO) tiene 5 golpes de 1/5 del dano, pero el primer golpe derribaba y los otros 4 no podian conectar: hacia ~1/4 del dano nominal. Ya se corrigio igual el ataque giratorio en v3. La IA CPU del ZONER_MAGE cerca del rival solo usa la especial arriba, por lo que Don Farol, Madurito y Don Diamante (los tres con tornado) quedaban en 6%, 26% y 20% de victorias.

## Cambio (solo con `simVersion >= 4`)
- Solo el ultimo golpe del tornado derriba.
- Dano total del tornado: 70% del nominal.
- Escenario controlado (SP_UP contra rival quieto, 60 fotogramas): v3 1 golpe y ~21 de dano; v4 4 golpes y ~50.

## Versionado
`SIM_VERSION = 4`, motor archivado `server/tournament/archive/e4`. e1/e2/e3 intactos. Los combates v3 y anteriores se repiten igual (`tests/v74.tornado-v4.test.cjs`). La migracion `202611270001_v74_engine_e4.sql` cambia solo el motor por defecto de torneos NUEVOS; el torneo en curso sigue en e3.

## Medicion (CPU vs CPU, tacticas por defecto, 14 luchadores publicados, 60 combates por pareja)
Antes -> despues: Madurito 26 -> 49, Don Diamante 20 -> 42, Don Farol 6 -> 16, Ferbyravero 62 -> 50, Ruina Rex 74 -> 67, Florbombin 62 -> 64, Bigotrueno 46 -> 41, Los Simpson 34 -> 26.

## Limites
No es el equilibrio total: Don Farol y Los Simpson siguen en el fondo (kit y estadisticas, no el tornado). Los porcentajes salen de simulaciones por defecto, no de humanos ni de torneos con tacticas propias. La IA del zoner no se ha tocado.
