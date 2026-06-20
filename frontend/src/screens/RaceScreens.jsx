import { popupStyle } from '../lib/arena.js';
import { nameForSlot } from '../lib/format.js';

export function MultiplayerCountdownScreen({ value }) {
  return (
    <section id="online-countdown" className="screen">
      <div className="countdown-value online" key={value || '3'}>
        {value || '3'}
      </div>
      <p className="sub">Synchronized by the Aim Duel server.</p>
    </section>
  );
}

export function RaceGameScreen({
  room,
  selfSlot,
  raceState,
  raceTargetStyle,
  raceArenaRef,
  nowMs,
  onTargetPointerDown,
  onLeave
}) {
  const racePlayerOne = room.players?.[0] || null;
  const racePlayerTwo = room.players?.[1] || null;
  const disconnectGrace = room.disconnectGrace || null;
  const graceRemainingSeconds = disconnectGrace
    ? Math.max(0, Math.ceil(Math.max(0, disconnectGrace.expiresAt - nowMs) / 1000))
    : null;
  const graceName = disconnectGrace
    ? nameForSlot(disconnectGrace.nickname, disconnectGrace.slot)
    : null;

  return (
    <section id="race-game" className="screen">
      <div className="race-hud">
        <div className={`race-player ${selfSlot === 1 ? 'self' : ''}`}>
          <span>{racePlayerOne?.nickname || 'Player 1'}</span>
          <strong key={racePlayerOne?.score || 0} className="score-bump">
            {racePlayerOne?.score || 0}
          </strong>
        </div>
        <div className="race-room">
          <span>First to {raceState.winScore}</span>
          <strong>{room.code}</strong>
        </div>
        <div className={`race-player ${selfSlot === 2 ? 'self' : ''}`}>
          <span>{racePlayerTwo?.nickname || 'Player 2'}</span>
          <strong key={racePlayerTwo?.score || 0} className="score-bump">
            {racePlayerTwo?.score || 0}
          </strong>
        </div>
        <button
          className="hud-leave"
          type="button"
          onClick={onLeave}
          aria-label="Leave match"
          title="Leave match"
        >
          ✕
        </button>
      </div>

      {disconnectGrace && (
        <div className="match-pause" role="status">
          {graceName} disconnected · holding match {graceRemainingSeconds}s
        </div>
      )}
      <div id="race-arena" ref={raceArenaRef}>
        {raceState.target && (
          <button
            className={`race-target ${raceState.target.type}${
              raceState.clickedTargetId === raceState.target.targetId ? ' clicked' : ''
            }`}
            type="button"
            aria-label={raceState.target.type === 'bomb' ? 'Red bomb' : 'Cyan target'}
            onPointerDown={onTargetPointerDown}
            style={raceTargetStyle}
          />
        )}
        <div
          className={`race-feedback ${raceState.feedbackTone}`}
          key={raceState.feedback || 'ready'}
        >
          {raceState.feedback || 'Get ready'}
        </div>
        {raceState.popup && (
          <div
            key={raceState.popup.id}
            className={`race-popup ${raceState.popup.tone}`}
            style={popupStyle(raceState.popup)}
          >
            {raceState.popup.lines.map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
