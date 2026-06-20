import {
  describeGameOverReason,
  formatAverageDelta,
  hasTimingAverage,
  nameForSlot
} from '../lib/format.js';

function speedDeltaClass(player) {
  if (!hasTimingAverage(player)) return 'speed-delta neutral';
  const value = Number(player.averageDeltaMs);
  if (value > 0) return 'speed-delta positive';
  if (value < 0) return 'speed-delta negative';
  return 'speed-delta neutral';
}

export default function RaceResultsScreen({
  room,
  selfSlot,
  gameOver,
  error,
  busy,
  nowMs,
  onRequestRematch,
  onLeaveRoom
}) {
  const players = room.players || [];
  const currentPlayer = players.find((player) => player.slot === selfSlot) || null;
  const opponentPlayer = players.find((player) => player.slot !== selfSlot) || null;
  const opponentName = nameForSlot(opponentPlayer?.nickname, opponentPlayer?.slot);
  const connectedPlayers = players.filter((player) => player.connected);

  const finalScores = gameOver?.scores || players;
  const selfFinalScore =
    finalScores.find((player) => player.slot === selfSlot) || finalScores[0] || null;
  const opponentFinalScore =
    finalScores.find((player) => player.slot !== selfFinalScore?.slot) || null;
  const orderedFinalScores = selfFinalScore
    ? [selfFinalScore, ...finalScores.filter((player) => player.slot !== selfFinalScore.slot)]
    : finalScores;
  const finalScoreText =
    selfFinalScore && opponentFinalScore
      ? `${selfFinalScore.score}-${opponentFinalScore.score}`
      : '--';

  const isDraw =
    Boolean(gameOver?.isDraw) ||
    (gameOver &&
      !gameOver.winnerSlot &&
      finalScores.length >= 2 &&
      finalScores[0].score === finalScores[1].score);
  const gameOverReason = describeGameOverReason(gameOver, selfSlot, isDraw);
  const won = !isDraw && gameOver?.winnerSlot === selfSlot;
  const resultTone = isDraw ? 'draw' : won ? 'win' : 'loss';
  const resultHeading = isDraw ? 'Draw' : won ? 'You Win' : 'You Lose';
  const resultIcon = isDraw ? 'VS' : won ? '🏆' : '💥';
  const winnerLabel =
    gameOver?.reason === 'inactivity'
      ? 'No winner'
      : isDraw
        ? 'Winner: Draw'
        : `Winner: ${gameOver?.winnerName || 'Winner'}`;

  const rematchRemainingMs = room.rematch ? Math.max(0, room.rematch.expiresAt - nowMs) : null;
  const rematchRemainingSeconds =
    rematchRemainingMs === null ? null : Math.max(0, Math.ceil(rematchRemainingMs / 1000));
  const rematchPromptActive = rematchRemainingMs !== null && rematchRemainingMs > 0;
  const canRequestRematch =
    room.status === 'finished' &&
    connectedPlayers.length === 2 &&
    currentPlayer?.connected &&
    !currentPlayer.rematchRequested &&
    !busy &&
    (!room.rematch || rematchPromptActive);
  const rematchWaiting =
    room.status === 'finished' && Boolean(currentPlayer?.rematchRequested) && rematchPromptActive;
  const opponentWantsRematch =
    room.status === 'finished' &&
    Boolean(opponentPlayer?.rematchRequested) &&
    !currentPlayer?.rematchRequested &&
    rematchPromptActive;
  const rematchUnavailable = room.status === 'finished' && connectedPlayers.length < 2;
  const rematchButtonText = opponentWantsRematch
    ? 'Accept Rematch'
    : rematchWaiting
      ? 'Waiting...'
      : 'Rematch';

  const resultPlayerClass = (player) => {
    const classes = ['final-score-row'];
    if (player.slot === selfSlot) classes.push('self');
    if (!isDraw && player.slot === gameOver?.winnerSlot) classes.push('winner');
    if (!isDraw && player.slot === gameOver?.loserSlot) classes.push('loser');
    return classes.join(' ');
  };

  return (
    <section id="race-results" className={`screen ${resultTone}`}>
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <div className="result-icon" aria-hidden="true">
        {resultIcon}
      </div>
      <h1>{resultHeading}</h1>
      <div className="final-scoreline">{finalScoreText}</div>
      <p className="result-winner">{winnerLabel}</p>
      <p className="sub">{gameOverReason}</p>
      <div className="final-score">
        {orderedFinalScores.map((player) => (
          <div key={player.slot} className={resultPlayerClass(player)}>
            <span className="final-player-name">{player.nickname}</span>
            <div className="final-score-values">
              <strong>{player.score}</strong>
              {hasTimingAverage(player) ? (
                <em className={speedDeltaClass(player)}>
                  {formatAverageDelta(player)}
                  <small>vs avg</small>
                </em>
              ) : (
                <em className="speed-delta neutral no-average">No timing avg</em>
              )}
            </div>
          </div>
        ))}
      </div>
      {opponentWantsRematch && (
        <p className="rematch-note attention">
          {opponentName} wants a rematch — {rematchRemainingSeconds}s
        </p>
      )}
      {rematchWaiting && (
        <p className="rematch-note">
          Waiting for {opponentName} — {rematchRemainingSeconds}s
        </p>
      )}
      {rematchUnavailable && (
        <p className="lobby-alert">{opponentName} left. Rematch is unavailable.</p>
      )}
      {error && <div className="room-error">{error}</div>}
      <div className="btn-row">
        <button className="btn" type="button" onClick={onRequestRematch} disabled={!canRequestRematch}>
          <span className="btn-icon" aria-hidden="true">↻</span>
          {rematchButtonText}
        </button>
        <button className="btn btn-exit" type="button" onClick={onLeaveRoom}>
          <span className="btn-icon" aria-hidden="true">🚪</span>
          Back Home
        </button>
      </div>
    </section>
  );
}
