// Central tuning. Deployment values are env-overridable (Kubernetes-friendly);
// gameplay rules are code-only so a stray env var can't change how the game
// plays.

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

module.exports = {
  // Deployment (env-overridable)
  port: intFromEnv('PORT', 3000),
  maxRooms: intFromEnv('MAX_ROOMS', 200),
  // Graceful shutdown: how long /ready reports 503 before listeners close, and
  // the hard cap before the process force-exits (well under k8s' 30s grace).
  shutdownDrainMs: intFromEnv('SHUTDOWN_DRAIN_MS', 750),
  shutdownForceExitMs: intFromEnv('SHUTDOWN_FORCE_EXIT_MS', 8000),

  // Room codes (code-only). Ambiguous characters (0/O, 1/I) are left out.
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  roomCodeLength: 6,

  // Match rules (code-only)
  winScore: 10,
  countdownValues: ['3', '2', '1', 'GO'],
  countdownIntervalMs: 800, // gap between countdown ticks
  targetLifetimeMs: 2000, // a shared target nobody clicks just respawns
  nextTargetDelayMs: 600 // pause between one target resolving and the next
};
