const test = require('node:test');
const assert = require('node:assert/strict');
const { createInMemoryRoomStore } = require('../src/stores/roomStore');
const { createInMemoryPresenceStore } = require('../src/stores/presenceStore');

test('room store CRUD and identity', () => {
  const store = createInMemoryRoomStore();
  const room = { code: 'ABC234' };

  assert.equal(store.count(), 0);
  store.set(room.code, room);
  assert.equal(store.has('ABC234'), true);
  // The game loop relies on object identity from get().
  assert.equal(store.get('ABC234'), room);
  assert.deepEqual(store.codes(), ['ABC234']);
  assert.deepEqual([...store.values()], [room]);
  store.delete('ABC234');
  assert.equal(store.count(), 0);
});

test('presence store CRUD', () => {
  const store = createInMemoryPresenceStore();

  store.set('presence-1', { socketId: 's1' });
  store.set('presence-2', { socketId: 's2' });
  assert.equal(store.count(), 2);
  assert.equal(store.get('presence-1').socketId, 's1');
  assert.deepEqual(
    [...store.entries()].map(([id]) => id),
    ['presence-1', 'presence-2']
  );
  store.delete('presence-1');
  assert.equal(store.count(), 1);
});
