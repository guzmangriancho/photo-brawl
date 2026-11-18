# PHOTO BRAWL V29 · Archivo privado de administracion

Esta versión incluye V28 y anteriores. Solo para la cuenta admin designada como **@guzmangriancho**, dentro de **INICIO → AJUSTES**, aparece el interruptor **VER TODOS LOS LUCHADORES**. Apagado mantiene la Comunidad habitual; encendido muestra los luchadores privados y públicos sincronizados, en **COMUNIDAD → EXPLORAR**, sin posibilidad de modificarlos.

**IMPORTANTE: Ejecuta `supabase/migrations/202611180003_admin_fighter_gallery.sql` en SQL Editor, con la cuenta @guzmangriancho ya creada.** Verifica el ID asignado siguiendo `docs/ADMIN_GALERIA_V29.md`. El control estará oculto hasta que se aplique la migración. No hace falta cambiar el servidor online.

Para compilar: `npm ci && npm test && npm run build`. Se conserva IndexedDB y la información de los usuarios.

---

# PHOTO BRAWL V27 · Escuela Arcade avanzada

Incluye íntegramente los cambios de V24 a V26. Se añaden **14 ejercicios guiados** para aprender los controles del combate, con validación de las acciones reales, práctica de bloqueo/parry contra un muñeco que avisa antes de golpear, y una tarjeta pixel art compacta adaptada a móvil. En el menú: **Inicio → Tutorial**.

**Instalación:** `npm ci`, `npm test` y `npm run build`. Para online se mantiene el despliegue de frontend y servidor consistente con los cambios de versiones anteriores; V27 no exige modificar el protocolo ni ejecutar nuevas migraciones SQL. La caché de PWA cambia para recoger la actualización. Consulta `docs/TUTORIAL_AVANZADO_V27.md`.

## Información de versiones anteriores

# PHOTO BRAWL V25 · Defensa y combate equilibrado

**Proyecto completo, basado en V24**. Se conservan la sala online compacta, la creación y pegado de imágenes, la pantalla de resultados, los luchadores guardados y las funciones online.

## Novedades

- El botón **CUBRIR** del móvil (teclado **Q** para jugador 1 / **N** para jugador 2) permite bloquear sin tener que retroceder. Mientras lo mantienes pulsado puedes caminar **hacia delante o atrás** con el joystick/flechas, a velocidad defensiva. **Abajo + CUBRIR** protege de bajos; en guardia normal, de medios y altos. La defensa tiene prioridad sobre las nuevas órdenes de ataque.
- **Parry:** si pulsas CUBRIR durante los **5 fotogramas previos** a un jab, el golpe se interrumpe, el rival retrocede y aparece un destello pequeño de píxeles. Mantener CUBRIR mucho antes del jab bloquea, pero no hace parry automático.
- **Antispam:** la presión de jabs tiene menos aturdimiento y el tercer golpe normal deja margen para escapar. Se permite **un disparo activo por luchador**, con un descanso mínimo de 70 fotogramas entre lanzamientos. La ráfaga tipo escopeta tiene 45 fotogramas de descanso.
- **Ataques súper** con efectos y destello escalados desde resolución interna 320×180 sin suavizado, en estética pixel art. Los sprites originales de los personajes no se pixelan artificialmente.

## Instalar / desplegar

1. Extrae el ZIP completo en tu proyecto. **No es un parche parcial.**
2. Instala dependencias con `npm ci`.
3. Ejecuta `npm test` y `npm run build`.
4. Para el servidor online: `npm run build:server-engine` y reinicia el servidor Node (`npm run dev:server` en local).
5. Actualiza **tanto Vercel como Render**, ya que ha cambiado el protocolo de guardia. Se ha incrementado la caché de la PWA para recoger la versión nueva.

No hay ninguna migración SQL nueva para V25. No borres los personajes existentes ni la base de datos.

## Verificación realizada

Se ejecutó `npm test` y se compiló el motor del servidor. La compilación final del frontend requiere instalar el conjunto completo de dependencias; no se ha validado en un dispositivo móvil real.
