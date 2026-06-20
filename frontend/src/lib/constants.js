// Client-side gameplay constants shared by solo and multiplayer code paths.
// Server-controlled values (multiplayer target size ratio, lifetimes) are
// mirrored in backend/src/config.js — keep them in sync.

export const TOTAL = 20;
export const BOMB_START = 3;
export const BOMB_CHANCE = 0.28;
export const BOMB_TTL = 1000;
export const COUNTDOWN_START = 3;

export const TARGET_SIZE_RATIO = 0.113;
export const TARGET_SIZE_MIN = 61;
export const TARGET_SIZE_MAX = 95;
// Fairness cap: the pixel floor above must not dominate tiny/short windows
// (split screen, resized browser), where it would make targets relatively
// huge and easy. The target never exceeds this fraction of the smaller
// arena dimension.
export const TARGET_MAX_ARENA_FRACTION = 0.18;
// Targets must never sit under the HUD edge, the feedback pill, or the
// fixed corner widgets (sound toggle bottom-left, live status bottom-right).
export const ARENA_INSET = 10;
export const ARENA_BOTTOM_INSET = 76;

export const SOLO_CYAN_TTL = 1500;
export const SOLO_MAX_MISSES = 20;

export const DEFAULT_PLAYER_ONE = 'Player 1';
export const DEFAULT_PLAYER_TWO = 'Player 2';
