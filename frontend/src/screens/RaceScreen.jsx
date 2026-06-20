// The multiplayer race — matches the original's layout. Server-driven: the HUD
// is a 3-column grid (Player 1 score · "First to N" + room code · Player 2
// score), and the arena holds the one shared target the server spawned. Clicking
// it emits target_click; the server decides who scored.

export default function RaceScreen({
  room,
  selfSlot,
  status,
  countdownValue,
  scores,
  target,
  winScore,
  onTargetClick,
  onLeave
}) {
  if (status === 'countdown') {
    return (
      <section className="screen online-countdown">
        <div className="countdown-value online" key={countdownValue}>
          {countdownValue}
        </div>
        <p className="sub">Synchronized by the Aim Duel server.</p>
      </section>
    );
  }

  const scoreFor = (slot) => scores.find((s) => s.slot === slot);
  const p1 = scoreFor(1);
  const p2 = scoreFor(2);

  return (
    <section className="screen solo-game">
      <div className="race-hud">
        <div className={`race-player ${selfSlot === 1 ? 'self' : ''}`}>
          <span>{p1?.nickname || 'Player 1'}</span>
          <strong key={p1?.score || 0} className="score-bump">
            {p1?.score || 0}
          </strong>
        </div>
        <div className="race-room">
          <span>First to {winScore}</span>
          <strong>{room.code}</strong>
        </div>
        <div className={`race-player ${selfSlot === 2 ? 'self' : ''}`}>
          <span>{p2?.nickname || 'Player 2'}</span>
          <strong key={p2?.score || 0} className="score-bump">
            {p2?.score || 0}
          </strong>
        </div>
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
        {target ? (
          <button
            key={target.id}
            className="solo-target cyan"
            type="button"
            aria-label="Cyan target"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
            onPointerDown={() => onTargetClick(target)}
          />
        ) : (
          <div className="race-feedback">Get ready…</div>
        )}
      </div>
    </section>
  );
}
