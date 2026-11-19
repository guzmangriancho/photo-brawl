# PHOTO BRAWL V49 — corrección TS18047

Se han corregido los dos accesos al cliente Supabase que TypeScript detectaba como potencialmente nulos:

- `src/App.tsx`: el botón **CERRAR SESIÓN** usa encadenamiento opcional (`supabase?.auth.signOut()`).
- `src/services/usePlayerAccount.ts`: se conserva una referencia local `client` comprobada antes de usarla en los callbacks asíncronos.

No cambia el funcionamiento de acceso obligatorio ni el orden de inicio (verificación de usuario, sincronización y recuperación desde la nube). Se ha añadido una prueba de regresión a `tests/v49.required-auth-startup.test.cjs`.

En tu ordenador, desde la carpeta raíz del proyecto, ejecuta:

```bat
npm install
npm run build
```

Para ejecutar las pruebas específicas de V49:

```bat
npm run test:v49
```

Las siete pruebas de V49 han pasado en el entorno de preparación. Aquí no se ha podido completar `npm run build` porque faltan paquetes y definiciones de tipo en `node_modules`; no se incluye el `dist` de una compilación antigua.
