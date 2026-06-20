// Express app: security headers, the two probes, and — in production — the built
// SPA. In dev the SPA is served by Vite (the static dir doesn't exist), so the
// catch-all is simply absent and the dev client never hits it. In the single
// production image the frontend's dist/ is copied to ./public and served here,
// so one origin serves the page, the API, and the WebSocket.

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

function createHttpApp({ isShuttingDown = () => false, getStats = () => ({}) } = {}) {
  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');
  const indexPath = path.join(publicDir, 'index.html');
  const hasSpa = fs.existsSync(indexPath);

  app.disable('x-powered-by');

  // Baseline browser hardening. ws:/wss: covers the Socket.IO connection;
  // 'unsafe-inline' is for React's style attributes only (no inline scripts).
  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; " +
        "base-uri 'self'; form-action 'self'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    next();
  });

  // Liveness: 200 whenever the process is up, including during drain.
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aim-duel' }));

  // Readiness: 503 the moment shutdown begins, so the pod is pulled from the
  // Service before its sockets close; 200 with live stats otherwise.
  app.get('/ready', (_req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down', service: 'aim-duel' });
      return;
    }
    res.json({
      status: 'ready',
      service: 'aim-duel',
      uptimeSeconds: Math.floor(process.uptime()),
      ...getStats()
    });
  });

  if (hasSpa) {
    app.use(express.static(publicDir));
    // SPA fallback: any non-API path returns index.html so client routing works.
    app.get('*', (_req, res) => res.sendFile(indexPath));
  }

  return app;
}

module.exports = { createHttpApp };
