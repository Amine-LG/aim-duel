// Shown on game_over — matches the original's results layout: small logo, big
// result icon + heading, the X-Y scoreline, a "Winner: …" line, and a row per
// player with the winner/loser/self highlighting. Offers rematch or leaving.

export default function RaceResultsScreen({ selfSlot, result, onPlayAgain, onLeave }) {
  const won = result.winnerSlot === selfSlot;
  const tone = won ? 'win' : 'loss';
  const scores = result.scores || [];

  const me = scores.find((s) => s.slot === selfSlot);
  const opponent = scores.find((s) => s.slot !== selfSlot);
  const scoreline = me && opponent ? `${me.score}-${opponent.score}` : '--';
  const winnerName = scores.find((s) => s.slot === result.winnerSlot)?.nickname || 'Winner';
  // Self first, matching the original.
  const ordered = me ? [me, ...scores.filter((s) => s.slot !== selfSlot)] : scores;

  const rowClass = (player) => {
    const classes = ['final-score-row'];
    if (player.slot === selfSlot) classes.push('self');
    classes.push(player.slot === result.winnerSlot ? 'winner' : 'loser');
    return classes.join(' ');
  };

  return (
    <section className={`screen race-results ${tone}`}>
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <div className="result-icon" aria-hidden="true">
        {won ? '🏆' : '💥'}
      </div>
      <h1>{won ? 'You Win' : 'You Lose'}</h1>
      <div className="final-scoreline">{scoreline}</div>
      <p className="result-winner">Winner: {winnerName}</p>

      <div className="final-score">
        {ordered.map((player) => (
          <div key={player.slot} className={rowClass(player)}>
            <span className="final-player-name">
              {player.nickname}
              {player.slot === selfSlot ? ' (you)' : ''}
            </span>
            <div className="final-score-values">
              <strong>{player.score}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn" type="button" onClick={onPlayAgain}>
          Rematch
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLeave}>
          Back Home
        </button>
      </div>
    </section>
  );
}
