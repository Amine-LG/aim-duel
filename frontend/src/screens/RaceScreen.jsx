// The multiplayer race. Purely presentational and server-driven: it shows the
// countdown, then both scores and the one shared target the server spawned.
// Clicking the target emits target_click; the server decides who scored.

export default function RaceScreen({
  selfSlot,
  status,
  countdownValue,
  scores,
  target,
  onTargetClick,
  onLeave
}) {
  if (status === 'countdown') {
    return (
      <section className="screen solo-countdown">
        <div className="countdown-value" key={countdownValue}>
          {countdownValue}
        </div>
      </section>
    );
  }

  return (
    <section className="screen solo-game">
      <div className="race-hud">
        {[1, 2].map((slot) => {
          const entry = scores.find((s) => s.slot === slot);
          return (
            <div key={slot} className={`race-score ${slot === selfSlot ? 'self' : ''}`}>
              <span>
                {entry?.nickname || `Player ${slot}`}
                {slot === selfSlot ? ' (you)' : ''}
              </span>
              <strong>{entry?.score ?? 0}</strong>
            </div>
          );
        })}
        <button
          className="solo-leave"
          type="button"
          onClick={onLeave}
          aria-label="Leave match"
          title="Leave match"
        >
          ✕
        </button>
      </div>

      <div className="solo-arena">
        {target && (
          <button
            key={target.id}
            className="solo-target cyan"
            type="button"
            aria-label="Cyan target"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            onPointerDown={() => onTargetClick(target)}
          />
        )}
      </div>
    </section>
  );
}
