// State factories for the App component. `round.mode` doubles as the screen
// router (home/solo modes and multiplayer screens share it), so every screen
// change goes through freshRound to guarantee leftover per-round fields reset.

import { COUNTDOWN_START } from './constants.js';
import { normalizeNicknameInput } from './routing.js';

const initialRound = {
  mode: 'home',
  hitCount: 0,
  missCount: 0,
  endReason: null,
  times: [],
  target: null,
  labels: [],
  countdown: COUNTDOWN_START,
  ping: null,
  copied: false
};

export function freshRound(mode = 'home') {
  return {
    ...initialRound,
    mode,
    times: [],
    labels: []
  };
}

export function emptyRoomSession() {
  return {
    room: null,
    shareUrl: '',
    error: '',
    busy: false,
    selfSlot: null,
    countdownValue: null
  };
}

export function emptyRaceState() {
  return {
    target: null,
    targetRenderedAt: 0,
    clickedTargetId: null,
    feedback: '',
    feedbackTone: '',
    popup: null,
    gameOver: null,
    winScore: 10
  };
}

export function gameOverFromRoom(room) {
  if (room?.status !== 'finished' || !room.game) return null;

  return {
    room,
    matchId: room.game.matchId,
    winnerSlot: room.game.winnerSlot,
    winnerName: room.game.winnerName,
    loserSlot: room.game.loserSlot,
    loserName: room.game.loserName,
    reason: room.game.reason,
    isDraw: room.game.isDraw,
    scores: room.game.scores || room.players
  };
}

export function inviteUrlWithNickname(baseUrl, nickname) {
  const suggestedNickname = normalizeNicknameInput(nickname);
  if (!suggestedNickname) return baseUrl;

  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('nickname', suggestedNickname);
  return url.toString();
}
