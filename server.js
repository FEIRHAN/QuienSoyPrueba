const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Word pools ----------
const THEMES = {
  famosos: {
    label: 'Personajes famosos', emoji: '🌟',
    words: ['Lionel Messi','Shakira','Karol G','Cristiano Ronaldo','Beyoncé','Bad Bunny','Rihanna','Leonardo DiCaprio','Taylor Swift','Don Francisco','Arturo Vidal','Mon Laferte','Freddie Mercury','Michael Jackson','Marilyn Monroe','Albert Einstein','Frida Kahlo','Pablo Neruda','Gabriela Mistral','Charly García','Alexis Sánchez','Claudio Bravo','Myriam Hernández','Américo','Daddy Yankee','Selena Gomez','Dua Lipa','Ed Sheeran','Will Smith','Dwayne Johnson','Emma Watson','Tom Cruise','Elon Musk','Adele','Billie Eilish','Barack Obama','Nelson Mandela']
  },
  peliculas: {
    label: 'Películas y series', emoji: '🎬',
    words: ['Titanic','Harry Potter','El Padrino','Toy Story','Stranger Things','La Casa de Papel','Shrek','Star Wars','Los Simpsons','Friends','Coco','El Rey León','Breaking Bad','Matrix','Jurassic Park','Frozen','Avatar','Los Vengadores','El Chavo del Ocho','Élite','Interstellar','El Señor de los Anillos','Piratas del Caribe','Joker','Spider-Man','Batman','Wednesday','The Office','Peaky Blinders','Narcos','Black Mirror','Coraline','Up','Inside Out','Encanto','La La Land','Parásitos','Squid Game']
  },
  animales: {
    label: 'Animales', emoji: '🐨',
    words: ['León','Pingüino','Cóndor','Pulpo','Canguro','Jirafa','Tiburón','Murciélago','Camaleón','Elefante','Panda','Zorro','Delfín','Búho','Guanaco','Flamenco','Erizo','Koala','Avestruz','Cocodrilo','Rinoceronte','Hipopótamo','Oso polar','Lobo','Águila','Serpiente','Mono','Foca','Cebra','Puma','Chinchilla','Vicuña']
  },
  profesiones: {
    label: 'Profesiones', emoji: '🛠️',
    words: ['Bombero','Astronauta','Chef','Dentista','Piloto de avión','Youtuber','Arquitecto/a','Enfermero/a','Programador/a','Profesor/a','Detective','Peluquero/a','Veterinario/a','Futbolista','Actor/actriz','Fotógrafo/a','Panadero/a','Buzo','Ingeniero/a','Mecánico/a','Abogado/a','Psicólogo/a','Piloto de carreras','Diseñador/a gráfico/a','DJ','Barista','Guía turístico/a','Bibliotecario/a']
  },
  objetos: {
    label: 'Objetos cotidianos', emoji: '🧦',
    words: ['Paraguas','Microondas','Mochila','Bicicleta','Guitarra','Espejo','Cepillo de dientes','Reloj','Silla','Termo','Lentes de sol','Control remoto','Almohada','Maleta','Bufanda','Linterna','Escoba','Cámara','Cargador','Sombrilla','Audífonos','Cortaúñas','Plancha','Batería externa','Mouse','Teclado','Tetera','Sacapuntas']
  },
  anime: {
    label: 'Anime', emoji: '🍥',
    words: ['Naruto Uzumaki','Goku','Luffy','Sasuke Uchiha','Ichigo Kurosaki','Levi Ackerman','Eren Jaeger','Mikasa Ackerman','Deku','All Might','Saitama','Light Yagami','L','Edward Elric','Natsu Dragneel','Gon Freecss','Killua Zoldyck','Tanjiro Kamado','Nezuko Kamado','Zoro','Nami','Vegeta','Sailor Moon','Doraemon','Shin Chan','Totoro','Chopper','Rem','Anya Forger','Gojo Satoru']
  },
  dibujo_animado: {
    label: 'Dibujo animado', emoji: '🐭',
    words: ['Mickey Mouse','Bob Esponja','Homero Simpson','Bugs Bunny','Piolín','Tom y Jerry','Scooby-Doo','El Chapulín Colorado','Winnie Pooh','Popeye','Los Picapiedra','Pato Donald','Peter Griffin','Stewie Griffin','Rick Sanchez','Morty Smith','Las Chicas Superpoderosas','Ben 10','Phineas y Ferb','Bob Patiño','Patricio Estrella','Marge Simpson','El Coyote y el Correcaminos','Dexter','Timmy Turner','Garfield','Hora de Aventura']
  },
  videojuegos: {
    label: 'Videojuegos', emoji: '🎮',
    words: ['Mario Bros','Sonic','Kirby','Link','Pac-Man','Master Chief','Lara Croft','Kratos','Steve (Minecraft)','Among Us','Sans','Cuphead','Crash Bandicoot','Spyro','Ryu','Chun-Li','Geralt de Rivia','Pikachu','Charizard','Mega Man','Donkey Kong','Yoshi','Bowser','Zelda','Samus Aran','Ezio Auditore','Solid Snake','GLaDOS','Freddy Fazbear','Peach']
  }
};

