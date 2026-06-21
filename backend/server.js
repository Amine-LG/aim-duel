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
const {
  snapshot,
  setStatsProvider,
  renderMetrics,
  metricsContentType
} = require('./src/instrumentation');
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

// Feed the gauges their live values without instrumentation.js importing the
// domain (dependency inversion): it asks for the shape, the assembler provides
// it, recomputed fresh on every scrape.
setStatsProvider(async () => ({
  onlineCount: await presence.onlineCount(),
  roomCount: roomService.roomCount()
}));

server.listen(config.port, () => {
  console.log(`Aim Duel server listening on port ${config.port}`);
});

// Metrics live on a SEPARATE listener (config.metricsPort, default 9091), never
// on the game port. The ingress only routes the game port, so /metrics is
// reachable only from inside the cluster (Prometheus scrapes it via a
// ServiceMonitor). Exposing it on the public port would leak event-loop
// internals, room counts, and the whole event taxonomy to the internet.
const metricsServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    renderMetrics()
      .then((text) => {
        res.writeHead(200, { 'Content-Type': metricsContentType });
        res.end(text);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
    return;
  }
  res.writeHead(404);
  res.end();
});

metricsServer.listen(config.metricsPort, () => {
  console.log(`Aim Duel metrics listening on port ${config.metricsPort}`);
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
    metricsServer.close();
    io.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  }, config.shutdownDrainMs);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
