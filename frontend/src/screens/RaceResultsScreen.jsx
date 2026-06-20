// Shown when the server emits game_over. Reports who won and the final score,
// and offers a rematch (return to the lobby to ready up again) or leaving.

export default function RaceResultsScreen({ selfSlot, result, onPlayAgain, onLeave }) {
  const iWon = result.winnerSlot === selfSlot;

  return (
    <section className={`screen solo-results ${iWon ? 'win' : 'loss'}`}>
      <div className="result-icon" aria-hidden="true">
        {iWon ? '🏆' : '💀'}
      </div>
      <h2>{iWon ? 'You win!' : 'You lose'}</h2>

      <div className="result-stats">
        {result.scores.map((entry) => (
          <div key={entry.slot} className="result-stat">
            <span>
              {entry.nickname}
              {entry.slot === selfSlot ? ' (you)' : ''}
            </span>
            <strong>{entry.score}</strong>
          </div>
        ))}
      </div>

      <div className="btn-row stack">
        <button className="btn" type="button" onClick={onPlayAgain}>
          Back to Lobby
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    </section>
  );
}