const THEME_META = Object.fromEntries(
  Object.entries(THEMES).map(([key, t]) => [key, { label: t.label, emoji: t.emoji }])
);

// In-memory room store: code -> room object
// NOTE: rooms live only in server memory. If the server restarts (e.g. Render
// free-tier idles and spins back up), active rooms are lost. Fine for a
// casual party game played in one sitting.
const rooms = new Map();

// setTimeout handles per room code — kept out of the room object since they
// can't be serialized/sent to clients.
const turnTimers = new Map();

const TURN_MS = 90 * 1000;
const DEFAULT_TARGET_SCORE = 15;
// Groq gives out free API keys with no billing/credit card required, and
// serves open models (Llama) fast — good fit for this small JSON task.
const AI_MODEL = 'llama-3.3-70b-versatile';
const AI_COOLDOWN_MS = 8 * 1000; // avoid spamming the API from one room

function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
function pickNextWord(room) {
  const pool = room.wordPool.filter(w => !room.usedWords.includes(w));
  if (pool.length === 0) {
    room.usedWords = [];
    return room.wordPool[Math.floor(Math.random() * room.wordPool.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
function broadcast(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('room-update', room);
}

function clearTurnTimer(code) {
  const handle = turnTimers.get(code);
  if (handle) clearTimeout(handle);
  turnTimers.delete(code);
}

// Starts (or restarts) the 90s countdown for whoever is currently guessing.
// If it fires with nobody having confirmed a correct guess, the turn moves
// to the next player automatically — no points awarded — so a round can
// never be dragged out indefinitely.
function scheduleTurnTimer(code) {
  clearTurnTimer(code);
  const room = rooms.get(code);
  if (!room || room.status !== 'playing') return;
  room.turnEndsAt = Date.now() + TURN_MS;
  const handle = setTimeout(() => advanceGuesser(code, { scored: false }), TURN_MS);
  turnTimers.set(code, handle);
}

// Moves the turn to the next player with a fresh word. `scored: true` also
// awards the point to whoever was just guessing before rotating.
function advanceGuesser(code, { scored }) {
  const room = rooms.get(code);
  if (!room || room.status !== 'playing') return;
  const idx = room.players.findIndex(p => p.id === room.currentGuesserId);
  if (idx < 0) return;

  if (scored) {
    room.players[idx].score += 1;
    if (room.players[idx].score >= room.targetScore) {
      finishGame(code, room.players[idx].id);
      return;
    }
  }

  const nextIdx = (idx + 1) % room.players.length;
  room.currentGuesserId = room.players[nextIdx].id;
  const word = pickNextWord(room);
  room.usedWords.push(word);
  room.currentWord = word;
  room.turnCount += 1;
  scheduleTurnTimer(code); // also broadcasts via the room-update after
  broadcast(code);
}

function finishGame(code, winnerId) {
  const room = rooms.get(code);
  if (!room) return;
  clearTurnTimer(code);
  room.status = 'finished';
  room.winnerId = winnerId;
  room.currentWord = null;
  room.currentGuesserId = null;
  broadcast(code);
}

// Asks Groq (free API, no billing required) for a fresh word list on any
// topic the host types in. Returns a clean array of short strings, or
// throws if the API/JSON parsing fails.
async function generateThemeWords(topic) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Respondes únicamente con un objeto JSON válido, sin texto adicional, sin markdown ni backticks.'
        },
        {
          role: 'user',
          content: `Genera una lista de 24 elementos para jugar a "¿Quién soy?" ` +
            `(adivinar con preguntas de sí/no) sobre este tema: "${topic}".\n\n` +
            `Reglas:\n` +
            `- Cada elemento debe ser un personaje, persona, objeto o cosa concreta y reconocible relacionada con el tema, no un concepto abstracto.\n` +
            `- Máximo 4 palabras por elemento.\n` +
            `- No repitas elementos.\n` +
            `- Nada violento, sexual, de odio ni inapropiado para todo público. Si el tema en sí es inapropiado o poco claro, responde con una lista vacía.\n` +
            `- Responde con un objeto JSON con esta forma exacta: {"words": ["Elemento 1", "Elemento 2", ...]}`
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('Respuesta sin contenido');

  const parsed = JSON.parse(content);
  const words = Array.isArray(parsed.words) ? parsed.words : (Array.isArray(parsed) ? parsed : null);
  if (!words) throw new Error('Formato inesperado');
  return words.map(w => String(w).trim()).filter(Boolean).slice(0, 40);
}

io.on('connection', (socket) => {
  socket.on('get-themes', (_data, cb) => {
    if (typeof cb === 'function') cb(THEME_META);
  });

  socket.on('create-room', ({ name }, cb) => {
    name = (name || '').trim().slice(0, 24) || 'Jugador';
    const code = roomCode();
    const myId = uid();
    const room = {
      code,
      hostId: myId,
      players: [{ id: myId, name, score: 0, connected: true }],
      themeKey: 'famosos',
      wordPool: THEMES.famosos.words.slice(),
      usedWords: [],
      status: 'lobby',
      currentGuesserId: null,
      currentWord: null,
      turnCount: 0,
      targetScore: DEFAULT_TARGET_SCORE,
      turnEndsAt: null,
      winnerId: null,
      customLabel: null,
      aiGenerating: false
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.code = code;
    socket.data.playerId = myId;
    cb({ ok: true, playerId: myId, room });
  });

  socket.on('join-room', ({ code, name }, cb) => {
    code = (code || '').trim().toUpperCase();
    name = (name || '').trim().slice(0, 24) || 'Jugador';
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'No encontramos esa sala. Revisa el código.' });
    const myId = uid();
    room.players.push({ id: myId, name, score: 0, connected: true });
    socket.join(code);
    socket.data.code = code;
    socket.data.playerId = myId;
    broadcast(code);
    cb({ ok: true, playerId: myId, room });
  });

  socket.on('rejoin-room', ({ code, playerId }, cb) => {
    code = (code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const player = room && room.players.find(p => p.id === playerId);
    if (!room || !player) return cb({ ok: false });
    player.connected = true;
    socket.join(code);
    socket.data.code = code;
    socket.data.playerId = playerId;
    broadcast(code);
    cb({ ok: true, room });
  });

  socket.on('set-theme', ({ code, themeKey }) => {
    const room = rooms.get(code);
    if (!room || !THEMES[themeKey] || socket.data.playerId !== room.hostId) return;
    room.themeKey = themeKey;
    room.wordPool = THEMES[themeKey].words.slice();
    room.usedWords = [];
    room.customLabel = null;
    broadcast(code);
  });

  socket.on('generate-ai-theme', async ({ code, topic }, cb) => {
    const reply = (payload) => { if (typeof cb === 'function') cb(payload); };
    const room = rooms.get(code);
    if (!room) return reply({ ok: false, error: 'Sala no encontrada.' });
    if (socket.data.playerId !== room.hostId) return reply({ ok: false, error: 'Solo el anfitrión puede generar categorías.' });
    const cleanTopic = (topic || '').trim().slice(0, 80);
    if (!cleanTopic) return reply({ ok: false, error: 'Escribe un tema primero.' });
    if (!process.env.GROQ_API_KEY) {
      return reply({ ok: false, error: 'Falta configurar GROQ_API_KEY en el servidor (variable de entorno en Render).' });
    }
    const lastAt = room.lastAiRequestAt || 0;
    if (Date.now() - lastAt < AI_COOLDOWN_MS) {
      return reply({ ok: false, error: 'Espera unos segundos antes de generar otra categoría.' });
    }
    room.lastAiRequestAt = Date.now();
    room.aiGenerating = true;
    broadcast(code);
    try {
      const words = await generateThemeWords(cleanTopic);
      room.aiGenerating = false;
      if (!words || words.length < 8) {
        broadcast(code);
        return reply({ ok: false, error: 'No se pudo generar esa categoría (puede ser un tema poco claro o sensible). Prueba con otro.' });
      }
      room.themeKey = 'custom';
      room.customLabel = cleanTopic;
      room.wordPool = words;
      room.usedWords = [];
      broadcast(code);
      reply({ ok: true });
    } catch (err) {
      room.aiGenerating = false;
      broadcast(code);
      console.error('AI theme generation failed:', err.message);
      reply({ ok: false, error: 'Error generando la categoría. Intenta de nuevo.' });
    }
  });

  socket.on('add-words', ({ code, text }) => {
    const room = rooms.get(code);
    if (!room || socket.data.playerId !== room.hostId) return;
    const words = (text || '').split(',').map(w => w.trim()).filter(Boolean).slice(0, 50);
    room.wordPool = room.wordPool.concat(words);
    broadcast(code);
  });

  socket.on('start-game', ({ code, targetScore }) => {
    const room = rooms.get(code);
    if (!room || socket.data.playerId !== room.hostId) return;
    if (room.players.length < 2) return;
    const parsed = parseInt(targetScore, 10);
    room.targetScore = (Number.isFinite(parsed) && parsed > 0) ? Math.min(parsed, 999) : DEFAULT_TARGET_SCORE;
    room.players.forEach(p => (p.score = 0));
    room.usedWords = [];
    room.winnerId = null;
    const guesser = room.players[0];
    const word = pickNextWord(room);
    room.usedWords.push(word);
    room.currentWord = word;
    room.currentGuesserId = guesser.id;
    room.status = 'playing';
    room.turnCount = 1;
    scheduleTurnTimer(code);
    broadcast(code);
  });

  // Anyone in the room can confirm a correct guess (not just the host).
  socket.on('correct-guess', ({ code }) => {
    advanceGuesser(code, { scored: true });
  });

  socket.on('pass-turn', ({ code }) => {
    // Gives up on the current word only — same guesser, same countdown,
    // just a new word to try. Doesn't rotate the turn or reset the timer.
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const word = pickNextWord(room);
    room.usedWords.push(word);
    room.currentWord = word;
    room.turnCount += 1;
    broadcast(code);
  });

  socket.on('end-game', ({ code }) => {
    const room = rooms.get(code);
    if (!room || socket.data.playerId !== room.hostId) return;
    clearTurnTimer(code);
    room.status = 'lobby';
    room.currentWord = null;
    room.currentGuesserId = null;
    room.turnEndsAt = null;
    room.winnerId = null;
    room.players.forEach(p => (p.score = 0));
    room.usedWords = [];
    broadcast(code);
  });

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    const room = code && rooms.get(code);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.connected = false;
    broadcast(code);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Quien Soy corriendo en puerto', PORT));
