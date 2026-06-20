// Socket.IO wiring: authenticates the handshake, registers presence, parses
// event payloads, and delegates to the room service. No game state lives here.
//
// Metrics note: this is the single choke point every client event flows
// through — per-event counters/timers belong here later.

const { Server } = require('socket.io');
const config = require('./config');
const { track } = require('./instrumentation');
const { isValidPresenceId, normalizeNickname, normalizeRoomCode } = require('./validation');

function createSocketServer(httpServer, { adapter = null } = {}) {
  const io = new Server(httpServer, {
    transports: ['websocket', 'polling'],
    cors: {
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Socket.IO origin not allowed'));
      },
      methods: ['GET', 'POST'],
      credentials: false
    },
    allowEIO3: false,
    maxHttpBufferSize: 10 * 1024,
    connectTimeout: 10000,
    // Detect dead sockets (tab close, hard kill) within ~14s so the match pause
    // banner appears quickly and the Live counter doesn't lag.
    pingInterval: 8000,
    pingTimeout: 6000,
    serveClient: false
  });

  // Multi-replica seam: with the Redis adapter installed, a room broadcast on
  // one pod reaches sockets connected to another pod. Absent (in-memory
  // default), Socket.IO uses its built-in single-process adapter.
  if (adapter) {
    io.adapter(adapter);
  }

  return io;
}

function registerSocketHandlers(io, { presence, roomService }) {
  io.use((socket, next) => {
    const presenceId = socket.handshake.auth?.presenceId;

    if (!isValidPresenceId(presenceId)) {
      next(new Error('Invalid presenceId'));
      return;
    }

    socket.data.presenceId = presenceId;
    next();
  });

  io.on('connection', async (socket) => {
    track('socket_connected');
    const presenceId = socket.data.presenceId;
    const isNewPresence = await presence.register(presenceId, socket.id);

    socket.emit('server_status', await presence.serverStatus(socket.id));
    socket.emit('online_count', await presence.onlineCountPayload());
    if (isNewPresence) {
      await presence.broadcastOnlineCount();
    }

    socket.on('create_room', (payload = {}) => {
      const nickname = normalizeNickname(payload.nickname);
      if (!nickname) {
        socket.emit('room_error', { message: 'Enter a nickname up to 20 characters.' });
        return;
      }

      roomService.handleCreateRoom(socket, payload, nickname);
    });

    socket.on('join_room', (payload = {}) => {
      const code = normalizeRoomCode(payload.code);
      const nickname = normalizeNickname(payload.nickname);

      if (!nickname) {
        socket.emit('room_error', { message: 'Enter a nickname up to 20 characters.' });
        return;
      }

      if (!code) {
        socket.emit('room_error', { message: 'Enter a valid 6-character room code.' });
        return;
      }

      roomService.handleJoinRoom(socket, code, nickname);
    });

    socket.on('get_room_state', (payload = {}) => {
      const code = normalizeRoomCode(payload.code);
      if (!code) {
        socket.emit('room_not_found', {
          code: payload.code || '',
          message: 'Invalid room code.'
        });
        return;
      }

      roomService.handleGetRoomState(socket, code);
    });

    socket.on('get_open_rooms', () => {
      roomService.handleGetOpenRooms(socket);
    });

    socket.on('leave_room', () => {
      roomService.leaveCurrentRoom(socket, { voluntary: true });
    });

    socket.on('player_ready', (payload = {}) => {
      roomService.handlePlayerReady(socket, payload.code);
    });

    socket.on('player_unready', (payload = {}) => {
      roomService.handlePlayerUnready(socket, payload.code);
    });

    socket.on('target_click', (payload = {}) => {
      roomService.handleTargetClick(socket, payload);
    });

    socket.on('request_rematch', (payload = {}) => {
      roomService.handleRequestRematch(socket, payload.code);
    });

    socket.on('disconnect', () => {
      track('socket_disconnected');
      presence.dropIfCurrent(presenceId, socket.id).catch((err) => {
        console.error(`Presence drop failed: ${err.message}`);
      });
      roomService.leaveCurrentRoom(socket);
    });
  });
}

module.exports = { createSocketServer, registerSocketHandlers };
