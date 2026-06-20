// Presence storage adapter — the in-memory store behind the global "Live"
// counter. A deliberately small key-value surface; presence.js awaits every
// call, so it never assumes the store is synchronous.

function createInMemoryPresenceStore() {
  const entries = new Map();

  return {
    get(presenceId) {
      return entries.get(presenceId);
    },
    set(presenceId, value) {
      entries.set(presenceId, value);
    },
    delete(presenceId) {
      return entries.delete(presenceId);
    },
    entries() {
      return entries.entries();
    },
    count() {
      return entries.size;
    },
    // Mirror of the Redis store's sorted-set trim: drop entries whose last
    // refresh predates the cutoff. The sweeper uses this so a record left
    // behind by a vanished socket can't keep inflating the count.
    reap(cutoffMs) {
      let removed = 0;
      for (const [presenceId, value] of entries) {
        if (!value || value.lastSeen < cutoffMs) {
          entries.delete(presenceId);
          removed += 1;
        }
      }
      return removed;
    }
  };
}

module.exports = { createInMemoryPresenceStore };
