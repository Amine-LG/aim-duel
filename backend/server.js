// Aim Duel backend — entry point. For now it's the smallest thing that runs:
// an Express server answering the two probes. It grows into Socket.IO and the
// room/match domain in later steps; we start with what a curl can verify.

const express = require('express');

// Deployment value -> env-overridable. (Gameplay rules stay code-only later.)
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

const app = express();

// Liveness: 200 whenever the process is up.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aim-duel' });
});

// Readiness: 200 when the server is ready to serve. It gains drain-awareness
// (503 during shutdown) once there's real state and a shutdown sequence to
// coordinate — for now "up" means "ready".
app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    service: 'aim-duel',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.listen(PORT, () => {
  console.log(`Aim Duel backend listening on port ${PORT}`);
});
