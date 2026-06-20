// Wire-format builders: convert internal room/player/target objects (which
// hold sockets ids, timers, and counters) into the public payloads clients
// receive. Keeping every emitted shape here means the client contract is
// reviewable in one file.

const config = require('./config');

function averagePlayerDeltaMs(player) {
  const count = player.speedDeltaCount || 0;
  if (!count) return null;
  const average = (player.speedDeltaTotalMs || 0) / count;
  if (average > 0) return Math.max(1, Math.round(average));
  if (average < 0) return Math.min(-1, Math.round(average));
  return 0;
}

function publicPlayer(player, index) {
  return {
    slot: index + 1,
    nickname: player.nickname,
    ready: player.ready,
    rematchRequested: Boolean(player.rematchRequested),
    score: player.score || 0,
    averageDeltaMs: averagePlayerDeltaMs(player),
    deltaSamples: player.speedDeltaCount || 0,
    connected: player.connected,
    joinedAt: player.joinedAt,
    disconnectedAt: player.disconnectedAt || null
  };
}

function scorePayload(room) {
  return room.players.map((player, index) => ({
    slot: index + 1,
    nickname: player.nickname,
    score: player.score || 0,
    averageDeltaMs: averagePlayerDeltaMs(player),
    deltaSamples: player.speedDeltaCount || 0,
    connected: player.connected
  }));
}

function publicTarget(target) {
  return {
    targetId: target.targetId,
    matchId: target.matchId,
    type: target.type,
    x: target.x,
    y: target.y,
    size: target.size,
    lifetimeMs: target.lifetimeMs
  };
}

function publicClaim(claim) {
  return {
    slot: claim.slot,
    nickname: claim.player.nickname,
    reactionMs: claim.reactionMs
  };
}

function publicGame(room) {
  if (!room.game) return null;

  const activeTarget =
    room.status === 'playing' && room.game.target && !room.game.target.resolved
      ? {
          ...publicTarget(room.game.target),
          remainingMs: Math.max(
            0,
            room.game.target.spawnedAt + room.game.target.lifetimeMs - Date.now()
          )
        }
      : null;

  return {
    matchId: room.game.matchId || null,
    winScore: config.winScore,
    scores: scorePayload(room),
    target: activeTarget,
    winnerSlot: room.game.winnerSlot || null,
    winnerName: room.game.winnerName || null,
    loserSlot: room.game.loserSlot || null,
    loserName: room.game.loserName || null,
    reason: room.game.reason || null,
    isDraw: Boolean(room.game.isDraw),
    startedAt: room.game.startedAt || null,
    finishedAt: room.game.finishedAt || null
  };
}

function publicRematch(room) {
  if (!room.rematch) return null;

  return {
    requestedBySlot: room.rematch.requestedBySlot,
    requestedByName: room.rematch.requestedByName,
    expiresAt: room.rematch.expiresAt,
    remainingMs: Math.max(0, room.rematch.expiresAt - Date.now())
  };
}

function publicDisconnectGrace(room) {
  if (!room.disconnectGrace) return null;
  const slot = room.disconnectGrace.slot;
  const player = room.players[slot - 1] || null;
  return {
    slot,
    nickname: player?.nickname || null,
    remainingMs: Math.max(0, room.disconnectGrace.expiresAt - Date.now()),
    expiresAt: room.disconnectGrace.expiresAt
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    createdAt: room.createdAt,
    players: room.players.map(publicPlayer),
    game: publicGame(room),
    rematch: publicRematch(room),
    disconnectGrace: publicDisconnectGrace(room)
  };
}

module.exports = {
  averagePlayerDeltaMs,
  publicPlayer,
  scorePayload,
  publicTarget,
  publicClaim,
  publicGame,
  publicRematch,
  publicDisconnectGrace,
  publicRoom
};
