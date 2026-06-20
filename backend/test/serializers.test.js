const test = require('node:test');
const assert = require('node:assert/strict');
const {
  averagePlayerDeltaMs,
  publicPlayer,
  publicRoom,
  scorePayload
} = require('../src/serializers');

function makePlayer(overrides = {}) {
  return {
    socketId: 'sock-1',
    presenceId: 'presence-1',
    nickname: 'Alice',
    ready: false,
    rematchRequested: false,
    score: 0,
    speedDeltaTotalMs: 0,
    speedDeltaCount: 0,
    connected: true,
    joinedAt: 1000,
    disconnectedAt: null,
    ...overrides
  };
}

function makeRoom(overrides = {}) {
  return {
    code: 'ABC234',
    status: 'waiting',
    createdAt: 1000,
    players: [makePlayer()],
    countdownTimers: [],
    startState: null,
    rematch: null,
    game: null,
    disconnectGrace: null,
    ...overrides
  };
}

test('averagePlayerDeltaMs rounds away from zero and needs samples', () => {
  assert.equal(averagePlayerDeltaMs(makePlayer()), null);
  assert.equal(averagePlayerDeltaMs(makePlayer({ speedDeltaTotalMs: 10, speedDeltaCount: 4 })), 3);
  // Small positive averages never round down to 0.
  assert.equal(averagePlayerDeltaMs(makePlayer({ speedDeltaTotalMs: 1, speedDeltaCount: 4 })), 1);
  assert.equal(averagePlayerDeltaMs(makePlayer({ speedDeltaTotalMs: -1, speedDeltaCount: 4 })), -1);
});

test('publicPlayer never leaks socket or presence identifiers', () => {
  const payload = publicPlayer(makePlayer(), 0);
  assert.equal(payload.slot, 1);
  assert.equal(payload.nickname, 'Alice');
  assert.equal('socketId' in payload, false);
  assert.equal('presenceId' in payload, false);
});

test('publicRoom serializes an idle lobby without game/rematch/grace', () => {
  const payload = publicRoom(makeRoom());
  assert.equal(payload.code, 'ABC234');
  assert.equal(payload.status, 'waiting');
  assert.equal(payload.game, null);
  assert.equal(payload.rematch, null);
  assert.equal(payload.disconnectGrace, null);
  assert.equal(payload.players.length, 1);
});

test('scorePayload reports slots, scores, and connectivity', () => {
  const room = makeRoom({
    players: [makePlayer({ score: 3 }), makePlayer({ nickname: 'Bob', connected: false })]
  });
  const scores = scorePayload(room);
  assert.deepEqual(
    scores.map((s) => [s.slot, s.nickname, s.score, s.connected]),
    [
      [1, 'Alice', 3, true],
      [2, 'Bob', 0, false]
    ]
  );
});
