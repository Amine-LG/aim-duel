// Display formatting: milliseconds, names, claim feedback, result text, and
// the recovery panel copy. Pure functions over server payloads — no state.

import { DEFAULT_PLAYER_ONE, DEFAULT_PLAYER_TWO } from './constants.js';

export function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatMs(value) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${Math.round(value)}ms`;
}

export function formatSignedMs(value) {
  if (!Number.isFinite(value)) return '0ms';
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}ms`;
  if (rounded < 0) return `${rounded}ms`;
  return '0ms';
}

export function hasTimingAverage(player) {
  return Number(player?.deltaSamples) > 0 && Number.isFinite(Number(player?.averageDeltaMs));
}

export function formatAverageDelta(player) {
  if (!hasTimingAverage(player)) return null;
  const value = Number(player.averageDeltaMs);
  return value === 0 ? 'Even' : formatSignedMs(value);
}

export function winnerReactionMsFromPayload(payload) {
  const winnerReactionMs = Number(
    payload.winnerReactionMs ?? payload.reactionMs ?? payload.winnerClaim?.reactionMs
  );
  return Number.isFinite(winnerReactionMs) ? Math.round(winnerReactionMs) : null;
}

export function nameForSlot(name, slot) {
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (slot === 1) return DEFAULT_PLAYER_ONE;
  if (slot === 2) return DEFAULT_PLAYER_TWO;
  return 'Player';
}

export function claimPopupLines(payload, selfSlot) {
  const youWon = payload.winnerSlot === selfSlot;
  const winnerMs = winnerReactionMsFromPayload(payload);
  const opponentName = nameForSlot(
    youWon ? payload.loserName : payload.winnerName,
    youWon ? payload.loserSlot : payload.winnerSlot
  );
  const headline = youWon ? '+1' : `${opponentName} +1`;
  const subline = winnerMs === null ? null : `${winnerMs}ms`;
  return subline ? [headline, subline] : [headline];
}

export function claimFeedbackText(payload, selfSlot) {
  const youWon = payload.winnerSlot === selfSlot;
  const winnerMs = winnerReactionMsFromPayload(payload);
  const opponentName = nameForSlot(
    youWon ? payload.loserName : payload.winnerName,
    youWon ? payload.loserSlot : payload.winnerSlot
  );
  const prefix = youWon ? '+1 · You' : `${opponentName} +1`;
  return winnerMs === null ? prefix : `${prefix} · ${winnerMs}ms`;
}

export function describeGameOverReason(gameOver, selfSlot, isDraw) {
  if (gameOver?.reason === 'inactivity') return 'Match ended — no activity';
  if (isDraw) return 'Draw';
  const youLost = gameOver?.loserSlot === selfSlot;
  const opponentName = nameForSlot(
    youLost ? gameOver?.winnerName : gameOver?.loserName,
    youLost ? gameOver?.winnerSlot : gameOver?.loserSlot
  );
  if (gameOver?.reason === 'bomb') {
    return youLost ? 'Bomb! You lose' : `${opponentName} hit the bomb — you win`;
  }
  if (gameOver?.reason === 'disconnect') {
    return youLost ? 'You disconnected' : `${opponentName} disconnected`;
  }
  return 'Reached 10';
}

export function recoveryView(realtimeState, sessionError, hasRoom) {
  if (realtimeState !== 'connected') {
    return {
      title: 'Reconnecting',
      message: 'Reconnecting to the server...',
      isRoomUnavailable: false
    };
  }
  if (!hasRoom && sessionError) {
    return {
      title: 'Room unavailable',
      message: sessionError,
      isRoomUnavailable: true
    };
  }
  return {
    title: 'Restoring room',
    message: 'Restoring room state...',
    isRoomUnavailable: false
  };
}

// Solo scores mix reaction time with aiming and cursor travel, so the bands
// are deliberately generous — 350-500ms is a normal, respectable human score.
export function rating(ms) {
  if (ms < 250) {
    return { label: 'Excellent', note: 'Lightning hands. Genuinely scary.', bg: '#00e5ff', fg: '#000' };
  }
  if (ms < 350) {
    return { label: 'Great', note: 'Sharp aim and quick hands.', bg: '#00c853', fg: '#000' };
  }
  if (ms < 450) {
    return { label: 'Good', note: 'Quick and clean. Keep it rolling.', bg: '#304ffe', fg: '#fff' };
  }
  if (ms < 550) {
    return { label: 'Solid', note: 'Nice pace — every run sharpens you.', bg: '#ffd740', fg: '#000' };
  }
  return { label: 'Warming up', note: 'Aim takes reps. Another round?', bg: '#37474f', fg: '#fff' };
}
