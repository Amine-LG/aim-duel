import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RealtimeStatus from './RealtimeStatus.jsx';
import SoundToggle from './SoundToggle.jsx';
import { sounds } from './sounds.js';
import { useRealtimeSocket } from './socket.jsx';
import {
  BOMB_TTL,
  COUNTDOWN_START,
  DEFAULT_PLAYER_ONE,
  DEFAULT_PLAYER_TWO,
  SOLO_CYAN_TTL,
  SOLO_MAX_MISSES,
  TARGET_SIZE_MIN,
  TOTAL
} from './lib/constants.js';
import {
  fitToArena,
  makeId,
  makeTarget,
  popupForTarget,
  raceTargetStyleForArena
} from './lib/arena.js';
import {
  avg,
  claimFeedbackText,
  claimPopupLines,
  nameForSlot,
  rating,
  recoveryView
} from './lib/format.js';
import {
  displayNicknameInput,
  nicknameOrDefault,
  routeMode,
  routeNickname,
  routeRoomCode,
  sanitizeRoomCodeInput,
  setRoute
} from './lib/routing.js';
import {
  clearStoredRoomCode,
  readStoredRoomCode,
  storeRoomCode
} from './lib/storage.js';
import { copyText } from './lib/clipboard.js';
import {
  emptyRaceState,
  emptyRoomSession,
  freshRound,
  gameOverFromRoom,
  inviteUrlWithNickname
} from './lib/state.js';
import { useNowTicker } from './hooks/useNowTicker.js';
import { useOpenRooms } from './hooks/useOpenRooms.js';
import HomeScreen from './screens/HomeScreen.jsx';
import { CreateRoomScreen, JoinRoomScreen } from './screens/RoomFormScreens.jsx';
import RecoveryScreen from './screens/RecoveryScreen.jsx';
import LobbyScreen from './screens/LobbyScreen.jsx';
import { MultiplayerCountdownScreen, RaceGameScreen } from './screens/RaceScreens.jsx';
import RaceResultsScreen from './screens/RaceResultsScreen.jsx';
import {
  SoloCountdownScreen,
  SoloGameOverScreen,
  SoloGameScreen,
  SoloResultsScreen
} from './screens/SoloScreens.jsx';

