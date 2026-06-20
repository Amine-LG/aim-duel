// Fallback panel for every room-mode screen whose data is missing — the app
// must never render a blank screen. Retry means exactly one thing: ask the
// server for the current room state.

export default function RecoveryScreen({
  title,
  message,
  reconnecting,
  code,
  canRetry,
  showCreateRoom,
  onRetry,
  onHome,
  onCreateRoom
}) {
  return (
    <section id="room-recovery" className="screen">
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>{title}</h1>
      {code && <div className="room-code">{code}</div>}
      <p className={`sub${reconnecting ? ' reconnecting' : ''}`}>
        {reconnecting && <span className="dot-pulse" aria-hidden="true" />}
        {message}
      </p>
      <div className="btn-row">
        <button className="btn" type="button" onClick={onRetry} disabled={!canRetry}>
          <span className="btn-icon" aria-hidden="true">↻</span>
          Retry
        </button>
        <button className="btn btn-ghost" type="button" onClick={onHome}>
          <span className="btn-icon" aria-hidden="true">🏠</span>
          Back Home
        </button>
        {showCreateRoom && (
          <button className="btn btn-ghost" type="button" onClick={onCreateRoom}>
            <span className="btn-icon" aria-hidden="true">⚔️</span>
            Create Room
          </button>
        )}
      </div>
    </section>
  );
}
