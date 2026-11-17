# PHOTO BRAWL V23 · Sala online personalizable

Este ZIP contiene únicamente los archivos modificados o nuevos de V23 respecto a V22.

## Novedades

- Selector de luchadores dentro del popup de sala online, para anfitrión e invitado.
- Cambiar de luchador durante la espera o la cuenta atrás cancela la cuenta atrás y obliga a ambos a confirmar de nuevo.
- Nueva opción de arena `AZAR`, elegible por el anfitrión.
- En modo `AZAR`, el servidor decide la arena al iniciar y elige otra distinta en cada revancha.
- La arena nueva se aplica en ambos clientes sin salir del combate ni recrear la sala.
- Se renueva la caché de la PWA para que los dispositivos recojan la nueva interfaz.

## Instalación

1. Aplica primero PHOTO BRAWL V22 sobre V21 si todavía no lo has hecho.
2. Descomprime este ZIP en la raíz del proyecto y acepta reemplazar los archivos manteniendo las carpetas.
3. Ejecuta `npm test` o, como mínimo, `npm run test:online`.
4. Sube los cambios a GitHub.
5. Despliega el frontend en Vercel y el servidor online en Render. Esta versión modifica `server/rooms.cjs`, por lo que actualizar solo Vercel no basta.

No hay una migración SQL nueva en V23. La migración de resultados V22 solo es necesaria si aún no se ejecutó.
