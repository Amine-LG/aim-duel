// Central tuning knobs for the Aim Duel server. Deployment-relevant values
// can be overridden via environment variables (Kubernetes-friendly); pure
// gameplay tuning stays code-only so a stray env var can't change game rules.

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Local dev origins only. The public origin is never hardcoded — set it for a
// deployment via the ALLOWED_ORIGINS env var (comma-separated).
const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081'
];

// ALLOWED_ORIGINS extends (never replaces) the defaults: comma-separated list.
const extraAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const port = intFromEnv('PORT', 3000);

module.exports = {
  // Deployment (env-overridable)
  port,
  // Origin used to build invite links server-side. Defaults to localhost for
  // dev; set PUBLIC_ORIGIN to the real site origin in a deployment. (The client
  // also falls back to its own window.location.origin, so this is a backstop.)
  publicOrigin: process.env.PUBLIC_ORIGIN || `http://localhost:${port}`,
  allowedOrigins: new Set([...defaultAllowedOrigins, ...extraAllowedOrigins]),
  maxRooms: intFromEnv('MAX_ROOMS', 200),
  // Drain window after SIGTERM: /ready reports 503 while listeners stay open
  // so the load balancer/probes can observe the drain before sockets close.
  shutdownDrainMs: intFromEnv('SHUTDOWN_DRAIN_MS', 750),
  // How long graceful shutdown may take before the process force-exits.
  shutdownForceExitMs: intFromEnv('SHUTDOWN_FORCE_EXIT_MS', 8000),

  // Presence (global online counter)
  presenceTtlMs: 30 * 1000,
  presenceSweepIntervalMs: 10 * 1000,

  // Room lifecycle
  roomTtlMs: 30 * 60 * 1000,
  disconnectedPlayerTtlMs: 10 * 60 * 1000,
  roomSweepIntervalMs: 60 * 1000,
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  roomCreateCooldownMs: 2000,
  openRoomsListLimit: 20,

  // Match rules
  countdownValues: ['3', '2', '1', 'GO'],
  winScore: 10,
  claimWindowMs: 120,
  cyanLifetimeMs: 1500,
  bombLifetimeMs: 1000,
  bombAfterCyanCount: 3,
  bombChance: 0.23,
  targetSizeRatio: 0.113,
  nextTargetDelayMinMs: 400,
  nextTargetDelayMaxMs: 800,
  minReactionMs: 60,
  maxConsecutiveMisses: 20,

  // Recovery windows
  rematchWindowMs: 10000,
  disconnectGraceMs: 20000
};
