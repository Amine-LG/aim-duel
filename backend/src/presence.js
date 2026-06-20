// Global presence tracking for the "Live" counter. Presence is deliberately
// independent from room membership: rooms recover players by presenceId, but
// never consult this tracker for membership or fullness decisions.
//
// Storage goes through the injected store adapter (in-memory by default,
// Redis when REDIS_URL is set). Every store call is awaited so the two
// adapters are interchangeable; with Redis the count is cluster-wide, which is
// the first step toward multi-replica — see ARCHITECTURE.md.

const config = require('./config');
const { createInMemoryPresenceStore } = require('./stores/presenceStore');

function createPresenceTracker(io, store = createInMemoryPresenceStore()) {
  let sweepTimer = null;
  let lastBroadcastCount = 0;

  async function onlineCount() {
    return store.count();
  }

  async function onlineCountPayload() {
    return { onlineCount: await store.count() };
  }

  async function broadcastOnlineCount() {
    const payload = await onlineCountPayload();
    lastBroadcastCount = payload.onlineCount;
    io.emit('online_count', payload);
  }

  async function serverStatus(socketId = null) {
    return {
      socketId,
      onlineCount: await store.count(),
      serverTime: new Date().toISOString()
    };
  }

  // Returns true when this presenceId was not previously online.
  async function register(presenceId, socketId) {
    const now = Date.now();
    const previous = await store.get(presenceId);

    await store.set(presenceId, {
      socketId,
      connectedAt: previous?.connectedAt || now,
      lastSeen: now
    });

    return !previous;
  }

  // Drops the presence only if this socket still owns it (a newer socket from
  // the same presence must not be evicted by an older one disconnecting).
  async function dropIfCurrent(presenceId, socketId) {
    const current = await store.get(presenceId);
    if (current && current.socketId === socketId) {
      await store.delete(presenceId);
      await broadcastOnlineCount();
    }
  }

  // One sweep: refresh every presence this pod still serves (which bumps the
  // record TTL / sorted-set score), then reap anything that aged out, then
  // broadcast if the live count moved. Refreshing from locally-connected
  // sockets — instead of iterating all entries — is what keeps this correct
  // across pods: a pod only vouches for the sockets it actually holds.
  function startSweeper() {
    sweepTimer = setInterval(() => {
      sweepOnce().catch((err) => {
        console.error(`Presence sweep failed: ${err.message}`);
      });
    }, config.presenceSweepIntervalMs);
    sweepTimer.unref();
  }

  async function sweepOnce() {
    const now = Date.now();

    for (const socket of io.sockets.sockets.values()) {
      const presenceId = socket.data?.presenceId;
      if (!presenceId || !socket.connected) continue;

      const current = await store.get(presenceId);
      // Only the socket that currently owns the record refreshes it, so an
      // older socket lingering on the same presence can't revive a record a
      // newer connection has already taken over.
      if (current && current.socketId === socket.id) {
        await store.set(presenceId, { ...current, lastSeen: now });
      }
    }

    await store.reap(now - config.presenceTtlMs);

    const count = await store.count();
    if (count !== lastBroadcastCount) {
      await broadcastOnlineCount();
    }
  }

  function stopSweeper() {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }

  return {
    register,
    dropIfCurrent,
    broadcastOnlineCount,
    onlineCount,
    onlineCountPayload,
    serverStatus,
    startSweeper,
    stopSweeper
  };
}

module.exports = { createPresenceTracker };
