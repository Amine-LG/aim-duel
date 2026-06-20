// Room + match domain: lobby membership, ready/countdown, target spawning,
// claim resolution, scoring, rematch, disconnect grace, and sweeping.
//
// Boundaries:
// - The socket layer (socketHandlers.js) only parses events and calls the
//   handle* methods here; it owns no game state.
// - All room state reads/writes go through the injected roomStore adapter.
// - All payload shapes come from serializers.js.
// - All tuning constants come from config.js.
// - Lifecycle transitions emit instrumentation counters via track().
//
// Multi-replica note: room objects hold live timers and rely on object
// identity, so rooms are pod-local by design — see ARCHITECTURE.md for the
// scaling plan (Socket.IO Redis adapter + sticky room ownership).

const crypto = require('node:crypto');
const config = require('./config');
const { track } = require('./instrumentation');
const { createInMemoryRoomStore } = require('./stores/roomStore');
const { normalizeRoomCode } = require('./validation');
const {
  publicPlayer,
  scorePayload,
  publicTarget,
  publicClaim,
  publicRoom
} = require('./serializers');

function createRoomService(io, { roomStore = createInMemoryRoomStore() } = {}) {
  let sweepTimer = null;

  // --- Small shared helpers -------------------------------------------------

  function roomChannel(code) {
    return `room:${code}`;
  }

  function connectedPlayers(room) {
    return room.players.filter((player) => player.connected);
  }

  function playerIndexByPresence(room, presenceId) {
    return room.players.findIndex((player) => player.presenceId === presenceId);
  }

  function emitRoomError(socket, message) {
    socket.emit('room_error', { message });
  }

  function emitRoomState(socket, room, selfSlot = null) {
    socket.emit('room_state', {
      room: publicRoom(room),
      status: room.status,
      selfSlot
    });
  }

  function emitRoomNotFound(socket, codeValue, message = 'Room not found or expired.') {
    socket.emit('room_not_found', {
      code: normalizeRoomCode(codeValue) || codeValue || '',
      message
    });
  }

  function broadcastRoomState(room) {
    // Single event per broadcast; the client treats room_state and room_updated
    // identically, so emitting both would just double traffic and React updates.
    io.to(roomChannel(room.code)).emit('room_state', {
      room: publicRoom(room),
      status: room.status
    });
  }

  function refreshRoomStatus(room) {
    const connected = connectedPlayers(room);
    room.status = connected.some((player) => player.ready) ? 'ready' : 'waiting';
  }

  function shareUrlForSocket(socket, code) {
    const origin = config.allowedOrigins.has(socket.handshake.headers.origin)
      ? socket.handshake.headers.origin
      : config.publicOrigin;
    return `${origin}/join/${code}`;
  }

  function createRoomCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        code += config.roomCodeAlphabet[
          Math.floor(Math.random() * config.roomCodeAlphabet.length)
        ];
      }

      if (!roomStore.has(code)) {
        return code;
      }
    }

    throw new Error('Unable to allocate room code');
  }

  function validateRoomMembership(socket, codeValue) {
    const code = normalizeRoomCode(codeValue);

    if (!code || code !== socket.data.roomCode) {
      return { error: 'Invalid room.' };
    }

    const room = roomStore.get(code);
    if (!room) {
      return { error: 'Room not found.' };
    }

    const player = room.players.find((roomPlayer) => roomPlayer.socketId === socket.id);
    if (!player || !player.connected) {
      return { error: 'You are not in this room.' };
    }

    return { code, room, player };
  }

  // --- Timer teardown -------------------------------------------------------
  // Every timer a room can own is cleared in deleteRoom; new timer kinds must
  // be added both where they start and here.

  function clearRoomCountdown(room) {
    room.countdownTimers.forEach((timer) => clearTimeout(timer));
    room.countdownTimers = [];
    room.startState = null;
  }

  function clearGameTimers(room) {
    const game = room.game;
    if (!game) return;

    clearTimeout(game.nextTargetTimer);
    game.nextTargetTimer = null;

    if (game.target) {
      clearTimeout(game.target.claimTimer);
      clearTimeout(game.target.missTimer);
      game.target.claimTimer = null;
      game.target.missTimer = null;
    }
  }

  function clearRematchTimer(room) {
    if (!room.rematch) return;

    clearTimeout(room.rematch.timer);
    room.rematch = null;
  }

  function clearDisconnectGrace(room) {
    if (!room.disconnectGrace) return;
    clearTimeout(room.disconnectGrace.timer);
    room.disconnectGrace = null;
  }

  function clearCurrentTarget(target) {
    if (!target) return;
    clearTimeout(target.claimTimer);
    clearTimeout(target.missTimer);
    target.claimTimer = null;
    target.missTimer = null;
  }

  function deleteRoom(code) {
    const room = roomStore.get(code);
    if (room) {
      clearRoomCountdown(room);
      clearGameTimers(room);
      clearRematchTimer(room);
      clearDisconnectGrace(room);
      track('room_deleted');
    }

    roomStore.delete(code);
  }

  // --- Match lifecycle ------------------------------------------------------

  function isCurrentTarget(room, target) {
    return (
      room.game &&
      room.status === 'playing' &&
      room.game.target === target &&
      room.game.matchId === target.matchId &&
      !target.resolved
    );
  }

  function createTarget(room) {
    const game = room.game;
    const isBomb =
      game.cyanResolvedCount >= config.bombAfterCyanCount && Math.random() < config.bombChance;

    return {
      targetId: crypto.randomUUID(),
      matchId: game.matchId,
      type: isBomb ? 'bomb' : 'cyan',
      // Keep the spawn band clear of the bottom feedback pill and corner widgets;
      // clients additionally clamp into their own safe arena bounds.
      x: Number((0.12 + Math.random() * 0.76).toFixed(4)),
      y: Number((0.14 + Math.random() * 0.62).toFixed(4)),
      size: config.targetSizeRatio,
      lifetimeMs: isBomb ? config.bombLifetimeMs : config.cyanLifetimeMs,
      spawnedAt: Date.now(),
      claims: new Map(),
      claimTimer: null,
      missTimer: null,
      resolved: false
    };
  }

  function scheduleNextTarget(room, delayMs = null) {
    if (!room.game || room.status !== 'playing') return;
    const matchId = room.game.matchId;

    const delay =
      delayMs ??
      Math.floor(
        config.nextTargetDelayMinMs +
          Math.random() * (config.nextTargetDelayMaxMs - config.nextTargetDelayMinMs)
      );

    clearTimeout(room.game.nextTargetTimer);
    room.game.nextTargetTimer = setTimeout(() => {
      if (room.game?.matchId !== matchId || room.status !== 'playing') return;
      spawnTarget(room, matchId);
    }, delay);
  }

  function spawnTarget(room, matchId = room.game?.matchId) {
    if (!room.game || room.status !== 'playing' || room.game.matchId !== matchId) return;

    const connected = connectedPlayers(room);
    if (connected.length !== 2) {
      const winner = connected[0];
      if (winner) {
        const loser = room.players.find((player) => !player.connected) || null;
        finishGame(room, winner, 'disconnect', loser);
      }
      return;
    }

    const target = createTarget(room);
    room.game.target = target;

    io.to(roomChannel(room.code)).emit('target_spawn', {
      ...publicTarget(target),
      scores: scorePayload(room),
      serverTime: new Date().toISOString()
    });

    target.missTimer = setTimeout(() => missTarget(room, target), target.lifetimeMs);
  }

  function resolveCyanClaims(room, target) {
    if (!isCurrentTarget(room, target)) {
      return;
    }

    target.resolved = true;
    clearCurrentTarget(target);

    const claims = [...target.claims.values()];
    if (!claims.length) {
      room.game.target = null;
      scheduleNextTarget(room);
      return;
    }

    // Fairness foundation: the browser measures reactionMs from local target render
    // to click/tap. The server collects validated claims during a short window and
    // compares those reactionMs values instead of awarding by raw packet arrival.
    claims.sort((a, b) => a.reactionMs - b.reactionMs);
    if (claims.length > 1 && claims[0].reactionMs === claims[1].reactionMs) {
      room.game.cyanResolvedCount += 1;
      room.game.consecutiveMissCount = 0;
      room.game.target = null;
      io.to(roomChannel(room.code)).emit('target_tied', {
        targetId: target.targetId,
        matchId: target.matchId,
        target: publicTarget(target),
        reactionMs: claims[0].reactionMs,
        claims: claims.map(publicClaim),
        scores: scorePayload(room),
        room: publicRoom(room)
      });
      scheduleNextTarget(room);
      return;
    }

    const claim = claims[0];
    const nextClaim = claims[1] || null;
    const deltaMs = nextClaim ? nextClaim.reactionMs - claim.reactionMs : null;
    claim.player.score = (claim.player.score || 0) + 1;
    room.game.consecutiveMissCount = 0;
    if (Number.isFinite(deltaMs) && deltaMs > 0) {
      claim.player.speedDeltaTotalMs = (claim.player.speedDeltaTotalMs || 0) + deltaMs;
      claim.player.speedDeltaCount = (claim.player.speedDeltaCount || 0) + 1;
      nextClaim.player.speedDeltaTotalMs = (nextClaim.player.speedDeltaTotalMs || 0) - deltaMs;
      nextClaim.player.speedDeltaCount = (nextClaim.player.speedDeltaCount || 0) + 1;
    }
    room.game.cyanResolvedCount += 1;

    // target_claimed carries the full room payload; no separate room_updated needed.
    const roomPayload = publicRoom(room);
    io.to(roomChannel(room.code)).emit('target_claimed', {
      targetId: target.targetId,
      matchId: target.matchId,
      target: publicTarget(target),
      winnerSlot: claim.slot,
      winnerName: claim.player.nickname,
      winnerPlayerId: claim.slot,
      winnerReactionMs: claim.reactionMs,
      winnerClaim: publicClaim(claim),
      reactionMs: claim.reactionMs,
      loserSlot: nextClaim?.slot || null,
      loserName: nextClaim?.player.nickname || null,
      loserReactionMs: nextClaim?.reactionMs || null,
      loserClaim: nextClaim ? publicClaim(nextClaim) : null,
      deltaMs,
      claims: claims.map(publicClaim),
      scores: scorePayload(room),
      room: roomPayload
    });

    room.game.target = null;

    if (claim.player.score >= config.winScore) {
      finishGame(room, claim.player, 'reached_10');
      return;
    }

    scheduleNextTarget(room);
  }

  function missTarget(room, target) {
    if (!isCurrentTarget(room, target)) {
      return;
    }

    target.resolved = true;
    clearCurrentTarget(target);
    room.game.target = null;
    room.game.consecutiveMissCount = (room.game.consecutiveMissCount || 0) + 1;
    if (target.type === 'cyan') {
      room.game.cyanResolvedCount += 1;
      io.to(roomChannel(room.code)).emit('target_missed', {
        targetId: target.targetId,
        matchId: target.matchId,
        target: publicTarget(target),
        scores: scorePayload(room),
        room: publicRoom(room)
      });
    } else {
      io.to(roomChannel(room.code)).emit('target_avoided', {
        targetId: target.targetId,
        matchId: target.matchId,
        target: publicTarget(target),
        scores: scorePayload(room),
        room: publicRoom(room)
      });
    }

    if (room.game.consecutiveMissCount >= config.maxConsecutiveMisses) {
      finishGame(room, null, 'inactivity');
      return;
    }

    scheduleNextTarget(room);
  }

  function finishGame(room, winner, reason, loser = null) {
    if (!room.game || room.status === 'finished') return;

    clearGameTimers(room);
    clearRematchTimer(room);
    clearDisconnectGrace(room);
    const scores = scorePayload(room);
    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    const isDraw =
      !winner ||
      reason === 'draw' ||
      (reason === 'reached_10' &&
        sortedScores.length > 1 &&
        sortedScores[0].score === sortedScores[1].score);

    room.status = 'finished';
    room.game.target = null;
    room.game.winnerSlot = isDraw ? null : room.players.indexOf(winner) + 1;
    room.game.winnerName = isDraw ? null : winner.nickname;
    room.game.loserSlot = loser ? room.players.indexOf(loser) + 1 : null;
    room.game.loserName = loser?.nickname || null;
    // Preserve specific reasons like 'inactivity' even when the result is a draw
    // so the client can show "Match ended — no activity" instead of just "Draw".
    room.game.reason = isDraw && reason !== 'inactivity' ? 'draw' : reason;
    room.game.isDraw = isDraw;
    room.game.finishedAt = Date.now();

    track('match_finished', room.game.reason);
    const roomPayload = publicRoom(room);
    broadcastRoomState(room);
    io.to(roomChannel(room.code)).emit('game_over', {
      room: roomPayload,
      matchId: room.game.matchId,
      winnerSlot: room.game.winnerSlot,
      winnerName: room.game.winnerName,
      loserSlot: room.game.loserSlot,
      loserName: room.game.loserName,
      reason: room.game.reason,
      isDraw,
      scores
    });
  }

  function startMatch(room) {
    const connected = connectedPlayers(room);
    if (connected.length !== 2) {
      refreshRoomStatus(room);
      broadcastRoomState(room);
      return;
    }

    clearGameTimers(room);
    const matchId = crypto.randomUUID();
    room.status = 'playing';
    room.players.forEach((player) => {
      player.ready = false;
      player.rematchRequested = false;
      player.score = 0;
      player.speedDeltaTotalMs = 0;
      player.speedDeltaCount = 0;
    });
    room.game = {
      matchId,
      target: null,
      nextTargetTimer: null,
      cyanResolvedCount: 0,
      consecutiveMissCount: 0,
      winnerSlot: null,
      reason: null,
      startedAt: Date.now()
    };

    track('match_started');
    broadcastRoomState(room);
    const roomPayload = publicRoom(room);
    io.to(roomChannel(room.code)).emit('game_started', {
      room: roomPayload,
      winScore: config.winScore,
      serverTime: new Date().toISOString()
    });
    scheduleNextTarget(room, 500);
  }

  function startCountdownIfReady(room) {
    if (room.countdownTimers.length || room.status === 'countdown') {
      return;
    }

    const connected = connectedPlayers(room);
    if (connected.length !== 2 || !connected.every((player) => player.ready)) {
      return;
    }

    const now = Date.now();
    room.status = 'countdown';
    // Future match logic derives timing from this server-owned start state.
    room.startState = {
      countdownStartedAt: now,
      serverStartAt: now + config.countdownValues.length * 1000
    };
    broadcastRoomState(room);

    config.countdownValues.forEach((value, index) => {
      const timer = setTimeout(() => {
        if (roomStore.get(room.code) !== room || room.status !== 'countdown') return;

        io.to(roomChannel(room.code)).emit('countdown_tick', {
          code: room.code,
          value,
          serverTime: new Date().toISOString(),
          serverStartAt: room.startState.serverStartAt
        });
      }, index * 1000);
      room.countdownTimers.push(timer);
    });

    const startTimer = setTimeout(() => {
      if (roomStore.get(room.code) !== room || room.status !== 'countdown') return;

      clearRoomCountdown(room);
      startMatch(room);
    }, config.countdownValues.length * 1000);
    room.countdownTimers.push(startTimer);
  }

  // --- Rematch --------------------------------------------------------------

  function startRematchCountdown(room) {
    clearRoomCountdown(room);
    clearGameTimers(room);
    clearRematchTimer(room);
    clearDisconnectGrace(room);
    room.game = null;
    room.startState = null;
    room.players.forEach((player) => {
      player.ready = player.connected;
      player.rematchRequested = false;
      player.score = 0;
      player.speedDeltaTotalMs = 0;
      player.speedDeltaCount = 0;
    });
    refreshRoomStatus(room);
    startCountdownIfReady(room);
  }

  function expireRematch(room) {
    if (!room.rematch || room.status !== 'finished') return;

    room.players.forEach((player) => {
      player.rematchRequested = false;
    });
    clearRematchTimer(room);
    broadcastRoomState(room);
    io.to(roomChannel(room.code)).emit('rematch_expired', {
      room: publicRoom(room),
      message: 'Rematch expired'
    });
  }

  function startRematchPrompt(room, player) {
    clearRematchTimer(room);

    const requestedBySlot = room.players.indexOf(player) + 1;
    room.rematch = {
      requestedBySlot,
      requestedByName: player.nickname,
      expiresAt: Date.now() + config.rematchWindowMs,
      timer: null
    };
    room.rematch.timer = setTimeout(() => expireRematch(room), config.rematchWindowMs);
    room.rematch.timer.unref?.();
  }

  // --- Disconnect grace -----------------------------------------------------

  function pauseMatchForGrace(room, disconnectedSlot) {
    if (!room.game) return;

    // Drop the in-flight target so the remaining player cannot score uncontested
    // while the other player is gone, and stop scheduling new ones.
    clearTimeout(room.game.nextTargetTimer);
    room.game.nextTargetTimer = null;
    if (room.game.target) {
      clearCurrentTarget(room.game.target);
      room.game.target.resolved = true;
      room.game.target = null;
    }

    const expiresAt = Date.now() + config.disconnectGraceMs;
    room.disconnectGrace = {
      slot: disconnectedSlot,
      expiresAt,
      timer: setTimeout(() => expireDisconnectGrace(room), config.disconnectGraceMs)
    };
    room.disconnectGrace.timer.unref?.();
  }

  function expireDisconnectGrace(room) {
    if (!room.disconnectGrace || room.status !== 'playing') return;

    const slot = room.disconnectGrace.slot;
    clearDisconnectGrace(room);
    const remaining = connectedPlayers(room)[0];
    const missing = room.players[slot - 1] || null;
    if (remaining) {
      finishGame(room, remaining, 'disconnect', missing);
      return;
    }

    // Both gone — let cleanup take it.
    deleteRoom(room.code);
  }

  function resumeMatchAfterGrace(room) {
    if (!room.disconnectGrace) return;
    clearDisconnectGrace(room);
    if (room.status === 'playing' && connectedPlayers(room).length === 2) {
      scheduleNextTarget(room, 500);
    }
  }

  // --- Membership -----------------------------------------------------------

  function leaveCurrentRoom(socket, options = {}) {
    const voluntary = Boolean(options.voluntary);
    const code = socket.data.roomCode;
    if (!code) return;

    const room = roomStore.get(code);
    delete socket.data.roomCode;
    socket.leave(roomChannel(code));

    if (!room) return;

    const playerIndex = room.players.findIndex((player) => player.socketId === socket.id);
    if (playerIndex === -1) return;

    const player = room.players[playerIndex];
    if (room.status === 'countdown') {
      clearRoomCountdown(room);
    }

    player.connected = false;
    player.ready = false;
    player.rematchRequested = false;
    player.disconnectedAt = Date.now();

    if (room.status === 'playing') {
      const remaining = connectedPlayers(room)[0];
      if (!remaining) {
        // No connected players left in a playing room: tear it down immediately
        // so it can't linger for the full roomTtlMs.
        deleteRoom(code);
        return;
      }

      if (voluntary) {
        // Explicit Back Home / Leave Room ends the match for the leaver.
        finishGame(room, remaining, 'disconnect', player);
        return;
      }

      // Involuntary drop (refresh, network blip, mobile suspend): pause the match
      // and give a short grace window so the player can rejoin via get_room_state
      // or join_room without losing.
      pauseMatchForGrace(room, playerIndex + 1);
      broadcastRoomState(room);
      return;
    }

    if (!connectedPlayers(room).length) {
      if (voluntary) {
        deleteRoom(code);
        return;
      }

      // Mobile browsers can suspend sockets while users switch apps to share an invite.
      // Keep an otherwise-empty room briefly so the same presenceId can resume it.
      broadcastRoomState(room);
      return;
    }

    if (room.status === 'finished') {
      clearRematchTimer(room);
      room.players.forEach((roomPlayer) => {
        roomPlayer.rematchRequested = false;
      });
      const payload = {
        room: publicRoom(room),
        player: publicPlayer(player, playerIndex)
      };
      socket.to(roomChannel(code)).emit('player_disconnected', payload);
      broadcastRoomState(room);
      return;
    }

    refreshRoomStatus(room);

    const payload = {
      room: publicRoom(room),
      player: publicPlayer(player, playerIndex)
    };

    socket.to(roomChannel(code)).emit('player_disconnected', payload);
    broadcastRoomState(room);
  }

  function freshPlayer(socket, nickname, now = Date.now()) {
    return {
      socketId: socket.id,
      presenceId: socket.data.presenceId,
      nickname,
      ready: false,
      rematchRequested: false,
      score: 0,
      speedDeltaTotalMs: 0,
      speedDeltaCount: 0,
      connected: true,
      joinedAt: now,
      disconnectedAt: null
    };
  }

  // Re-seats `player` (an existing slot) onto `socket`, optionally keeping
  // score/timing — used by both the same-presence and stale-slot join paths.
  function reseatPlayer(socket, player, nickname, preserveScores) {
    player.socketId = socket.id;
    player.presenceId = socket.data.presenceId;
    player.nickname = nickname;
    player.ready = false;
    player.rematchRequested = false;
    player.score = preserveScores ? player.score || 0 : 0;
    player.speedDeltaTotalMs = preserveScores ? player.speedDeltaTotalMs || 0 : 0;
    player.speedDeltaCount = preserveScores ? player.speedDeltaCount || 0 : 0;
    player.connected = true;
    player.joinedAt = Date.now();
    player.disconnectedAt = null;
  }

  // --- Event entry points (called by socketHandlers) -------------------------

  function handleCreateRoom(socket, payload, nickname) {
    const lastCreateAt = socket.data.lastRoomCreateAt || 0;
    if (Date.now() - lastCreateAt < config.roomCreateCooldownMs) {
      emitRoomError(socket, 'Hold on a moment before creating another room.');
      return;
    }

    if (roomStore.count() >= config.maxRooms) {
      emitRoomError(socket, 'The server is busy right now. Try again in a minute.');
      return;
    }

    try {
      leaveCurrentRoom(socket, { voluntary: true });

      const code = createRoomCode();
      const now = Date.now();
      const room = {
        code,
        players: [freshPlayer(socket, nickname, now)],
        status: 'waiting',
        createdAt: now,
        countdownTimers: [],
        startState: null,
        rematch: null,
        game: null
      };

      roomStore.set(code, room);
      socket.data.roomCode = code;
      socket.data.lastRoomCreateAt = now;
      socket.join(roomChannel(code));

      track('room_created');
      socket.emit('room_created', {
        code,
        shareUrl: shareUrlForSocket(socket, code),
        room: publicRoom(room),
        selfSlot: 1
      });
      broadcastRoomState(room);
    } catch {
      emitRoomError(socket, 'Could not create a room. Try again.');
    }
  }

  function handleJoinRoom(socket, code, nickname) {
    const room = roomStore.get(code);
    if (!room) {
      emitRoomNotFound(socket, code);
      emitRoomError(socket, 'Room not found.');
      return;
    }

    const existingPlayer = room.players.find((player) => player.socketId === socket.id);
    if (existingPlayer) {
      const roomPayload = publicRoom(room);
      socket.emit('room_joined', {
        room: roomPayload,
        selfSlot: room.players.indexOf(existingPlayer) + 1
      });
      socket.emit('room_state', { room: roomPayload, status: room.status });
      return;
    }

    const resumableIndex = playerIndexByPresence(room, socket.data.presenceId);
    if (
      resumableIndex !== -1 &&
      ['waiting', 'ready', 'playing', 'finished'].includes(room.status)
    ) {
      leaveCurrentRoom(socket, { voluntary: true });

      // Returning player keeps their existing score/timing while a match is in
      // flight or finished, so a reload during 'playing' resumes, not restarts.
      const preserveScores = ['playing', 'finished'].includes(room.status);
      reseatPlayer(socket, room.players[resumableIndex], nickname, preserveScores);

      if (!['playing', 'finished'].includes(room.status)) {
        refreshRoomStatus(room);
      }

      if (room.status === 'playing') {
        resumeMatchAfterGrace(room);
      }

      socket.data.roomCode = code;
      socket.join(roomChannel(code));

      track('room_joined', 'resume');
      socket.emit('room_joined', {
        room: publicRoom(room),
        selfSlot: resumableIndex + 1
      });
      broadcastRoomState(room);
      return;
    }

    const disconnectedIndex = room.players.findIndex((player) => !player.connected);
    if (
      disconnectedIndex !== -1 &&
      ['waiting', 'ready', 'finished'].includes(room.status)
    ) {
      leaveCurrentRoom(socket, { voluntary: true });

      reseatPlayer(
        socket,
        room.players[disconnectedIndex],
        nickname,
        room.status === 'finished'
      );

      if (room.status !== 'finished') {
        refreshRoomStatus(room);
      }

      socket.data.roomCode = code;
      socket.join(roomChannel(code));

      track('room_joined', 'stale_slot');
      socket.emit('room_joined', {
        room: publicRoom(room),
        selfSlot: disconnectedIndex + 1
      });
      broadcastRoomState(room);
      return;
    }

    // A live match must never accept a brand-new player, even while one slot is
    // in disconnect grace — only the same presenceId may resume (handled above).
    // Without this guard a stranger could push a third slot into a playing room
    // and refreshRoomStatus below would stomp the 'playing' status.
    if (['countdown', 'playing'].includes(room.status)) {
      emitRoomError(socket, 'This match is already in progress.');
      return;
    }

    // Room fullness is scoped only to this room code and only connected players count.
    // Stale disconnected slots are reusable and must not block other independent rooms.
    if (room.players.length >= 2 || connectedPlayers(room).length >= 2) {
      emitRoomError(socket, 'Room is full.');
      return;
    }

    leaveCurrentRoom(socket, { voluntary: true });

    room.players.push(freshPlayer(socket, nickname));

    refreshRoomStatus(room);

    socket.data.roomCode = code;
    socket.join(roomChannel(code));

    track('room_joined', 'new');
    socket.emit('room_joined', {
      room: publicRoom(room),
      selfSlot: room.players.length
    });
    broadcastRoomState(room);
  }

  function handleGetRoomState(socket, code) {
    const room = roomStore.get(code);
    if (!room) {
      emitRoomNotFound(socket, code);
      return;
    }

    const existingIndex = room.players.findIndex(
      (player) => player.socketId === socket.id && player.connected
    );
    if (existingIndex !== -1) {
      socket.data.roomCode = code;
      socket.join(roomChannel(code));
      emitRoomState(socket, room, existingIndex + 1);
      return;
    }

    const resumableIndex = playerIndexByPresence(room, socket.data.presenceId);
    if (resumableIndex === -1) {
      emitRoomNotFound(
        socket,
        code,
        'This room could not be restored. Join again with the invite.'
      );
      return;
    }

    if (socket.data.roomCode && socket.data.roomCode !== code) {
      leaveCurrentRoom(socket, { voluntary: true });
    }

    const player = room.players[resumableIndex];
    const oldSocket = io.sockets.sockets.get(player.socketId);
    if (oldSocket && oldSocket.id !== socket.id) {
      delete oldSocket.data.roomCode;
      oldSocket.leave(roomChannel(code));
    }

    player.socketId = socket.id;
    player.presenceId = socket.data.presenceId;
    player.connected = true;
    player.disconnectedAt = null;

    socket.data.roomCode = code;
    socket.join(roomChannel(code));

    if (!['countdown', 'playing', 'finished'].includes(room.status)) {
      refreshRoomStatus(room);
    }

    if (room.status === 'playing') {
      resumeMatchAfterGrace(room);
    }

    // Reconnect recovery is per-room-code and per-presenceId; it never uses
    // global online presence to decide membership or room fullness.
    broadcastRoomState(room);
    emitRoomState(socket, room, resumableIndex + 1);
  }

  function handleGetOpenRooms(socket) {
    const openRooms = [];
    for (const room of roomStore.values()) {
      // Only lobbies genuinely waiting for a second player: one connected
      // player, not in countdown/playing/finished, no grace state to recover.
      if (!['waiting', 'ready'].includes(room.status)) continue;
      const connected = connectedPlayers(room);
      if (connected.length !== 1) continue;

      openRooms.push({
        code: room.code,
        hostName: connected[0].nickname,
        createdAt: room.createdAt
      });
    }

    openRooms.sort((a, b) => b.createdAt - a.createdAt);
    socket.emit('open_rooms', { rooms: openRooms.slice(0, config.openRoomsListLimit) });
  }

  function handlePlayerReady(socket, codeValue) {
    const membership = validateRoomMembership(socket, codeValue);
    if (membership.error) {
      emitRoomError(socket, membership.error);
      return;
    }

    const { room, player } = membership;
    if (['countdown', 'playing', 'finished'].includes(room.status)) {
      return;
    }

    player.ready = true;
    refreshRoomStatus(room);
    broadcastRoomState(room);
    startCountdownIfReady(room);
  }

  function handlePlayerUnready(socket, codeValue) {
    const membership = validateRoomMembership(socket, codeValue);
    if (membership.error) {
      emitRoomError(socket, membership.error);
      return;
    }

    const { room, player } = membership;
    if (['playing', 'finished'].includes(room.status)) {
      return;
    }

    if (room.status === 'countdown') {
      clearRoomCountdown(room);
    }

    player.ready = false;
    refreshRoomStatus(room);
    broadcastRoomState(room);
  }

  function handleTargetClick(socket, payload) {
    const membership = validateRoomMembership(socket, payload.code);
    if (membership.error) {
      emitRoomError(socket, membership.error);
      return;
    }

    const { room, player } = membership;
    const target = room.game?.target;
    const reactionMs = Number(payload.reactionMs);
    const slot = room.players.indexOf(player) + 1;

    // Clients can only submit attempts. The server validates room membership,
    // target identity, duplicate clicks, match state, and plausible reactionMs
    // before any score/result decision is made.
    if (
      room.status !== 'playing' ||
      !target ||
      target.resolved ||
      payload.matchId !== room.game.matchId ||
      payload.matchId !== target.matchId ||
      payload.targetId !== target.targetId ||
      target.claims.has(slot) ||
      !Number.isFinite(reactionMs) ||
      reactionMs < config.minReactionMs ||
      reactionMs > target.lifetimeMs
    ) {
      return;
    }

    if (target.type === 'bomb') {
      target.resolved = true;
      clearCurrentTarget(target);
      const winner = room.players.find(
        (roomPlayer) => roomPlayer !== player && roomPlayer.connected
      );
      if (winner) {
        finishGame(room, winner, 'bomb', player);
      }
      return;
    }

    target.claims.set(slot, {
      player,
      slot,
      reactionMs: Math.round(reactionMs)
    });

    if (!target.claimTimer) {
      clearTimeout(target.missTimer);
      target.missTimer = null;
      target.claimTimer = setTimeout(
        () => resolveCyanClaims(room, target),
        config.claimWindowMs
      );
    }
  }

  function handleRequestRematch(socket, codeValue) {
    const membership = validateRoomMembership(socket, codeValue);
    if (membership.error) {
      emitRoomError(socket, membership.error);
      return;
    }

    const { room, player } = membership;
    const connected = connectedPlayers(room);
    if (room.status !== 'finished') {
      emitRoomError(socket, 'Finish the current match before requesting a rematch.');
      return;
    }

    if (connected.length !== 2) {
      player.rematchRequested = false;
      clearRematchTimer(room);
      broadcastRoomState(room);
      emitRoomError(socket, 'Rematch needs both players connected.');
      return;
    }

    if (room.rematch?.expiresAt <= Date.now()) {
      expireRematch(room);
    }

    player.rematchRequested = true;

    if (connected.every((roomPlayer) => roomPlayer.rematchRequested)) {
      startRematchCountdown(room);
      return;
    }

    if (!room.rematch || room.rematch.expiresAt <= Date.now()) {
      startRematchPrompt(room, player);
    }

    broadcastRoomState(room);
  }

  // --- Sweeping / shutdown ----------------------------------------------------

  function startSweeper() {
    sweepTimer = setInterval(() => {
      const now = Date.now();

      for (const room of roomStore.values()) {
        if (now - room.createdAt > config.roomTtlMs) {
          deleteRoom(room.code);
          continue;
        }

        const hasConnectedPlayer = connectedPlayers(room).length > 0;
        const fullyStale =
          !hasConnectedPlayer &&
          room.players.every(
            (player) =>
              player.disconnectedAt &&
              now - player.disconnectedAt > config.disconnectedPlayerTtlMs
          );

        if (fullyStale) {
          deleteRoom(room.code);
        }
      }
    }, config.roomSweepIntervalMs);
    sweepTimer.unref();
  }

  function stopSweeper() {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }

  function deleteAllRooms() {
    for (const code of roomStore.codes()) {
      deleteRoom(code);
    }
  }

  function roomCount() {
    return roomStore.count();
  }

  return {
    roomCount,
    handleCreateRoom,
    handleJoinRoom,
    handleGetRoomState,
    handleGetOpenRooms,
    handlePlayerReady,
    handlePlayerUnready,
    handleTargetClick,
    handleRequestRematch,
    leaveCurrentRoom,
    startSweeper,
    stopSweeper,
    deleteAllRooms
  };
}

module.exports = { createRoomService };
