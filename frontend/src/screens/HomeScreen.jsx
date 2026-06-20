// The landing screen. Presentational only — no game state, no network yet.
// The buttons are placeholders: Solo Practice and Create Room get wired up
// once the game screens (and later the Socket.IO backend) exist. Open Rooms,
// "return to game", and live status are deliberately deferred — they need the
// backend, which comes in a later step.

export default function HomeScreen() {
  return (
    <section id="start" className="screen">
      <img className="home-logo" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Aim Duel</h1>
      <p className="sub">Train your aim today. Duel your friends next.</p>

      <div className="btn-row stack">
        <button className="btn btn-ghost" type="button">
          Solo Practice
        </button>
        <button className="btn" type="button">
          Create Room
        </button>
      </div>

      <div className="home-steps" aria-label="Game rules">
        <span className="rule cyan">Click cyan targets first</span>
        <span className="rule bomb">Avoid red bombs</span>
        <span className="rule win">First to 10 wins</span>
      </div>
    </section>
  );
}
