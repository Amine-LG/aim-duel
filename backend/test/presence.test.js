const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresenceTracker } = require('../src/presence');

// Minimal Socket.IO stand-in: presence only needs io.emit and the live socket
// map. Each fake socket carries the presenceId the handshake would have set.
function fakeIo() {
  const sockets = new Map();
  return {
    emitted: [],
    sockets: { sockets },
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    addSocket(id, presenceId) {
      const socket = { id, connected: true, data: { presenceId } };
      sockets.set(id, socket);
      return socket;
    }
  };
}

test('online count tracks distinct presences, not sockets', async () => {
  const io = fakeIo();
  const presence = createPresenceTracker(io);

  assert.equal(await presence.onlineCount(), 0);
  assert.equal(await presence.register('alice', 's1'), true);
  // Same presence, newer socket: not a new presence, count stays 1.
  assert.equal(await presence.register('alice', 's2'), false);
  assert.equal(await presence.register('bob', 's3'), true);
  assert.equal(await presence.onlineCount(), 2);
});

test('dropIfCurrent only evicts the owning socket', async () => {
  const io = fakeIo();
  const presence = createPresenceTracker(io);

  await presence.register('alice', 's1');
  await presence.register('alice', 's2'); // s2 now owns alice

  // An older socket disconnecting must not evict the presence it no longer owns.
  await presence.dropIfCurrent('alice', 's1');
  assert.equal(await presence.onlineCount(), 1);

  // The current owner disconnecting does evict it.
  await presence.dropIfCurrent('alice', 's2');
  assert.equal(await presence.onlineCount(), 0);
});

test('onlineCountPayload reports the live count and broadcasts it', async () => {
  const io = fakeIo();
  const presence = createPresenceTracker(io);

  await presence.register('alice', 's1');
  assert.deepEqual(await presence.onlineCountPayload(), { onlineCount: 1 });

  await presence.broadcastOnlineCount();
  const last = io.emitted.at(-1);
  assert.equal(last.event, 'online_count');
  assert.deepEqual(last.payload, { onlineCount: 1 });
});
