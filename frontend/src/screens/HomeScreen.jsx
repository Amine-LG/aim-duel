// The landing screen. Presentational only — it just calls the navigation
// callbacks its parent (App) passes in. Solo Practice now opens the solo
// screen; Create Room stays a placeholder until the Socket.IO backend exists.
// Open Rooms, "return to game", and live status are deferred for the same
// reason — they all need the backend, which comes in a later step.

export default function HomeScreen({ onOpenSolo, onOpenCreateRoom }) {
  return (
    <section id="start" className="screen">
      <img className="home-logo" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Aim Duel</h1>
      <p className="sub">Train your aim today. Duel your friends next.</p>

      <div className="btn-row stack">
        <button className="btn btn-ghost" type="button" onClick={onOpenSolo}>
          Solo Practice
        </button>
        <button className="btn" type="button" onClick={onOpenCreateRoom}>
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
