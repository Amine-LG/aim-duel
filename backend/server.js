// Aim Duel backend — entry point. Express probes + a Socket.IO realtime layer.
// For now the realtime layer authenticates the handshake and tracks a global
// "online" count; rooms, the match loop, and graceful shutdown come in later
// steps, at which point this assembly file starts delegating to src/ modules.

const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

// Deployment value -> env-overridable. (Gameplay rules stay code-only later.)
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

// --- Presence: who's currently connected (in-memory, single process) -------
// presenceId is a stable per-browser id the client sends in the handshake; a
// reconnect with the same id replaces the old socket rather than double-counts.
const online = new Map(); // presenceId -> socketId

function isValidPresenceId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

// --- HTTP app: probes ------------------------------------------------------
const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aim-duel' });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: 'aim-duel',
    uptimeSeconds: Math.floor(process.uptime()),
    onlineCount: online.size
  });
});

// --- Realtime: Socket.IO on the same HTTP server ---------------------------
const server = http.createServer(app);
const io = new Server(server, { serveClient: false });

// Reject a connection that doesn't present a plausible presenceId; otherwise
// stash it on the socket for the handlers below.
io.use((socket, next) => {
  const presenceId = socket.handshake.auth?.presenceId;
  if (!isValidPresenceId(presenceId)) {
    next(new Error('Invalid presenceId'));
    return;
  }
  socket.data.presenceId = presenceId;
  next();
});

io.on('connection', (socket) => {
  const { presenceId } = socket.data;
  online.set(presenceId, socket.id);
  console.log(`socket connected    presence=${presenceId} online=${online.size}`);

  // Tell this client where things stand, and everyone the new total.
  socket.emit('server_status', { socketId: socket.id, onlineCount: online.size });
  io.emit('online_count', { onlineCount: online.size });

  socket.on('disconnect', () => {
    // Only clear the entry if this socket still owns it (a newer socket from the
    // same presence must not be evicted by an older one disconnecting).
    if (online.get(presenceId) === socket.id) {
      online.delete(presenceId);
    }
    console.log(`socket disconnected presence=${presenceId} online=${online.size}`);
    io.emit('online_count', { onlineCount: online.size });
  });
});

server.listen(PORT, () => {
  console.log(`Aim Duel backend listening on port ${PORT}`);
});
