// A fixed mute toggle (bottom-left). Reads/writes the persisted mute flag in
// sounds.js, so the choice survives reloads. Clicking unmute plays a tick so
// you immediately hear it's back on.

import { useState } from 'react';
import { isMuted, setMuted, sounds } from './sounds.js';

export default function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sounds.click();
  };

  return (
    <button
      className={`sound-toggle${muted ? ' muted' : ''}`}
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
