// Lightweight in-memory lifecycle counters. track() is called at each lifecycle
// transition (rooms, matches, sockets); the counts surface on /ready for quick
// curl checks. No external metrics system — this is just a Map. The extra
// exports are kept so the call sites elsewhere need no changes.

const counters = new Map();

function increment(name) {
  counters.set(name, (counters.get(name) || 0) + 1);
}

// track('match_finished', 'bomb') counts both `match_finished` and
// `match_finished.bomb`, so reasons get per-flavor counts for free.
function track(event, detail = null) {
  increment(event);
  if (detail) {
    increment(`${event}.${detail}`);
  }
}

function snapshot() {
  return Object.fromEntries([...counters.entries()].sort());
}

// Kept for call-site compatibility; there's no external metrics backend.
function setStatsProvider() {}
function renderMetrics() {
  return '';
}

module.exports = {
  track,
  snapshot,
  setStatsProvider,
  renderMetrics,
  metricsContentType: 'text/plain'
};
