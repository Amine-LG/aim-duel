// The landing screen. Presentational only — it just calls the navigation
// callbacks its parent (App) passes in. Create Room and Join Room now open the
// room form; Solo Practice opens the client-side practice game. Open Rooms,
// "return to game", and live status are deferred to later steps.

export default function HomeScreen({ onOpenCreateRoom, onOpenJoinRoom, onOpenSolo }) {
  return (
    <section id="start" className="screen">
      <img className="home-logo" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Aim Duel</h1>
      <p className="sub">Train your aim today. Duel your friends next.</p>

      <div className="btn-row stack">
        <button className="btn" type="button" onClick={onOpenCreateRoom}>
          Create Room
        </button>
        <button className="btn btn-ghost" type="button" onClick={onOpenJoinRoom}>
          Join Room
        </button>
        <button className="btn btn-ghost" type="button" onClick={onOpenSolo}>
          Solo Practice
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
