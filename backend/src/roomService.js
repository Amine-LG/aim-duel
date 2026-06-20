// Room + match domain: create/join/leave/ready and the match loop (server-owned
// countdown → shared targets → first to winScore). All room state lives in the
// `rooms` map here; the socket layer only parses events and calls these methods.
// Receives `io` so it can broadcast to room channels.

const crypto = require('node:crypto');
const config = require('./config');
const { publicRoom, scoresOf } = require('./serializers');

function createRoomService(io) {
  const rooms = new Map(); // code -> room

  // --- small helpers --------------------------------------------------------
  function channel(code) {
    return `room:${code}`;
  }

  function makeId() {
    return crypto.randomUUID();
  }

  function makeRoomCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      for (let i = 0; i < config.roomCodeLength; i += 1) {
        code += config.roomCodeAlphabet[Math.floor(Math.random() * config.roomCodeAlphabet.length)];
      }
      if (!rooms.has(code)) return code;
    }
    throw new Error('Unable to allocate a room code');
  }

  function freshPlayer(socket, nickname) {
    return {
      socketId: socket.id,
      presenceId: socket.data.presenceId,
      nickname,
      ready: false,
      connected: true,
      score: 0
    };
  }

  function connectedPlayers(room) {
    return room.players.filter((p) => p.connected);
  }

  // Only recomputes the lobby status; an active match owns its status.
  function refreshStatus(room) {
    if (['countdown', 'playing', 'finished'].includes(room.status)) return;
    const live = connectedPlayers(room);
    room.status = live.length === 2 && live.every((p) => p.ready) ? 'ready' : 'waiting';
  }

  function broadcastRoom(room) {
    io.to(channel(room.code)).emit('room_state', { room: publicRoom(room), status: room.status });
  }

  // --- match loop -----------------------------------------------------------
  // Every timer a room can own is cleared here, so aborting a match (leave,
  // disconnect, finish) can never leak a pending spawn or countdown tick.
  function clearMatchTimers(room) {
    (room.countdownTimers || []).forEach(clearTimeout);
    room.countdownTimers = [];
    if (room.game) {
      clearTimeout(room.game.targetTimer);
      clearTimeout(room.game.nextTimer);
    }
  }

  function startCountdown(room) {
    room.status = 'countdown';
    room.countdownTimers = [];
    config.countdownValues.forEach((value, i) => {
      room.countdownTimers.push(
        setTimeout(() => {
          io.to(channel(room.code)).emit('countdown_tick', { value });
        }, i * config.countdownIntervalMs)
      );
    });
    room.countdownTimers.push(
      setTimeout(() => startMatch(room), config.countdownValues.length * config.countdownIntervalMs)
    );
    broadcastRoom(room);
  }

  function startMatch(room) {
    if (connectedPlayers(room).length !== 2) {
      // Someone left during the countdown — fall back to the lobby.
      room.status = 'waiting';
      room.players.forEach((p) => {
        p.ready = false;
      });
      broadcastRoom(room);
      return;
    }
    room.status = 'playing';
    room.players.forEach((p) => {
      p.score = 0;
      p.ready = false;
    });
    room.game = { matchId: makeId(), target: null, targetTimer: null, nextTimer: null };
    io.to(channel(room.code)).emit('game_started', {
      matchId: room.game.matchId,
      winScore: config.winScore,
      scores: scoresOf(room)
    });
    broadcastRoom(room);
    spawnTarget(room);
  }

  function spawnTarget(room) {
    if (!room.game || room.status !== 'playing') return;
    const target = {
      id: makeId(),
      matchId: room.game.matchId,
      // Ratios in the same safe band the solo arena uses; clients multiply by
      // the arena size so both see the target at the same spot.
      x: Number((0.1 + Math.random() * 0.8).toFixed(4)),
      y: Number((0.14 + Math.random() * 0.66).toFixed(4)),
      resolved: false
    };
    room.game.target = target;
    io.to(channel(room.code)).emit('target_spawn', {
      target: { id: target.id, matchId: target.matchId, x: target.x, y: target.y },
      scores: scoresOf(room)
    });
    room.game.targetTimer = setTimeout(() => {
      if (room.game?.target === target && !target.resolved) {
        target.resolved = true;
        io.to(channel(room.code)).emit('target_missed', { targetId: target.id, scores: scoresOf(room) });
        scheduleNext(room);
      }
    }, config.targetLifetimeMs);
  }

  function scheduleNext(room) {
    if (!room.game || room.status !== 'playing') return;
    room.game.nextTimer = setTimeout(() => spawnTarget(room), config.nextTargetDelayMs);
  }

  function finishGame(room, winnerSlot) {
    clearMatchTimers(room);
    room.status = 'finished';
    const scores = scoresOf(room);
    room.game = null;
    io.to(channel(room.code)).emit('game_over', { winnerSlot, scores });
    broadcastRoom(room);
  }

  function returnToLobby(room) {
    clearMatchTimers(room);
    room.game = null;
    room.players.forEach((p) => {
      p.ready = false;
      p.score = 0;
    });
    room.status = 'waiting';
    broadcastRoom(room);
  }

  // --- event entry points (called by socketHandlers with validated input) ---
  function emitError(socket, message) {
    socket.emit('room_error', { message });
  }

  function handleCreateRoom(socket, nickname) {
    if (rooms.size >= config.maxRooms) {
      return emitError(socket, 'The server is busy. Try again shortly.');
    }
    leaveRoom(socket); // a player is only ever in one room
    const code = makeRoomCode();
    const room = { code, status: 'waiting', players: [freshPlayer(socket, nickname)] };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(channel(code));
    socket.emit('room_created', { code, room: publicRoom(room), selfSlot: 1 });
    broadcastRoom(room);
    console.log(`room created ${code} by "${nickname}"`);
  }

  function handleJoinRoom(socket, code, nickname) {
    const room = rooms.get(code);
    if (!room) return emitError(socket, 'Room not found.');

    // Same browser rejoining (a refresh) resumes its slot; a new browser fills
    // the open slot.
    const mine = room.players.find((p) => p.presenceId === socket.data.presenceId);
    if (mine) {
      mine.socketId = socket.id;
      mine.connected = true;
      mine.nickname = nickname;
    } else {
      if (connectedPlayers(room).length >= 2) return emitError(socket, 'Room is full.');
      leaveRoom(socket);
      room.players.push(freshPlayer(socket, nickname));
    }

    socket.data.roomCode = code;
    socket.join(channel(code));
    const slot = room.players.findIndex((p) => p.socketId === socket.id) + 1;
    refreshStatus(room);
    socket.emit('room_joined', { room: publicRoom(room), selfSlot: slot });
    broadcastRoom(room);
    console.log(`room joined  ${code} by "${nickname}"`);
  }

  function setReady(socket, ready) {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (room.status === 'countdown' || room.status === 'playing') return; // locked mid-match
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.ready = ready;
    refreshStatus(room);
    broadcastRoom(room);
    if (room.status === 'ready') startCountdown(room);
  }

  function handleTargetClick(socket, payload) {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || !room.game) return;
    const target = room.game.target;
    if (!target || target.resolved) return;
    // Reject clicks for a stale target/match (race against the next spawn).
    if (payload?.targetId !== target.id || payload?.matchId !== room.game.matchId) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    // First valid click the server receives resolves the target and scores.
    target.resolved = true;
    clearTimeout(room.game.targetTimer);
    player.score = (player.score || 0) + 1;
    const slot = room.players.indexOf(player) + 1;
    io.to(channel(room.code)).emit('target_claimed', {
      targetId: target.id,
      winnerSlot: slot,
      scores: scoresOf(room)
    });

    if (player.score >= config.winScore) {
      finishGame(room, slot);
    } else {
      scheduleNext(room);
    }
  }

  function handleReturnToLobby(socket) {
    const room = rooms.get(socket.data.roomCode);
    if (room && room.status === 'finished') returnToLobby(room);
  }

  function leaveRoom(socket) {
    const code = socket.data.roomCode;
    if (!code) return;
    delete socket.data.roomCode;
    socket.leave(channel(code));

    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.ready = false;
    }

    if (connectedPlayers(room).length === 0) {
      clearMatchTimers(room);
      rooms.delete(code); // nobody left — drop it so it can't linger
      return;
    }

    // If a countdown or match was in flight, abort it back to the lobby.
    if (['countdown', 'playing', 'finished'].includes(room.status)) {
      clearMatchTimers(room);
      room.game = null;
      room.players.forEach((p) => {
        p.ready = false;
      });
      room.status = 'waiting';
    }

    refreshStatus(room);
    broadcastRoom(room);
  }

  function roomCount() {
    return rooms.size;
  }

  return {
    handleCreateRoom,
    handleJoinRoom,
    setReady,
    handleTargetClick,
    handleReturnToLobby,
    leaveRoom,
    roomCount
  };
}

module.exports = { createRoomService };
