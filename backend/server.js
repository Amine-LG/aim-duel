// Aim Duel backend — entry point. Express probes + a Socket.IO realtime layer
// with presence and the room/lobby domain (create, join, ready). The match loop
// and a refactor into src/ modules come once this file genuinely earns it.

const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const MAX_ROOMS = Number.parseInt(process.env.MAX_ROOMS, 10) || 200;
// Ambiguous characters (0/O, 1/I) are left out so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// --- State (in-memory, single process) -------------------------------------
const online = new Map(); // presenceId -> socketId
const rooms = new Map(); // code -> { code, status, players: [...] }

// --- Pure helpers ----------------------------------------------------------
function isValidPresenceId(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}

function normalizeNickname(v) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 20) : '';
}

function normalizeRoomCode(v) {
  const code = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9]{6}$/.test(code) ? code : '';
}

function makeRoomCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to allocate a room code');
}

function freshPlayer(socket, nickname) {
  return {
    socketId: socket.id,
    presenceId: socket.data.presenceId,
    nickname,
    ready: false,
    connected: true
  };
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

function refreshStatus(room) {
  const live = connectedPlayers(room);
  room.status = live.length === 2 && live.every((p) => p.ready) ? 'ready' : 'waiting';
}

// Public payload — socketId/presenceId are deliberately never exposed to peers.
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    players: room.players.map((p, i) => ({
      slot: i + 1,
      nickname: p.nickname,
      ready: p.ready,
      connected: p.connected
    }))
  };
}

// --- HTTP probes -----------------------------------------------------------
const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aim-duel' }));

app.get('/ready', (_req, res) =>
  res.json({
    status: 'ready',
    service: 'aim-duel',
    uptimeSeconds: Math.floor(process.uptime()),
    onlineCount: online.size,
    roomCount: rooms.size
  })
);

// --- Realtime --------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, { serveClient: false });

function channel(code) {
  return `room:${code}`;
}

// One broadcast reaches both players: Socket.IO "rooms" (channels) fan a single
// emit out to every socket that has joined that channel.
function broadcastRoom(room) {
  io.to(channel(room.code)).emit('room_state', { room: publicRoom(room), status: room.status });
}

function setReady(socket, ready) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return;
  const player = room.players.find((p) => p.socketId === socket.id);
  if (!player) return;
  player.ready = ready;
  refreshStatus(room);
  broadcastRoom(room);
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  delete socket.data.roomCode;
  socket.leave(channel(code));

  const room = rooms.get(code);
  if (!room) return;

  const player = room.players.find((p) => p.socketId === socket.id);
  if (player) {
    player.connected = false;
    player.ready = false;
  }

  if (connectedPlayers(room).length === 0) {
    rooms.delete(code); // nobody left — drop it so it can't linger
    return;
  }

  refreshStatus(room);
  broadcastRoom(room);
}

// Authenticate the handshake: a connection must present a plausible presenceId.
io.use((socket, next) => {
  const presenceId = socket.handshake.auth?.presenceId;
  if (!isValidPresenceId(presenceId)) return next(new Error('Invalid presenceId'));
  socket.data.presenceId = presenceId;
  next();
});

io.on('connection', (socket) => {
  online.set(socket.data.presenceId, socket.id);
  console.log(`connected    presence=${socket.data.presenceId} online=${online.size}`);
  socket.emit('server_status', { socketId: socket.id, onlineCount: online.size });
  io.emit('online_count', { onlineCount: online.size });

  socket.on('create_room', (payload = {}) => {
    const nickname = normalizeNickname(payload.nickname);
    if (!nickname) {
      return socket.emit('room_error', { message: 'Enter a nickname up to 20 characters.' });
    }
    if (rooms.size >= MAX_ROOMS) {
      return socket.emit('room_error', { message: 'The server is busy. Try again shortly.' });
    }

    leaveRoom(socket); // a player is only ever in one room
    const code = makeRoomCode();
    const room = { code, status: 'waiting', players: [freshPlayer(socket, nickname)] };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(channel(code));

    socket.emit('room_created', { code, room: publicRoom(room), selfSlot: 1 });
    broadcastRoom(room);
    console.log(`room created ${code} by "${nickname}"`);
  });

  socket.on('join_room', (payload = {}) => {
    const nickname = normalizeNickname(payload.nickname);
    const code = normalizeRoomCode(payload.code);
    if (!nickname) {
      return socket.emit('room_error', { message: 'Enter a nickname up to 20 characters.' });
    }
    if (!code) {
      return socket.emit('room_error', { message: 'Enter a valid 6-character room code.' });
    }

    const room = rooms.get(code);
    if (!room) {
      return socket.emit('room_error', { message: 'Room not found.' });
    }

    // Same browser rejoining (a refresh, say) resumes its existing slot rather
    // than taking a second one; a different browser fills the open slot.
    const mine = room.players.find((p) => p.presenceId === socket.data.presenceId);
    if (mine) {
      mine.socketId = socket.id;
      mine.connected = true;
      mine.nickname = nickname;
    } else {
      if (connectedPlayers(room).length >= 2) {
        return socket.emit('room_error', { message: 'Room is full.' });
      }
      leaveRoom(socket);
      room.players.push(freshPlayer(socket, nickname));
    }

    socket.data.roomCode = code;
    socket.join(channel(code));
    const slot = room.players.findIndex((p) => p.socketId === socket.id) + 1;
    refreshStatus(room);

    socket.emit('room_joined', { room: publicRoom(room), selfSlot: slot });
    broadcastRoom(room);
    console.log(`room joined  ${code} by "${nickname}"`);
  });

  socket.on('player_ready', () => setReady(socket, true));
  socket.on('player_unready', () => setReady(socket, false));
  socket.on('leave_room', () => leaveRoom(socket));

  socket.on('disconnect', () => {
    leaveRoom(socket);
    // Only clear presence if this socket still owns it (a newer socket from the
    // same presence must not be evicted by an older one disconnecting).
    if (online.get(socket.data.presenceId) === socket.id) {
      online.delete(socket.data.presenceId);
      io.emit('online_count', { onlineCount: online.size });
    }
    console.log(`disconnected presence=${socket.data.presenceId} online=${online.size}`);
  });
});

server.listen(PORT, () => {
  console.log(`Aim Duel backend listening on port ${PORT}`);
});
