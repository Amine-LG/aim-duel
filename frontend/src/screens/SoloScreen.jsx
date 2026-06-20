// Solo Practice — a small, fully client-side aim prototype. No backend, no
// network, no timers yet: one cyan target spawns at a random spot; clicking it
// scores a point and respawns it, clicking empty arena counts as a miss and
// breaks the streak. Bombs, per-target time limits, a countdown, and a results
// screen come in later steps — this is the minimal playable core.

import { useState } from 'react';

// Keep the target within a safe band of the arena (percentages), clear of the
// HUD above and the edges. It's centered on the point via translate(-50%, -50%).
function randomSpot() {
  return {
    x: 10 + Math.random() * 80, // 10%..90%
    y: 14 + Math.random() * 66 // 14%..80%
  };
}

export default function SoloScreen({ onBack }) {
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [spot, setSpot] = useState(randomSpot);
  // Bumping this key remounts the target so its pop-in animation replays on
  // every respawn — cheap way to get the "snap" without manual animation state.
  const [spawn, setSpawn] = useState(0);

  function hitTarget(event) {
    event.stopPropagation(); // a hit must not also register as an arena miss
    setScore((n) => n + 1);
    setStreak((n) => n + 1);
    setSpot(randomSpot());
    setSpawn((n) => n + 1);
  }

  function missArena() {
    setMisses((n) => n + 1);
    setStreak(0);
  }

  return (
    <section className="screen solo-game">
      <div className="solo-hud">
        <div className="solo-stats">
          <div className="solo-stat">
            <div className="hl">Score</div>
            <div className="hv">{score}</div>
          </div>
          <div className="solo-stat">
            <div className="hl">Misses</div>
            <div className="hv">{misses}</div>
          </div>
          <div className="solo-stat streak">
            <div className="hl">Streak</div>
            <div className="hv">{streak}</div>
          </div>
        </div>
        <button
          className="solo-leave"
          type="button"
          onClick={onBack}
          aria-label="Leave practice"
          title="Leave practice"
        >
          ✕
        </button>
      </div>

      <div className="solo-arena" onPointerDown={missArena}>
        <button
          key={spawn}
          className="solo-target"
          type="button"
          aria-label="Cyan target"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          onPointerDown={hitTarget}
        />
      </div>
    </section>
  );
}
