// Remember the most recent room so a phone user who lands back on Home (back
// button, reopened browser) gets a "Return to game" shortcut. Entries older
// than the server's 30-minute room TTL are ignored.

import { sanitizeRoomCodeInput } from './routing.js';

const lastRoomStorageKey = 'aim-duel-last-room';
const lastRoomMaxAgeMs = 30 * 60 * 1000;

export function readStoredRoomCode() {
  try {
    const raw = window.localStorage.getItem(lastRoomStorageKey);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (!parsed?.code || Date.now() - (parsed.at || 0) > lastRoomMaxAgeMs) return '';
    return sanitizeRoomCodeInput(String(parsed.code));
  } catch {
    return '';
  }
}

export function storeRoomCode(code) {
  try {
    window.localStorage.setItem(lastRoomStorageKey, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Best-effort only.
  }
}

export function clearStoredRoomCode() {
  try {
    window.localStorage.removeItem(lastRoomStorageKey);
  } catch {
    // Best-effort only.
  }
}
