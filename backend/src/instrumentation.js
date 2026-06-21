// Metrics seam, backed by prom-client. track() keeps the same signature it had
// as a plain counter map, so the call sites (lifecycle transitions only, never
// hot per-frame paths) are unchanged. Two consumers:
//   - /ready    keeps the human-readable counter snapshot for quick curl checks
//   - /metrics  (served on a separate private port, see server.js) emits the
//               Prometheus text format: Node process defaults + lifecycle
//               counter + live gauges.
const client = require('prom-client');

// Node's own process metrics: event-loop lag, heap, GC, CPU, open handles —
// the ones that actually predict a realtime process falling over.
client.collectDefaultMetrics();

// One generic counter keeps the seam open-ended: any new track() call site
// becomes a queryable series without declaring a new metric here. The labels
// MUST stay bounded (event/detail come from a fixed code vocabulary) — never
// put a user value (room code, nickname, presenceId) in a label or cardinality
// explodes.
const eventsTotal = new client.Counter({
  name: 'aim_duel_events_total',
  help: 'Lifecycle events (rooms, matches, sockets), labelled by event and optional detail',
  labelNames: ['event', 'detail']
});

// Gauges pull from a provider installed at assembly time (server.js) so this
// module never imports presence/roomService and stays a dependency-free leaf.
// collect() may be async (presence.onlineCount() is), so each scrape reads the
// live value fresh.
let statsProvider = null;

new client.Gauge({
  name: 'aim_duel_online_players',
  help: 'Connected players (presence entries) on this pod',
  async collect() {
    if (!statsProvider) return;
    const { onlineCount } = await statsProvider();
    this.set(onlineCount);
  }
});

new client.Gauge({
  name: 'aim_duel_active_rooms',
  help: 'Live rooms on this pod',
  async collect() {
    if (!statsProvider) return;
    const { roomCount } = await statsProvider();
    this.set(roomCount);
  }
});

function setStatsProvider(fn) {
  statsProvider = fn;
}

const counters = new Map();

function increment(name) {
  counters.set(name, (counters.get(name) || 0) + 1);
}

// track('match_finished', 'bomb') counts both `match_finished` and
// `match_finished.bomb`, so reasons get per-flavor counts for free — and the
// same split lands on the Prometheus counter via the `detail` label.
function track(event, detail = null) {
  increment(event);
  if (detail) {
    increment(`${event}.${detail}`);
  }
  eventsTotal.inc({ event, detail: detail || '' });
}

function snapshot() {
  return Object.fromEntries([...counters.entries()].sort());
}

function renderMetrics() {
  return client.register.metrics();
}

module.exports = {
  track,
  snapshot,
  setStatsProvider,
  renderMetrics,
  metricsContentType: client.register.contentType
};
