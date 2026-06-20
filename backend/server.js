// Aim Duel backend — entry point. Assembly + pod lifecycle only; all behaviour
// lives in src/:
//   config.js          tuning constants (deployment values env-overridable)
//   validation.js      pure input validators
//   serializers.js     wire-format payload builders
//   httpApp.js         Express: security headers, /health, /ready, static SPA
//   presence.js        global online-counter tracking
//   roomService.js     room + match domain (rooms, lobby, the match loop)
//   socketHandlers.js  Socket.IO setup and event wiring
//
// On SIGTERM, /ready flips to 503 first (Kubernetes stops routing new
// connections), then after a drain window Socket.IO and HTTP close, with a
// force-exit timer guaranteeing termination under the kubelet's grace period.

const http = require('node:http');
const config = require('./src/config');
const { createHttpApp } = require('./src/httpApp');
const { createPresence } = require('./src/presence');
const { createRoomService } = require('./src/roomService');
const { createSocketServer, registerSocketHandlers } = require('./src/socketHandlers');

let shuttingDown = false;

const presence = createPresence();

const app = createHttpApp({
  isShuttingDown: () => shuttingDown,
  getStats: () => ({ onlineCount: presence.count(), roomCount: roomService.roomCount() })
});
const server = http.createServer(app);
const io = createSocketServer(server);
const roomService = createRoomService(io);

registerSocketHandlers(io, { presence, roomService });

server.listen(config.port, () => {
  console.log(`Aim Duel backend listening on port ${config.port}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Aim Duel backend received ${signal}, draining`);

  // Guarantee termination even if a connection refuses to close.
  setTimeout(() => {
    console.log('Aim Duel backend force-exiting after graceful-shutdown timeout');
    process.exit(0);
  }, config.shutdownForceExitMs).unref();

  // /ready now reports 503; give probes and the load balancer a window to
  // observe the drain before listeners close.
  setTimeout(() => {
    io.close(() => {
      server.close(() => process.exit(0));
    });
  }, config.shutdownDrainMs);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