export default function App() {
  const { socket, status: realtimeStatus } = useRealtimeSocket();
  const initialMode = useMemo(routeMode, []);
  const initialCode = useMemo(routeRoomCode, []);
  const initialNickname = useMemo(routeNickname, []);
  const initialAppRound = useMemo(() => freshRound(initialMode), [initialMode]);
  const arenaRef = useRef(null);
  const raceArenaRef = useRef(null);
  const roundRef = useRef(initialAppRound);
  const bombTimerRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const labelTimersRef = useRef([]);
  const copiedTimerRef = useRef(null);
  const handledTargetRef = useRef(null);
  const roomSessionRef = useRef(emptyRoomSession());
  const [round, setRound] = useState(initialAppRound);
  const [roomForm, setRoomForm] = useState(() => ({
    nickname: initialNickname,
    code: initialCode,
    friendNickname: ''
  }));
  const [roomSession, setRoomSession] = useState(emptyRoomSession);
  const [raceState, setRaceState] = useState(emptyRaceState);
  // Open by default so the available rooms are visible on the home screen
  // without a click; the toggle still lets players collapse the list.
  const [openRoomsExpanded, setOpenRoomsExpanded] = useState(true);
  const [returnRoomCode, setReturnRoomCode] = useState(readStoredRoomCode);
  const [, setArenaVersion] = useState(0);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    roomSessionRef.current = roomSession;
  }, [roomSession]);

  const nowMs = useNowTicker(
    Boolean(roomSession.room?.rematch || roomSession.room?.disconnectGrace)
  );
  const openRooms = useOpenRooms(socket, round.mode === 'home');

  const clearBombTimer = useCallback(() => {
    window.clearTimeout(bombTimerRef.current);
    bombTimerRef.current = null;
  }, []);

  const clearSpawnTimer = useCallback(() => {
    window.clearTimeout(spawnTimerRef.current);
    spawnTimerRef.current = null;
  }, []);

  const clearPingTimer = useCallback(() => {
    window.clearTimeout(pingTimerRef.current);
    pingTimerRef.current = null;
  }, []);

  const clearCountdownTimer = useCallback(() => {
    window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
  }, []);

  const clearAllTimers = useCallback(() => {
    clearBombTimer();
    clearSpawnTimer();
    clearPingTimer();
    clearCountdownTimer();
    window.clearTimeout(copiedTimerRef.current);
    labelTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    labelTimersRef.current = [];
  }, [clearBombTimer, clearCountdownTimer, clearPingTimer, clearSpawnTimer]);

  const spawnLabel = useCallback((target, ms) => {
    const label = {
      id: makeId(),
      x: target.left + target.size / 2,
      y: target.top,
      text: `${ms}ms`,
      // Same palette as the multiplayer claim feedback: cyan for sharp hits,
      // plain white otherwise — no yellow tier.
      color: ms < 350 ? '#00e5ff' : '#fff'
    };

    setRound((current) => ({
      ...current,
      labels: [...current.labels.slice(-5), label]
    }));

    const timer = window.setTimeout(() => {
      setRound((current) => ({
        ...current,
        labels: current.labels.filter((item) => item.id !== label.id)
      }));
    }, 700);
    labelTimersRef.current.push(timer);
  }, []);

  const measurePing = useCallback(async () => {
    if (roundRef.current.mode !== 'game') return;

    try {
      const started = performance.now();
      await fetch('/health', { cache: 'no-store' });
      const ms = Math.round(performance.now() - started);
      setRound((current) => (current.mode === 'game' ? { ...current, ping: ms } : current));
    } catch {
      setRound((current) => (current.mode === 'game' ? { ...current, ping: null } : current));
    }

    clearPingTimer();
    pingTimerRef.current = window.setTimeout(measurePing, 5000);
  }, [clearPingTimer]);

  const triggerGameOver = useCallback(
    (sourceRound = roundRef.current, endReason = 'bomb') => {
      clearBombTimer();
      clearSpawnTimer();
      clearPingTimer();
      const nextRound = {
        ...sourceRound,
        mode: 'gameover',
        endReason,
        target: null
      };
      roundRef.current = nextRound;
      setRound(nextRound);
    },
    [clearBombTimer, clearPingTimer, clearSpawnTimer]
  );

  const spawn = useCallback(
    (hitCount = roundRef.current.hitCount) => {
      if (roundRef.current.mode !== 'game' || !arenaRef.current) return;

      clearBombTimer();
      clearSpawnTimer();
      const target = makeTarget(arenaRef.current, hitCount);
      handledTargetRef.current = null;

      if (target.type === 'bomb') sounds.bombSpawn();
      setRound((current) => {
        if (current.mode !== 'game') return current;
        return { ...current, target };
      });

      // Both target types expire, matching the multiplayer feel: cyan that
      // times out counts as a miss, and an untouched run eventually ends.
      const ttl = target.type === 'bomb' ? BOMB_TTL : SOLO_CYAN_TTL;
      bombTimerRef.current = window.setTimeout(() => {
        if (roundRef.current.mode !== 'game' || roundRef.current.target?.id !== target.id) {
          return;
        }

        const missCount = roundRef.current.missCount + 1;
        roundRef.current = { ...roundRef.current, missCount, target: null };
        setRound((current) => {
          if (current.mode !== 'game' || current.target?.id !== target.id) return current;
          return { ...current, missCount, target: null };
        });

        if (missCount >= SOLO_MAX_MISSES) {
          sounds.tie();
          triggerGameOver(roundRef.current, 'idle');
          return;
        }

        if (target.type !== 'bomb') {
          sounds.miss();
        }

        spawnTimerRef.current = window.setTimeout(() => {
          if (roundRef.current.mode === 'game' && !roundRef.current.target) {
            spawn(roundRef.current.hitCount);
          }
        }, 150);
      }, ttl);
    },
    [clearBombTimer, clearSpawnTimer, triggerGameOver]
  );

  const beginCountdown = useCallback(() => {
    clearAllTimers();
    sounds.countdownTick();
    setRound({
      ...freshRound('countdown'),
      mode: 'countdown',
      countdown: COUNTDOWN_START
    });

    let next = COUNTDOWN_START;
    countdownTimerRef.current = window.setInterval(() => {
      next -= 1;

      if (next <= 0) {
        clearCountdownTimer();
        sounds.go();
        setRound((current) => ({
          ...current,
          mode: 'game',
          countdown: 0
        }));

        spawnTimerRef.current = window.setTimeout(() => {
          spawn(0);
          measurePing();
        }, 400);
        return;
      }

      sounds.countdownTick();
      setRound((current) => ({ ...current, countdown: next }));
    }, 1000);
  }, [clearAllTimers, clearCountdownTimer, measurePing, spawn]);

  const goHome = useCallback(() => {
    if (socket?.connected && roomSessionRef.current.room) {
      socket.emit('leave_room');
    }

    if (roomSessionRef.current.room) {
      clearStoredRoomCode();
    }
    clearAllTimers();
    setRoomSession(emptyRoomSession());
    setRaceState(emptyRaceState());
    setRound(freshRound());
    setRoute('/');
  }, [clearAllTimers, socket]);

  const openSolo = useCallback(() => {
    setRoomSession(emptyRoomSession());
    setRaceState(emptyRaceState());
    setRoute('/solo');
    // Straight into the countdown — no intermediate start screen.
    beginCountdown();
  }, [beginCountdown]);

  const openCreateRoom = useCallback(() => {
    clearAllTimers();
    setRoomSession(emptyRoomSession());
    setRaceState(emptyRaceState());
    setRound(freshRound('create-room'));
    setRoute('/create');
  }, [clearAllTimers]);

  const openJoinFromList = useCallback(
    (code) => {
      const safeCode = sanitizeRoomCodeInput(code || '');
      if (!safeCode) return;

      sounds.click();
      clearAllTimers();
      setRoomSession(emptyRoomSession());
      setRaceState(emptyRaceState());
      setRoomForm((current) => ({ ...current, code: safeCode }));
      setRound(freshRound('join-room'));
      setRoute(`/join/${safeCode}`);
    },
    [clearAllTimers]
  );

  useEffect(() => {
    if (round.mode === 'home') {
      setReturnRoomCode(readStoredRoomCode());
    }
  }, [round.mode]);

  const updateRoomForm = useCallback((event) => {
    const { name, value } = event.target;
    setRoomForm((current) => ({
      ...current,
      [name]: name === 'code' ? sanitizeRoomCodeInput(value) : displayNicknameInput(value)
    }));
  }, []);

  const submitCreateRoom = useCallback(
    (event) => {
      event.preventDefault();
      const nickname = nicknameOrDefault(roomForm.nickname, DEFAULT_PLAYER_ONE);

      if (!socket?.connected) {
        setRoomSession((current) => ({
          ...current,
          error: 'Realtime is still connecting. Try again in a moment.'
        }));
        return;
      }

      setRoomSession((current) => ({ ...current, error: '', busy: true }));
      socket.emit('create_room', { nickname });
    },
    [roomForm.nickname, socket]
  );

  const submitJoinRoom = useCallback(
    (event) => {
      event.preventDefault();
      const code = sanitizeRoomCodeInput(roomForm.code);
      const nickname = nicknameOrDefault(roomForm.nickname, DEFAULT_PLAYER_TWO);

      if (code.length !== 6) {
        setRoomSession((current) => ({
          ...current,
          error: 'Enter a valid 6-character room code.'
        }));
        return;
      }

      if (!socket?.connected) {
        setRoomSession((current) => ({
          ...current,
          error: 'Realtime is still connecting. Try again in a moment.'
        }));
        return;
      }

      setRoomForm((current) => ({ ...current, code }));
      setRoomSession((current) => ({ ...current, error: '', busy: true }));
      socket.emit('join_room', { code, nickname });
    },
    [roomForm.code, roomForm.nickname, socket]
  );

  const leaveRoom = useCallback(() => {
    if (socket?.connected) {
      socket.emit('leave_room');
    }

    clearStoredRoomCode();
    clearAllTimers();
    setRoomSession(emptyRoomSession());
    setRaceState(emptyRaceState());
    setRound(freshRound());
    setRoute('/');
  }, [clearAllTimers, socket]);

  const markReady = useCallback(() => {
    const code = roomSession.room?.code;
    if (!socket?.connected || !code) return;

    setRoomSession((current) => ({ ...current, error: '', busy: true }));
    socket.emit('player_ready', { code });
  }, [roomSession.room?.code, socket]);

  const markUnready = useCallback(() => {
    const code = roomSession.room?.code;
    if (!socket?.connected || !code) return;

    setRoomSession((current) => ({ ...current, error: '', busy: true }));
    socket.emit('player_unready', { code });
  }, [roomSession.room?.code, socket]);

  const requestRematch = useCallback(() => {
    const code = roomSession.room?.code;
    if (!socket?.connected || !code) return;

    setRoomSession((current) => ({ ...current, error: '', busy: true }));
    socket.emit('request_rematch', { code });
  }, [roomSession.room?.code, socket]);

  const currentRecoveryCode = useCallback(() => {
    return sanitizeRoomCodeInput(
      roomSessionRef.current.room?.code || routeRoomCode() || roomForm.code || initialCode
    );
  }, [initialCode, roomForm.code]);

  const requestRoomState = useCallback(
    (reason = 'recover') => {
      const code = currentRecoveryCode();
      if (!code) return;

      if (!socket?.connected) {
        setRoomSession((current) => ({
          ...current,
          error: 'Reconnecting to room...',
          busy: false
        }));
        // Surface the recovery panel any time we're in a live multiplayer screen
        // without realtime, so the user never stares at a frozen/blank arena.
        const liveMultiplayerMode = [
          'multiplayer-countdown',
          'multiplayer-game',
          'multiplayer-results'
        ].includes(roundRef.current.mode);
        if (!roomSessionRef.current.room || liveMultiplayerMode) {
          setRound(freshRound('room-recovery'));
        }
        return;
      }

      setRoomForm((current) => ({ ...current, code }));
      setRoomSession((current) => ({
        ...current,
        // Clear any stale error (e.g. "Rematch expired") whenever we ask the
        // server for fresh truth — old messages must not leak into the recovery
        // panel or persist after the situation has changed.
        error: '',
        busy: !current.room
      }));
      socket.emit('get_room_state', { code });
    },
    [currentRecoveryCode, socket]
  );

  const returnToRoom = useCallback(() => {
    const code = readStoredRoomCode();
    if (!code) {
      setReturnRoomCode('');
      return;
    }

    sounds.click();
    setRoomForm((current) => ({ ...current, code }));
    setRound(freshRound('room-recovery'));
    setRoute(`/room/${code}`);
    requestRoomState('return');
  }, [requestRoomState]);

  useEffect(() => {
    if (!socket) return undefined;

    const enterLobby = ({ code, shareUrl = '', room, selfSlot = null }) => {
      if (!room) return;

      storeRoomCode(room.code);
      setRoomSession({
        room,
        shareUrl,
        error: '',
        busy: false,
        selfSlot,
        countdownValue: null
      });
      setRaceState(emptyRaceState());
      setRound(freshRound('lobby'));
      setRoute(`/room/${code || room.code}`);
    };

    const eventMatchesCurrentRoom = (payload = {}) => {
      if (!payload.matchId) return true;
      const currentRoom = roomSessionRef.current.room;
      if (!currentRoom) return Boolean(payload.room?.game?.matchId === payload.matchId);
      if (payload.room?.code && payload.room.code !== currentRoom.code) return false;
      return currentRoom.game?.matchId === payload.matchId;
    };

    const eventMatchesPlayingRoom = (payload = {}) => {
      const currentRoom = roomSessionRef.current.room;
      return (
        currentRoom?.status === 'playing' &&
        currentRoom.game?.matchId &&
        currentRoom.game.matchId === payload.matchId
      );
    };

    const syncRoomScreen = (room) => {
      if (room.status === 'countdown') {
        setRaceState(emptyRaceState());
        setRound(freshRound('multiplayer-countdown'));
        setRoute(`/room/${room.code}`);
        return;
      }

      if (room.status === 'playing') {
        setRound(freshRound('multiplayer-game'));
        setRoute(`/room/${room.code}`);
        setRaceState((current) => {
          const serverTarget = room.game?.target || null;
          const winScore = room.game?.winScore || current.winScore || 10;

          if (!serverTarget) {
            return {
              ...current,
              target: null,
              clickedTargetId: null,
              gameOver: null,
              winScore
            };
          }

          if (current.target?.targetId === serverTarget.targetId) {
            return {
              ...current,
              target: serverTarget,
              gameOver: null,
              winScore
            };
          }

          return {
            ...emptyRaceState(),
            target: serverTarget,
            targetRenderedAt: performance.now(),
            feedback: serverTarget.type === 'bomb' ? 'Bomb - do not click' : 'Hit the cyan target',
            feedbackTone: serverTarget.type === 'bomb' ? 'danger' : '',
            winScore
          };
        });
        return;
      }

      if (room.status === 'finished') {
        const gameOver = gameOverFromRoom(room);
        if (gameOver) {
          setRaceState((current) => ({
            ...current,
            target: null,
            clickedTargetId: null,
            gameOver
          }));
          setRound(freshRound('multiplayer-results'));
          setRoute(`/room/${room.code}`);
        }
        return;
      }

      if (
        ['room-recovery', 'multiplayer-countdown', 'multiplayer-game', 'multiplayer-results'].includes(
          roundRef.current.mode
        )
      ) {
        setRaceState(emptyRaceState());
        setRound(freshRound('lobby'));
        setRoute(`/room/${room.code}`);
      }
    };

    const updateRoom = ({ room, selfSlot = null }) => {
      if (!room) return;

      setRoomSession((current) => {
        if (current.room && current.room.code !== room.code) return current;
        return {
          ...current,
          room,
          busy: false,
          error: '',
          selfSlot: Number.isInteger(selfSlot) ? selfSlot : current.selfSlot,
          countdownValue: room.status === 'countdown' ? current.countdownValue : null
        };
      });

      syncRoomScreen(room);
    };

    const showRoomError = ({ message } = {}) => {
      setRoomSession((current) => ({
        ...current,
        error: message || 'Room action failed.',
        busy: false,
        countdownValue: null
      }));
    };

    const handlePlayerDisconnected = ({ room, player } = {}) => {
      if (!room) return;
      const droppedName = nameForSlot(player?.nickname, player?.slot);
      setRoomSession((current) => {
        if (current.room && current.room.code !== room.code) return current;
        return {
          ...current,
          room,
          busy: false,
          countdownValue: null,
          error:
            room.status === 'finished'
              ? `${droppedName} left. Rematch is unavailable.`
              : `${droppedName} disconnected.`
        };
      });

      if (roundRef.current.mode === 'multiplayer-countdown') {
        setRound(freshRound('lobby'));
      }
    };

    const handleCountdownTick = ({ code, value } = {}) => {
      if (roomSessionRef.current.room?.code === code) {
        if (value === 'GO') sounds.go();
        else sounds.countdownTick();
      }
      setRoomSession((current) => {
        if (!current.room || current.room.code !== code) return current;
        return { ...current, countdownValue: value, busy: false };
      });
      setRaceState(emptyRaceState());
      setRound(freshRound('multiplayer-countdown'));
    };

    const handleGameStarted = ({ room, winScore = 10 }) => {
      if (!room) return;

      setRoomSession((current) => {
        if (current.room && current.room.code !== room.code) return current;
        return { ...current, room, busy: false, countdownValue: null };
      });
      setRaceState({ ...emptyRaceState(), winScore });
      setRound(freshRound('multiplayer-game'));
      setRoute(`/room/${room.code}`);
    };

    const handleTargetSpawn = (target) => {
      if (!eventMatchesPlayingRoom(target)) return;

      if (target.type === 'bomb') sounds.bombSpawn();
      else sounds.spawn();
      setRaceState((current) => ({
        ...current,
        target,
        targetRenderedAt: performance.now(),
        clickedTargetId: null,
        popup: null,
        gameOver: null,
        feedback: target.type === 'bomb' ? 'Bomb - do not click' : 'Hit the cyan target',
        feedbackTone: target.type === 'bomb' ? 'danger' : ''
      }));
      setRound(freshRound('multiplayer-game'));
    };

    const handleTargetClaimed = (payload = {}) => {
      if (!eventMatchesCurrentRoom(payload)) return;

      const { room, winnerSlot } = payload;
      if (room) {
        setRoomSession((current) => {
          if (current.room && current.room.code !== room.code) return current;
          return { ...current, room, busy: false };
        });
      }

      const youWon = winnerSlot === roomSessionRef.current.selfSlot;
      if (youWon) sounds.pointWon();
      else sounds.pointLost();
      setRaceState((current) => {
        const target = payload.target || current.target;
        const popupLines = claimPopupLines(payload, roomSessionRef.current.selfSlot);
        return {
          ...current,
          target: null,
          clickedTargetId: null,
          feedback: claimFeedbackText(payload, roomSessionRef.current.selfSlot),
          feedbackTone: youWon ? 'good' : 'danger',
          popup: popupForTarget(
            target,
            popupLines,
            youWon ? 'good' : 'danger',
            raceArenaRef.current
          )
        };
      });
    };

    const handleTargetTied = (payload = {}) => {
      if (!eventMatchesCurrentRoom(payload)) return;

      const { room } = payload;
      if (room) {
        setRoomSession((current) => {
          if (current.room && current.room.code !== room.code) return current;
          return { ...current, room, busy: false };
        });
      }

      sounds.tie();
      setRaceState((current) => ({
        ...current,
        target: null,
        clickedTargetId: null,
        feedback: 'Tie · no point',
        feedbackTone: '',
        popup: popupForTarget(payload.target || current.target, ['Tie', 'no point'], '', raceArenaRef.current)
      }));
    };

    const handleTargetMissed = (payload = {}) => {
      if (!eventMatchesCurrentRoom(payload)) return;

      const { room } = payload;
      if (room) {
        setRoomSession((current) => {
          if (current.room && current.room.code !== room.code) return current;
          return { ...current, room, busy: false };
        });
      }

      sounds.miss();
      setRaceState((current) => ({
        ...current,
        target: null,
        clickedTargetId: null,
        feedback: 'Missed',
        feedbackTone: '',
        popup: popupForTarget(payload.target || current.target, ['Missed'], '', raceArenaRef.current)
      }));
    };

    const handleTargetAvoided = (payload = {}) => {
      if (!eventMatchesCurrentRoom(payload)) return;

      const { room } = payload;
      if (room) {
        setRoomSession((current) => {
          if (current.room && current.room.code !== room.code) return current;
          return { ...current, room, busy: false };
        });
      }

      sounds.bombSafe();
      setRaceState((current) => ({
        ...current,
        target: null,
        clickedTargetId: null,
        feedback: 'Bomb avoided',
        feedbackTone: 'good',
        popup: popupForTarget(payload.target || current.target, ['Safe'], 'good', raceArenaRef.current)
      }));
    };

    const handleGameOver = (payload) => {
      if (!eventMatchesCurrentRoom(payload)) return;

      const selfSlot = roomSessionRef.current.selfSlot;
      const isBombEnd = payload?.reason === 'bomb';
      if (isBombEnd) sounds.bombHit();
      if (payload?.isDraw || payload?.reason === 'inactivity') {
        sounds.tie();
      } else if (payload?.winnerSlot === selfSlot) {
        sounds.matchWin(isBombEnd ? 0.3 : 0);
      } else {
        sounds.matchLose(isBombEnd ? 0.3 : 0);
      }

      if (payload?.room) {
        setRoomSession((current) => {
          if (current.room && current.room.code !== payload.room.code) return current;
          return { ...current, room: payload.room, busy: false, countdownValue: null };
        });
      }

      setRaceState((current) => ({
        ...current,
        target: null,
        clickedTargetId: null,
        feedback: '',
        feedbackTone: '',
        popup: null,
        gameOver: payload
      }));
      setRound(freshRound('multiplayer-results'));
    };

    const handleRematchExpired = ({ room, message } = {}) => {
      if (!room) return;

      setRoomSession((current) => {
        if (current.room && current.room.code !== room.code) return current;
        return {
          ...current,
          room,
          busy: false,
          countdownValue: null,
          error: message || 'Rematch expired'
        };
      });
    };

    const handleRoomNotFound = ({ code, message } = {}) => {
      const currentCode = currentRecoveryCode();
      if (code && currentCode && sanitizeRoomCodeInput(code) !== currentCode) return;

      // The server confirmed this room is gone; drop the Return-to-game hint.
      if (!code || sanitizeRoomCodeInput(code) === readStoredRoomCode()) {
        clearStoredRoomCode();
      }

      if (roundRef.current.mode === 'join-room') {
        setRoomSession((current) => ({
          ...current,
          error: message || 'Room not found or expired.',
          busy: false,
          countdownValue: null
        }));
        return;
      }

      setRoomForm((current) => ({
        ...current,
        code: sanitizeRoomCodeInput(code || currentCode)
      }));
      setRoomSession({
        ...emptyRoomSession(),
        error: message || 'Room not found or expired.'
      });
      setRaceState(emptyRaceState());
      setRound(freshRound('room-recovery'));
    };

    socket.on('room_created', enterLobby);
    socket.on('room_joined', enterLobby);
    socket.on('room_error', showRoomError);
    socket.on('room_not_found', handleRoomNotFound);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('countdown_tick', handleCountdownTick);
    socket.on('game_started', handleGameStarted);
    socket.on('target_spawn', handleTargetSpawn);
    socket.on('target_claimed', handleTargetClaimed);
    socket.on('target_tied', handleTargetTied);
    socket.on('target_missed', handleTargetMissed);
    socket.on('target_avoided', handleTargetAvoided);
    socket.on('game_over', handleGameOver);
    socket.on('room_state', updateRoom);
    socket.on('rematch_expired', handleRematchExpired);

    return () => {
      socket.off('room_created', enterLobby);
      socket.off('room_joined', enterLobby);
      socket.off('room_error', showRoomError);
      socket.off('room_not_found', handleRoomNotFound);
      socket.off('player_disconnected', handlePlayerDisconnected);
      socket.off('countdown_tick', handleCountdownTick);
      socket.off('game_started', handleGameStarted);
      socket.off('target_spawn', handleTargetSpawn);
      socket.off('target_claimed', handleTargetClaimed);
      socket.off('target_tied', handleTargetTied);
      socket.off('target_missed', handleTargetMissed);
      socket.off('target_avoided', handleTargetAvoided);
      socket.off('game_over', handleGameOver);
      socket.off('room_state', updateRoom);
      socket.off('rematch_expired', handleRematchExpired);
    };
  }, [currentRecoveryCode, roomSession.selfSlot, socket]);

  useEffect(() => {
    if (!socket) return undefined;

    const shouldRecoverRoom = () => {
      const mode = roundRef.current.mode;
      return (
        Boolean(currentRecoveryCode()) &&
        (window.location.pathname.startsWith('/room') ||
          ['lobby', 'multiplayer-countdown', 'multiplayer-game', 'multiplayer-results', 'room-recovery'].includes(
            mode
          ))
      );
    };

    const recover = (reason) => {
      if (!shouldRecoverRoom()) return;
      if (!socket.connected) socket.connect();
      requestRoomState(reason);
    };

    const handleConnect = () => recover('connect');
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recover('visible');
    };
    const handlePageShow = () => recover('pageshow');
    const handleFocus = () => recover('focus');

    socket.on('connect', handleConnect);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);

    if (socket.connected && shouldRecoverRoom()) {
      requestRoomState('mount');
    }

    return () => {
      socket.off('connect', handleConnect);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentRecoveryCode, requestRoomState, socket]);

  const handleTargetDown = useCallback(
    (event, targetId) => {
      event.preventDefault();
      event.stopPropagation();
      const current = roundRef.current;
      const target = current.target;

      if (
        current.mode !== 'game' ||
        !target ||
        target.id !== targetId ||
        handledTargetRef.current === target.id
      ) {
        return;
      }

      handledTargetRef.current = target.id;
      clearBombTimer();
      clearSpawnTimer();

      if (target.type === 'bomb') {
        sounds.bombHit();
        triggerGameOver(current);
        return;
      }

      sounds.soloHit();
      const ms = Math.max(1, Math.round(performance.now() - target.startedAt));
      const hitCount = current.hitCount + 1;
      const times = [...current.times, ms];
      roundRef.current = {
        ...current,
        hitCount,
        missCount: 0,
        times,
        target: null
      };
      spawnLabel(target, ms);

      setRound((latest) => {
        if (latest.target?.id !== target.id) return latest;
        return {
          ...latest,
          hitCount,
          missCount: 0,
          times,
          target: null
        };
      });

      if (hitCount >= TOTAL) {
        clearPingTimer();
        sounds.matchWin(0.2);
        spawnTimerRef.current = window.setTimeout(() => {
          setRound((latest) => ({
            ...latest,
            mode: 'results',
            target: null
          }));
        }, 200);
        return;
      }

      spawnTimerRef.current = window.setTimeout(() => spawn(hitCount), 60);
    },
    [clearBombTimer, clearPingTimer, clearSpawnTimer, spawn, spawnLabel, triggerGameOver]
  );

  const showCopiedToast = useCallback(() => {
    setRound((current) => ({ ...current, copied: true }));
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setRound((current) => ({ ...current, copied: false }));
    }, 2000);
  }, []);

  const copyInvite = useCallback(async () => {
    const code = roomSession.room?.code;
    if (!code) return;

    const inviteUrl = inviteUrlWithNickname(
      // Always the browser's own origin — the page is served single-origin, so
      // this is the correct public URL. (The server-built shareUrl can't know
      // the real origin and falls back to localhost.)
      `${window.location.origin}/join/${code}`,
      roomForm.friendNickname
    );
    try {
      await copyText(inviteUrl);
    } catch {
      // The UI still acknowledges the click when browser clipboard access is blocked.
    }

    showCopiedToast();
  }, [roomForm.friendNickname, roomSession.room?.code, showCopiedToast]);

  const shareInvite = useCallback(async () => {
    const code = roomSession.room?.code;
    if (!code) return;

    const inviteUrl = inviteUrlWithNickname(
      // Always the browser's own origin — the page is served single-origin, so
      // this is the correct public URL. (The server-built shareUrl can't know
      // the real origin and falls back to localhost.)
      `${window.location.origin}/join/${code}`,
      roomForm.friendNickname
    );
    const text = `Play Aim Duel with me! Tap to join my room: ${inviteUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // User cancelled the native sheet — not an error worth a fallback.
        if (error?.name === 'AbortError') return;
      }
    }

    // No native share (or it failed): fall back to copying the link.
    try {
      await copyText(inviteUrl);
    } catch {
      // The toast still acknowledges the tap when the clipboard is blocked.
    }

    showCopiedToast();
  }, [roomForm.friendNickname, roomSession.room?.code, showCopiedToast]);

  const handleRaceTargetDown = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const code = roomSession.room?.code;
      const target = raceState.target;
      if (
        !socket?.connected ||
        !code ||
        !target ||
        raceState.clickedTargetId === target.targetId
      ) {
        return;
      }

      // Reaction time is measured from this browser's rendered target to tap/click.
      // The server validates it and resolves scoring after the claim window.
      const reactionMs = Math.max(1, Math.round(performance.now() - raceState.targetRenderedAt));
      setRaceState((current) => ({
        ...current,
        clickedTargetId: target.targetId
      }));
      socket.emit('target_click', {
        code,
        targetId: target.targetId,
        matchId: target.matchId || roomSession.room?.game?.matchId,
        reactionMs
      });
    },
    [
      raceState.clickedTargetId,
      raceState.target,
      raceState.targetRenderedAt,
      roomSession.room?.code,
      roomSession.room?.game?.matchId,
      socket
    ]
  );

  useEffect(() => {
    if (round.mode !== 'game') return undefined;

    const keepTargetInBounds = () => {
      setRound((current) => {
        if (current.mode !== 'game' || !current.target || !arenaRef.current) return current;
        const target = fitToArena(current.target, arenaRef.current);

        if (
          target.size === current.target.size &&
          target.left === current.target.left &&
          target.top === current.target.top
        ) {
          return current;
        }

        return { ...current, target };
      });
    };

    window.addEventListener('resize', keepTargetInBounds);
    const observer = window.ResizeObserver ? new ResizeObserver(keepTargetInBounds) : null;
    if (observer && arenaRef.current) observer.observe(arenaRef.current);

    return () => {
      window.removeEventListener('resize', keepTargetInBounds);
      observer?.disconnect();
    };
  }, [round.mode]);

  useEffect(() => {
    if (round.mode !== 'multiplayer-game') return undefined;

    const refreshArena = () => setArenaVersion((value) => value + 1);
    window.addEventListener('resize', refreshArena);
    const observer = window.ResizeObserver ? new ResizeObserver(refreshArena) : null;
    if (observer && raceArenaRef.current) observer.observe(raceArenaRef.current);
    refreshArena();

    return () => {
      window.removeEventListener('resize', refreshArena);
      observer?.disconnect();
    };
  }, [round.mode]);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const average = useMemo(() => Math.round(avg(round.times)), [round.times]);
  const best = useMemo(() => (round.times.length ? Math.min(...round.times) : 0), [round.times]);
  const progress = `${(round.hitCount / TOTAL) * 100}%`;
  const resultRating = rating(average || 999);
  const lobbyRoom = roomSession.room;
  const toggleReady = (nextReady) => {
    sounds.click();
    if (nextReady) markReady();
    else markUnready();
  };
  const inviteUrl = lobbyRoom
    ? inviteUrlWithNickname(
        `${window.location.origin}/join/${lobbyRoom.code}`,
        roomForm.friendNickname
      )
    : '';
  const whatsAppShareUrl = inviteUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Play Aim Duel with me! Tap to join my room: ${inviteUrl}`)}`
    : '';

  const targetStyle = round.target
    ? {
        width: `${round.target.size}px`,
        height: `${round.target.size}px`,
        left: `${round.target.left}px`,
        top: `${round.target.top}px`
      }
    : undefined;
  const raceTargetStyle = raceState.target
    ? raceArenaRef.current
      ? raceTargetStyleForArena(raceState.target, raceArenaRef.current)
      : {
          left: `${raceState.target.x * 100}%`,
          top: `${raceState.target.y * 100}%`,
          width: `${TARGET_SIZE_MIN}px`,
          height: `${TARGET_SIZE_MIN}px`
        }
    : undefined;
  const recoveryCode = currentRecoveryCode();
  const roomModes = [
    'lobby',
    'multiplayer-countdown',
    'multiplayer-game',
    'multiplayer-results',
    'room-recovery'
  ];
  // Any room-mode screen whose required data is missing must fall back to the
  // recovery panel — a blank/black screen is never acceptable.
  const showRoomFallback =
    roomModes.includes(round.mode) &&
    (!lobbyRoom ||
      round.mode === 'room-recovery' ||
      (round.mode === 'multiplayer-results' && !raceState.gameOver));
  const {
    title: recoveryTitle,
    message: recoveryMessage,
    isRoomUnavailable: recoveryRoomUnavailable
  } = recoveryView(realtimeStatus.state, roomSession.error, Boolean(lobbyRoom));
  const recoveryReconnecting = realtimeStatus.state !== 'connected';

  return (
    <main className="app">
      <RealtimeStatus
        compact={['game', 'multiplayer-countdown', 'multiplayer-game'].includes(round.mode)}
      />
      <SoundToggle />

      {round.mode === 'home' && (
        <HomeScreen
          returnRoomCode={returnRoomCode}
          hasRoomSession={Boolean(roomSession.room)}
          openRooms={openRooms}
          openRoomsExpanded={openRoomsExpanded}
          onToggleOpenRooms={() => setOpenRoomsExpanded((value) => !value)}
          onReturnToRoom={returnToRoom}
          onOpenSolo={openSolo}
          onOpenCreateRoom={openCreateRoom}
          onJoinRoom={openJoinFromList}
        />
      )}

      {round.mode === 'create-room' && (
        <CreateRoomScreen
          form={roomForm}
          error={roomSession.error}
          busy={roomSession.busy}
          onChange={updateRoomForm}
          onSubmit={submitCreateRoom}
          onBack={goHome}
        />
      )}

      {round.mode === 'join-room' && (
        <JoinRoomScreen
          form={roomForm}
          error={roomSession.error}
          busy={roomSession.busy}
          onChange={updateRoomForm}
          onSubmit={submitJoinRoom}
          onBack={goHome}
        />
      )}

      {showRoomFallback && (
        <RecoveryScreen
          title={recoveryTitle}
          message={recoveryMessage}
          reconnecting={recoveryReconnecting}
          code={recoveryCode}
          canRetry={Boolean(recoveryCode) && Boolean(socket?.connected)}
          showCreateRoom={recoveryRoomUnavailable}
          onRetry={() => requestRoomState('manual')}
          onHome={goHome}
          onCreateRoom={openCreateRoom}
        />
      )}

      {round.mode === 'lobby' && lobbyRoom && (
        <LobbyScreen
          room={lobbyRoom}
          selfSlot={roomSession.selfSlot}
          busy={roomSession.busy}
          inviteUrl={inviteUrl}
          whatsAppShareUrl={whatsAppShareUrl}
          onShareInvite={shareInvite}
          onCopyInvite={copyInvite}
          onToggleReady={toggleReady}
          onLeaveRoom={leaveRoom}
        />
      )}

      {round.mode === 'multiplayer-countdown' && lobbyRoom && (
        <MultiplayerCountdownScreen value={roomSession.countdownValue} />
      )}

      {round.mode === 'multiplayer-game' && lobbyRoom && (
        <RaceGameScreen
          room={lobbyRoom}
          selfSlot={roomSession.selfSlot}
          raceState={raceState}
          raceTargetStyle={raceTargetStyle}
          raceArenaRef={raceArenaRef}
          nowMs={nowMs}
          onTargetPointerDown={handleRaceTargetDown}
          onLeave={leaveRoom}
        />
      )}

      {round.mode === 'multiplayer-results' && lobbyRoom && raceState.gameOver && (
        <RaceResultsScreen
          room={lobbyRoom}
          selfSlot={roomSession.selfSlot}
          gameOver={raceState.gameOver}
          error={roomSession.error}
          busy={roomSession.busy}
          nowMs={nowMs}
          onRequestRematch={requestRematch}
          onLeaveRoom={leaveRoom}
        />
      )}

      {round.mode === 'countdown' && <SoloCountdownScreen value={round.countdown} />}

      {round.mode === 'game' && (
        <SoloGameScreen
          round={round}
          best={best}
          progress={progress}
          targetStyle={targetStyle}
          arenaRef={arenaRef}
          onTargetDown={handleTargetDown}
          onLeave={goHome}
        />
      )}

      {round.mode === 'gameover' && (
        <SoloGameOverScreen
          round={round}
          average={average}
          best={best}
          onRetry={beginCountdown}
          onHome={goHome}
        />
      )}

      {round.mode === 'results' && (
        <SoloResultsScreen
          average={average}
          best={best}
          resultRating={resultRating}
          onPlayAgain={beginCountdown}
          onHome={goHome}
        />
      )}

      <div id="toast" className={round.copied ? 'show' : ''}>
        Copied!
      </div>
    </main>
  );
}
