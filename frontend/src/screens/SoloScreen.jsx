// Solo Practice — a small, fully client-side aim game. No backend, no network.
// A run is TOTAL cyan targets: click each to score (and see your reaction time
// float up); let one expire or click empty arena and it's a miss that breaks
// your streak. After a few hits, red bombs start mixing in — click one and the
// run ends (GOTCHA). Finish the run to see your average and best reaction time.
// A 3·2·1 countdown comes in a later step.

import { useEffect, useRef, useState } from 'react';

const TOTAL = 20; // cyan targets per run
const CYAN_TTL = 1500; // ms a cyan target lives before it expires (a miss)
const BOMB_TTL = 1000; // bombs are quicker — but you want to ignore them anyway
const BOMB_AFTER = 3; // bombs can appear once you've hit this many
const BOMB_CHANCE = 0.28; // ...and then this often

// A target is a random spot plus a type. Bombs only start mixing in after a few
// hits, so the opening is a gentle warm-up (matches the original's pacing).
function makeTarget(hits) {
  const isBomb = hits >= BOMB_AFTER && Math.random() < BOMB_CHANCE;
  return {
    x: 10 + Math.random() * 80, // 10%..90%
    y: 14 + Math.random() * 66, // 14%..80%
    type: isBomb ? 'bomb' : 'cyan'
  };
}

export default function SoloScreen({ onBack }) {
  const [phase, setPhase] = useState('playing'); // 'playing' | 'results' | 'gameover'
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(null); // fastest reaction this run (ms)
  const [totalMs, setTotalMs] = useState(0); // sum of hit reaction times, for the average
  const [target, setTarget] = useState(() => makeTarget(0));
  // Bumping this key remounts the target so its pop-in animation replays on
  // every respawn.
  const [spawn, setSpawn] = useState(0);
  const [floats, setFloats] = useState([]);
  const spawnedAt = useRef(performance.now());
  const floatId = useRef(0);

  // Each target gets a lifetime. A cyan target that expires is a miss; a bomb
  // that expires was correctly avoided (no penalty). Either way, respawn. The
  // effect re-runs whenever the target changes (a respawn) or the run ends.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    spawnedAt.current = performance.now();
    const ttl = target.type === 'bomb' ? BOMB_TTL : CYAN_TTL;
    const timer = setTimeout(() => {
      if (target.type === 'cyan') {
        setMisses((n) => n + 1);
        setStreak(0);
      }
      setTarget(makeTarget(hits));
      setSpawn((n) => n + 1);
    }, ttl);
    return () => clearTimeout(timer);
  }, [phase, hits, target]);

  function addFloat(x, y, text, color) {
    const id = (floatId.current += 1);
    setFloats((list) => [...list, { id, x, y, text, color }]);
  }

  function hitTarget(event) {
    event.stopPropagation(); // a hit must not also register as an arena miss

    if (target.type === 'bomb') {
      setPhase('gameover'); // clicked a bomb — run over
      return;
    }

    const reactionMs = Math.round(performance.now() - spawnedAt.current);
    addFloat(target.x, target.y, `${reactionMs}ms`, reactionMs < 250 ? '#00e676' : 'var(--dot)');
    setBest((b) => (b == null ? reactionMs : Math.min(b, reactionMs)));
    setTotalMs((t) => t + reactionMs);
    setStreak((s) => s + 1);

    const nextHits = hits + 1;
    setHits(nextHits);
    if (nextHits >= TOTAL) {
      setPhase('results'); // run complete
    } else {
      setTarget(makeTarget(nextHits));
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
    setTarget(makeTarget(0));
    setSpawn((n) => n + 1);
    setPhase('playing');
  }

  if (phase === 'gameover') {
    return (
      <section className="screen solo-gameover">
        <div className="go-icon" aria-hidden="true">
          💥
        </div>
        <h2>GOTCHA</h2>
        <p className="go-sub">You clicked the red bomb</p>
        <div className="result-stats">
          <div className="result-stat">
            <span>Dots hit</span>
            <strong>{hits}</strong>
          </div>
          <div className="result-stat">
            <span>Best</span>
            <strong>{best == null ? '--' : `${best}ms`}</strong>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn" type="button" onClick={playAgain}>
            Try Again
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Home
          </button>
        </div>
      </section>
    );
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
          className={`solo-target ${target.type}`}
          type="button"
          aria-label={target.type === 'bomb' ? 'Red bomb' : 'Cyan target'}
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
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
