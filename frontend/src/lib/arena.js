// Arena geometry: target sizing, safe-zone bounds, and popup placement.
// Solo and multiplayer both compute through these helpers so targets behave
// identically across modes and across window shapes.

import {
  ARENA_BOTTOM_INSET,
  ARENA_INSET,
  BOMB_CHANCE,
  BOMB_START,
  TARGET_MAX_ARENA_FRACTION,
  TARGET_SIZE_MAX,
  TARGET_SIZE_MIN,
  TARGET_SIZE_RATIO
} from './constants.js';

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random()}`;
}

export function sharedTargetSizePx(arenaEl, sizeRatio = TARGET_SIZE_RATIO) {
  const arena = arenaEl?.getBoundingClientRect?.();
  const fallbackMin = Math.min(window.innerWidth, window.innerHeight);
  const arenaWidth = arena?.width > 0 ? arena.width : fallbackMin;
  const arenaHeight = arena?.height > 0 ? arena.height : fallbackMin;
  const arenaMin = Math.min(arenaWidth, arenaHeight);
  const desired = clamp(arenaMin * sizeRatio, TARGET_SIZE_MIN, TARGET_SIZE_MAX);
  const fairCap = Math.max(24, arenaMin * TARGET_MAX_ARENA_FRACTION);
  return Math.round(Math.min(desired, fairCap));
}

export function arenaTargetMetrics(arenaEl) {
  const arena = arenaEl.getBoundingClientRect();
  const desiredSize = sharedTargetSizePx(arenaEl);
  const size = Math.max(
    12,
    Math.min(desiredSize, arena.width || desiredSize, arena.height || desiredSize)
  );

  // Top-left coordinate bounds for the target, with safe insets so the target
  // stays clear of screen edges and the fixed bottom widgets/feedback pill.
  // On short windows the bottom inset scales down so a playable band remains.
  const bottomInset = Math.min(ARENA_BOTTOM_INSET, Math.max(32, arena.height * 0.18));
  const minLeft = ARENA_INSET;
  const minTop = ARENA_INSET;
  const maxLeft = Math.max(minLeft, arena.width - size - ARENA_INSET);
  const maxTop = Math.max(minTop, arena.height - size - bottomInset);

  return { size, minLeft, maxLeft, minTop, maxTop };
}

export function raceTargetStyleForArena(target, arenaEl) {
  if (!target) return undefined;

  const { size, minLeft, maxLeft, minTop, maxTop } = arenaTargetMetrics(arenaEl);
  const arena = arenaEl.getBoundingClientRect();
  const radius = size / 2;
  const left = clamp((target.x ?? 0.5) * arena.width, minLeft + radius, maxLeft + radius);
  const top = clamp((target.y ?? 0.5) * arena.height, minTop + radius, maxTop + radius);

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${size}px`,
    height: `${size}px`
  };
}

export function fitToArena(target, arenaEl) {
  const { size, minLeft, maxLeft, minTop, maxTop } = arenaTargetMetrics(arenaEl);

  return {
    ...target,
    size,
    left: clamp(target.left, minLeft, maxLeft),
    top: clamp(target.top, minTop, maxTop)
  };
}

export function makeTarget(arenaEl, hitCount) {
  const { size, minLeft, maxLeft, minTop, maxTop } = arenaTargetMetrics(arenaEl);
  const isBomb = hitCount >= BOMB_START && Math.random() < BOMB_CHANCE;

  return {
    id: makeId(),
    type: isBomb ? 'bomb' : 'normal',
    size,
    left: minLeft + Math.random() * (maxLeft - minLeft),
    top: minTop + Math.random() * (maxTop - minTop),
    startedAt: performance.now()
  };
}

export function popupForTarget(target, lines, tone = '', arenaEl = null) {
  const arena = arenaEl?.getBoundingClientRect?.();
  const xRatio = target?.x ?? 0.5;
  const yRatio = target?.y ?? 0.5;

  if (arena?.width > 0 && arena?.height > 0) {
    const size = sharedTargetSizePx(arenaEl, target?.size || TARGET_SIZE_RATIO);
    return {
      id: makeId(),
      lines: Array.isArray(lines) ? lines : [lines],
      tone,
      left: clamp(xRatio * arena.width, 68, Math.max(68, arena.width - 68)),
      top: clamp(yRatio * arena.height - size * 0.75, 34, Math.max(34, arena.height - 34))
    };
  }

  const x = clamp(xRatio * 100, 14, 86);
  const y = clamp(yRatio * 100 - 8, 14, 82);

  return {
    id: makeId(),
    lines: Array.isArray(lines) ? lines : [lines],
    tone,
    x,
    y
  };
}

export function popupStyle(popup) {
  if (Number.isFinite(popup?.left) && Number.isFinite(popup?.top)) {
    return {
      left: `${popup.left}px`,
      top: `${popup.top}px`
    };
  }

  return Number.isFinite(popup?.x) && Number.isFinite(popup?.y)
    ? {
        left: `${popup.x}%`,
        top: `${popup.y}%`
      }
    : undefined;
}
