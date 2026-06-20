// Wire-format builders — every payload a client receives is shaped here, so the
// contract is reviewable in one file and socketId/presenceId never leak.

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    players: room.players.map((p, i) => ({
      slot: i + 1,
      nickname: p.nickname,
      ready: p.ready,
      connected: p.connected,
      score: p.score || 0
    }))
  };
}

function scoresOf(room) {
  return room.players.map((p, i) => ({ slot: i + 1, nickname: p.nickname, score: p.score || 0 }));
}

module.exports = { publicRoom, scoresOf };
