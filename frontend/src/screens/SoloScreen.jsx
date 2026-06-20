// Solo Practice — a small, fully client-side aim game. No backend, no network.
// A run is TOTAL targets: each cyan target spawns at a random spot and lives a
// short time; click it to score (and see your reaction time float up), let it
// expire or click empty arena and it's a miss that breaks your streak. Finish
// the run to see your average and best reaction time. Bombs, a 3·2·1 countdown,
// and an early "too many misses" end come in later steps.

import { useEffect, useRef, useState } from 'react';

const TOTAL = 20; // targets per run (matches the original solo run length)
const TARGET_TTL = 1500; // ms a target lives before it expires (a miss)

// Keep the target within a safe band of the arena (percentages), clear of the
// HUD above and the edges. It's centered on the point via translate(-50%, -50%).
function randomSpot() {
  return {
    x: 10 + Math.random() * 80, // 10%..90%
    y: 14 + Math.random() * 66 // 14%..80%
  };
}

export default function SoloScreen({ onBack }) {
  const [phase, setPhase] = useState('playing'); // 'playing' | 'results'
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(null); // fastest reaction this run (ms)
  const [totalMs, setTotalMs] = useState(0); // sum of hit reaction times, for the average
  const [spot, setSpot] = useState(randomSpot);
  // Bumping this key remounts the target so its pop-in animation replays, and
  // (via the effect below) restarts its lifetime timer, on every respawn.
  const [spawn, setSpawn] = useState(0);
  const [floats, setFloats] = useState([]);
  const spawnedAt = useRef(performance.now());
  const floatId = useRef(0);

  // While playing, each new target gets a lifetime. If it expires before a hit,
  // that's a miss and the streak breaks. A hit bumps `spawn`, which re-runs this
  // effect and clears the pending timer; finishing flips `phase` and stops it.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    spawnedAt.current = performance.now();
    const timer = setTimeout(() => {
      setMisses((n) => n + 1);
      setStreak(0);
      setSpot(randomSpot());
      setSpawn((n) => n + 1);
    }, TARGET_TTL);
    return () => clearTimeout(timer);
  }, [spawn, phase]);

  function addFloat(x, y, text, color) {
    const id = (floatId.current += 1);
    setFloats((list) => [...list, { id, x, y, text, color }]);
  }

  function hitTarget(event) {
    event.stopPropagation(); // a hit must not also register as an arena miss
    const reactionMs = Math.round(performance.now() - spawnedAt.current);
    addFloat(spot.x, spot.y, `${reactionMs}ms`, reactionMs < 250 ? '#00e676' : 'var(--dot)');
    setBest((b) => (b == null ? reactionMs : Math.min(b, reactionMs)));
    setTotalMs((t) => t + reactionMs);
    setStreak((s) => s + 1);

    const nextHits = hits + 1;
    setHits(nextHits);
    if (nextHits >= TOTAL) {
      setPhase('results'); // run complete — the effect stops spawning targets
    } else {
      setSpot(randomSpot());
      setSpawn((n) => n + 1);
    }
  }

  function missArena() {
    setMisses((n) => n + 1);
    setStreak(0);
  }

  function playAgain() {
    setHits(0);
    setMisses(0);
    setStreak(0);
    setBest(null);
    setTotalMs(0);
    setFloats([]);
    setSpot(randomSpot());
    setSpawn((n) => n + 1);
    setPhase('playing');
  }

  if (phase === 'results') {
    const average = Math.round(totalMs / TOTAL);
    return (
      <section className="screen solo-results">
        <h2>Finished</h2>
        <div className="big-avg">{average}</div>
        <div className="avg-unit">milliseconds average</div>
        <div className="result-stats">
          <div className="result-stat">
            <span>Average</span>
            <strong>{average}ms</strong>
          </div>
          <div className="result-stat">
            <span>Best</span>
            <strong>{best == null ? '--' : `${best}ms`}</strong>
          </div>
          <div className="result-stat">
            <span>Misses</span>
            <strong>{misses}</strong>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" type="button" onClick={playAgain}>
            Play Again
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Home
          </button>
        </div>
      </section>
    );
  }

  const progress = (hits / TOTAL) * 100;

  return (
    <section className="screen solo-game">
      <div className="solo-hud">
        <div className="solo-stat">
          <div className="hl">Dot</div>
          <div className="hv">
            {hits}/{TOTAL}
          </div>
        </div>
        <div className="solo-progress">
          <div className="solo-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="solo-stat">
          <div className="hl">Best</div>
          <div className="hv">{best == null ? '--' : `${best}ms`}</div>
        </div>
        <div className="solo-stat streak">
          <div className="hl">Streak</div>
          <div className="hv">{streak}</div>
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
        {floats.map((f) => (
          <span
            key={f.id}
            className="float-ms"
            style={{ left: `${f.x}%`, top: `${f.y}%`, color: f.color }}
            onAnimationEnd={() =>
              setFloats((list) => list.filter((item) => item.id !== f.id))
            }
          >
            {f.text}
          </span>
        ))}
      </div>
    </section>
  );
}
