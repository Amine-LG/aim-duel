// Aim Duel server entry point. Assembly only — all behaviour lives in src/:
//   config.js          tuning constants (deployment values env-overridable)
//   validation.js      pure input validators
//   serializers.js     wire-format payload builders
//   httpApp.js         Express app (security headers, probes, static SPA)
//   instrumentation.js in-memory lifecycle counters (surfaced on /ready)
//   presence.js        global online-counter tracking
//   roomService.js     room + match domain (state, timers, game rules)
//   socketHandlers.js  Socket.IO setup and event wiring
//
// In-memory only: no database, no Redis, no external services. State lives in
// this one process; a restart drops rooms and clients recover to a clean state.
//
// Pod lifecycle: on SIGTERM, /ready flips to 503 first (so a load balancer can
// stop routing), then sweepers stop, rooms tear down, Socket.IO and HTTP close,
// and a force-exit timer guarantees termination even if a socket won't close.

const http = require('node:http');
const config = require('./src/config');
const { createHttpApp } = require('./src/httpApp');
const { snapshot } = require('./src/instrumentation');
const { createPresenceTracker } = require('./src/presence');
const { createRoomService } = require('./src/roomService');
const { createSocketServer, registerSocketHandlers } = require('./src/socketHandlers');

let shuttingDown = false;

const app = createHttpApp({
  isShuttingDown: () => shuttingDown,
  getStats: async () => ({
    onlineCount: await presence.onlineCount(),
    roomCount: roomService.roomCount(),
    counters: snapshot()
  })
});
const server = http.createServer(app);
const io = createSocketServer(server);

const presence = createPresenceTracker(io);
const roomService = createRoomService(io);

registerSocketHandlers(io, { presence, roomService });
presence.startSweeper();
roomService.startSweeper();

server.listen(config.port, () => {
  console.log(`Aim Duel server listening on port ${config.port}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Aim Duel server received ${signal}, draining`);

  // Guarantee termination even if a connection refuses to close.
  setTimeout(() => {
    console.log('Aim Duel server force-exiting after graceful-shutdown timeout');
    process.exit(0);
  }, config.shutdownForceExitMs).unref();

  // Phase 1: /ready now reports 503 while listeners stay open, giving probes a
  // window to observe the drain. Phase 2: tear down state and close listeners.
  setTimeout(() => {
    presence.stopSweeper();
    roomService.stopSweeper();
    roomService.deleteAllRooms();
    io.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  }, config.shutdownDrainMs);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
