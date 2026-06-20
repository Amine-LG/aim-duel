// Global online presence — the live count. presenceId -> socketId; a reconnect
// with the same id replaces the old socket rather than double-counting. This is
// the first state that would move to Redis for a multi-replica deployment.

function createPresence() {
  const online = new Map();

  return {
    add(presenceId, socketId) {
      online.set(presenceId, socketId);
    },
    // Drop only if this socket still owns the entry (a newer socket from the
    // same presence must not be evicted by an older one disconnecting).
    dropIfCurrent(presenceId, socketId) {
      if (online.get(presenceId) === socketId) {
        online.delete(presenceId);
        return true;
      }
      return false;
    },
    count() {
      return online.size;
    }
  };
}

module.exports = { createPresence };
