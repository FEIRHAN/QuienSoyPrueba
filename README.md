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

## Categorías generadas con IA

El anfitrión puede escribir cualquier tema en el lobby ("Crear categoría con
IA") y el servidor le pide a un modelo de IA que genere ~24 palabras para
esa categoría. Usa **Groq**, que da API keys gratis sin pedir tarjeta de
crédito ni facturación:

1. Crea una cuenta gratis en https://console.groq.com (solo correo).
2. Ve a **API Keys** → **Create API Key** y cópiala.
3. En Render, ve a tu Web Service → **Environment** → agrega una variable:
   - **Key**: `GROQ_API_KEY`
   - **Value**: tu API key (empieza con `gsk_...`)
4. Guarda y Render redesplegará automáticamente con la variable disponible.

Si no configuras esta variable, el botón de "Generar categoría" seguirá
visible pero mostrará un aviso pidiendo configurarla — el resto del juego
(categorías fijas) funciona igual sin ella.

Groq tiene un límite de uso gratis (peticiones por minuto/día) más que
suficiente para jugar con amigos. Hay además un enfriamiento de 8 segundos
entre generaciones por sala para evitar spam accidental.

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
