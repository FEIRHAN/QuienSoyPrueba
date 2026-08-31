# ¿Quién Soy? — juego online

Juego de adivinar personajes (estilo "Heads Up") para jugar con amigos a
distancia. Un jugador crea una sala, comparte el código, y en cada turno
todos ven la palabra en pantalla menos quien debe adivinar.

## Cómo correrlo localmente

```
npm install
npm start
```

Abre http://localhost:3000 en el navegador (o en varias pestañas/celulares
en la misma red, cambiando localhost por la IP de tu computador).

## Cómo desplegarlo en Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render (render.com), crea un **New Web Service** y conéctalo a ese
   repositorio.
3. Configuración:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free está bien para jugar con amigos.
4. Render te asigna una URL pública (algo como
   `https://quien-soy-online.onrender.com`). Esa es la que comparten para
   jugar.

## Notas importantes

- Las salas se guardan en memoria del servidor. Si el proceso se reinicia
  (por ejemplo, el plan gratis de Render "duerme" el servicio tras un rato
  sin tráfico y tarda ~30-50s en despertar en la primera visita), las salas
  activas se pierden. Para una partida corta con amigos no debería ser
  problema, solo avisa que la primera carga puede demorar un poco si el
  servicio estaba dormido.
- No hay base de datos ni login: es intencionalmente simple para uso
  casual.
