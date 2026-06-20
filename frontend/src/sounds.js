// Tiny synthesized sound engine. No audio assets — every effect is a short
// WebAudio oscillator envelope, so the bundle stays tiny and sounds work
// offline. Playback is skipped while muted. Lifted from the original and
// trimmed to the effects Solo Practice uses; more get added when multiplayer
// lands.

const muteStorageKey = 'aim-duel-muted';

let audioCtx = null;
let muted = readStoredMute();

function readStoredMute() {
  try {
    return window.localStorage.getItem(muteStorageKey) === '1';
  } catch {
    return false;
  }
}

function context() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Browsers only allow audio after a user gesture; warm the context up on the
// first interaction so the countdown can play the moment a run starts.
function unlockOnFirstGesture() {
  const unlock = () => {
    context();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

unlockOnFirstGesture();

function tone({ freq = 440, endFreq = null, duration = 0.12, type = 'sine', volume = 0.05, delay = 0 }) {
  if (muted) return;
  const ctx = context();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const startAt = ctx.currentTime + delay;
    const stopAt = startAt + duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, stopAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(stopAt + 0.05);
  } catch {
    // Audio failures must never break gameplay.
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  try {
    window.localStorage.setItem(muteStorageKey, muted ? '1' : '0');
  } catch {
    // Persistence is best-effort.
  }
}

export const sounds = {
  click() {
    tone({ freq: 820, duration: 0.05, type: 'triangle', volume: 0.03 });
  },
  countdownTick() {
    tone({ freq: 620, duration: 0.09, type: 'triangle', volume: 0.05 });
  },
  go() {
    tone({ freq: 700, endFreq: 1080, duration: 0.2, type: 'triangle', volume: 0.07 });
  },
  hit() {
    tone({ freq: 1000, duration: 0.07, type: 'sine', volume: 0.05 });
  },
  miss() {
    tone({ freq: 440, endFreq: 360, duration: 0.07, type: 'sine', volume: 0.02 });
  },
  bomb() {
    tone({ freq: 170, endFreq: 50, duration: 0.4, type: 'sawtooth', volume: 0.09 });
  },
  finish(delay = 0) {
    [660, 880, 1100, 1320].forEach((freq, index) => {
      tone({ freq, duration: 0.14, type: 'triangle', volume: 0.06, delay: delay + index * 0.09 });
    });
  }
};
