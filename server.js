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
    words: ['Lionel Messi','Shakira','Karol G','Cristiano Ronaldo','Beyoncé','Bad Bunny','Rihanna','Leonardo DiCaprio','Taylor Swift','Don Francisco','Arturo Vidal','Mon Laferte','Freddie Mercury','Michael Jackson','Marilyn Monroe','Albert Einstein','Frida Kahlo','Pablo Neruda','Gabriela Mistral','Charly García']
  },
  peliculas: {
    label: 'Películas y series', emoji: '🎬',
    words: ['Titanic','Harry Potter','El Padrino','Toy Story','Stranger Things','La Casa de Papel','Shrek','Star Wars','Los Simpsons','Friends','Coco','El Rey León','Breaking Bad','Matrix','Jurassic Park','Frozen','Avatar','Los Vengadores','El Chavo del Ocho','Élite']
  },
  animales: {
    label: 'Animales', emoji: '🐨',
    words: ['León','Pingüino','Cóndor','Pulpo','Canguro','Jirafa','Tiburón','Murciélago','Camaleón','Elefante','Panda','Zorro','Delfín','Búho','Guanaco','Flamenco','Erizo','Koala','Avestruz','Cocodrilo']
  },
  profesiones: {
    label: 'Profesiones', emoji: '🛠️',
    words: ['Bombero','Astronauta','Chef','Dentista','Piloto de avión','Youtuber','Arquitecto/a','Enfermero/a','Programador/a','Profesor/a','Detective','Peluquero/a','Veterinario/a','Futbolista','Actor/actriz','Fotógrafo/a','Panadero/a','Buzo','Ingeniero/a','Mecánico/a']
  },
  objetos: {
    label: 'Objetos cotidianos', emoji: '🧦',
    words: ['Paraguas','Microondas','Mochila','Bicicleta','Guitarra','Espejo','Cepillo de dientes','Reloj','Silla','Termo','Lentes de sol','Control remoto','Almohada','Maleta','Bufanda','Linterna','Escoba','Cámara','Cargador','Sombrilla']
  },
  dibujos: {
    label: 'Dibujos y anime', emoji: '👾',
    words: ['Goku','Pikachu','Mickey Mouse','Bob Esponja','Naruto','Doraemon','Mario Bros','Sonic','Bugs Bunny','Homero Simpson','Totoro','Luffy','Popeye','Piolín','Scooby-Doo','El Chapulín Colorado','Kirby','Winnie Pooh','Tom y Jerry','Shin Chan']
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
      winnerId: null
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
    broadcast(code);
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
