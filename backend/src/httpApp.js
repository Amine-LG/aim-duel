// Express app: security headers, health probes, static SPA hosting.
// Everything HTTP lives here; the realtime layer never touches this file.
//
// Probe contract (Kubernetes):
// - /health  liveness: 200 while the process is up, including during drain.
// - /ready   readiness: 200 with live gauges; 503 once shutdown starts so
//            the pod is removed from the Service before sockets close.

const express = require('express');
const path = require('node:path');

function createHttpApp({ isShuttingDown = () => false, getStats = () => ({}) } = {}) {
  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');

  app.disable('x-powered-by');

  // Baseline browser hardening. The bundle has no inline scripts; React style
  // attributes need 'unsafe-inline' for styles only. ws:/wss: covers Socket.IO.
  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; " +
        "base-uri 'self'; form-action 'self'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aim-duel' });
  });

  app.get('/ready', async (_req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down', service: 'aim-duel' });
      return;
    }

    res.json({
      status: 'ready',
      service: 'aim-duel',
      uptimeSeconds: Math.floor(process.uptime()),
      ...(await getStats())
    });
  });

  app.use(express.static(publicDir));

  app.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });

  return app;
}

module.exports = { createHttpApp };
