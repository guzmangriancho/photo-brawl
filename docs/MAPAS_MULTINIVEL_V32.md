# PHOTO BRAWL V32 — Ajuste de suelo y bajada de plataformas

Los suelos continuos se desplazan a una línea situada aproximadamente en el centro visual de la franja de suelo en perspectiva. Se mantienen intactas las coordenadas de **todas** las plataformas superiores.

| Arena | Suelo anterior | Suelo V32 |
|---|---:|---:|
| Atlántida | 454 | 482 |
| Bosque | 453 | 488 |
| Celestial | 446 | 489 |
| Volcán | 436 | 478 |

Coordenadas en mundo 960×540.

**Bajada:** al pasar a joystick exclusivamente hacia abajo (sin izquierda ni derecha) y encontrarse apoyado sobre una plataforma de una arena nueva, el luchador atraviesa esa plataforma. El suelo principal nunca es atravesable. Apuntar abajo en diagonal NO activa la bajada. La bajada requiere una nueva entrada vertical pura, para evitar repetirse automáticamente al mantenerla. La guardia no provoca descensos.

**Despliegue:** actualizar frontend en Vercel y motor online en Render. No hace falta migración SQL.
