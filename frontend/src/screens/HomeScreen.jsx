export default function HomeScreen({
  returnRoomCode,
  hasRoomSession,
  openRooms,
  openRoomsExpanded,
  onToggleOpenRooms,
  onReturnToRoom,
  onOpenSolo,
  onOpenCreateRoom,
  onJoinRoom
}) {
  return (
    <section id="start" className="screen">
      <img className="home-logo" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Aim Duel</h1>
      <p className="sub">Train your aim today. Duel your friends next.</p>
      {returnRoomCode && !hasRoomSession && (
        <button className="btn return-room" type="button" onClick={onReturnToRoom}>
          <span className="btn-icon" aria-hidden="true">↩</span>
          Return to game · {returnRoomCode}
        </button>
      )}
      <div className="btn-row stack">
        <button className="btn" type="button" onClick={onOpenCreateRoom}>
          <span className="btn-icon" aria-hidden="true">⚔️</span>
          Create Room
        </button>
        <button className="btn btn-solo" type="button" onClick={onOpenSolo}>
          <span className="btn-icon" aria-hidden="true">🎯</span>
          Solo Practice
        </button>
      </div>
      <div className="home-steps" aria-label="Game rules">
        <span className="rule cyan">Click cyan targets first</span>
        <span className="rule bomb">Avoid red bombs</span>
        <span className="rule win">First to 10 wins</span>
      </div>
      <div className="open-rooms" aria-label="Open rooms">
        <button
          className={`open-rooms-toggle${openRoomsExpanded ? ' expanded' : ''}`}
          type="button"
          onClick={onToggleOpenRooms}
          aria-expanded={openRoomsExpanded}
        >
          <span>Open Rooms ({openRooms.length})</span>
          <span className="open-rooms-chevron" aria-hidden="true">
            {openRoomsExpanded ? '▴' : '▾'}
          </span>
        </button>
        {openRoomsExpanded &&
          (openRooms.length ? (
            <ul>
              {openRooms.map((openRoom) => (
                <li key={openRoom.code}>
                  <span className="open-room-host">{openRoom.hostName}</span>
                  <button
                    className="open-room-join"
                    type="button"
                    onClick={() => onJoinRoom(openRoom.code)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="open-rooms-empty">No open rooms right now — create one!</p>
          ))}
      </div>
    </section>
  );
}
