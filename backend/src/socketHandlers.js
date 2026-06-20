// Socket.IO wiring: authenticates the handshake, registers presence, parses and
// validates event payloads, and delegates to the room service. No game state
// lives here — it's the single choke point every client event flows through.

const { Server } = require('socket.io');
const { isValidPresenceId, normalizeNickname, normalizeRoomCode } = require('./validation');

function createSocketServer(httpServer) {
  return new Server(httpServer, { serveClient: false });
}

function registerSocketHandlers(io, { presence, roomService }) {
  // Reject a connection that doesn't present a plausible presenceId.
  io.use((socket, next) => {
    const presenceId = socket.handshake.auth?.presenceId;
    if (!isValidPresenceId(presenceId)) return next(new Error('Invalid presenceId'));
    socket.data.presenceId = presenceId;
    next();
  });

  io.on('connection', (socket) => {
    presence.add(socket.data.presenceId, socket.id);
    console.log(`connected    presence=${socket.data.presenceId} online=${presence.count()}`);
    socket.emit('server_status', { socketId: socket.id, onlineCount: presence.count() });
    io.emit('online_count', { onlineCount: presence.count() });

    socket.on('create_room', (payload = {}) => {
      const nickname = normalizeNickname(payload.nickname);
      if (!nickname) {
        return socket.emit('room_error', { message: 'Enter a nickname up to 20 characters.' });
      }
      roomService.handleCreateRoom(socket, nickname);
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
      roomService.handleJoinRoom(socket, code, nickname);
    });

    socket.on('player_ready', () => roomService.setReady(socket, true));
    socket.on('player_unready', () => roomService.setReady(socket, false));
    socket.on('target_click', (payload = {}) => roomService.handleTargetClick(socket, payload));
    socket.on('return_to_lobby', () => roomService.handleReturnToLobby(socket));
    socket.on('leave_room', () => roomService.leaveRoom(socket));

    socket.on('disconnect', () => {
      roomService.leaveRoom(socket);
      if (presence.dropIfCurrent(socket.data.presenceId, socket.id)) {
        io.emit('online_count', { onlineCount: presence.count() });
      }
      console.log(`disconnected presence=${socket.data.presenceId} online=${presence.count()}`);
    });
  });
}

module.exports = { createSocketServer, registerSocketHandlers };
