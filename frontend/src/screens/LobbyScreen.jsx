// The lobby: the room code to share, both player slots, and a Ready toggle.
// Everything it renders comes from the `room` the parent keeps in sync with the
// backend's room_state broadcasts — this screen holds no game state itself.

import { useState } from 'react';

export default function LobbyScreen({ room, selfSlot, onReady, onUnready, onLeave }) {
  const me = room.players.find((player) => player.slot === selfSlot);
  const iAmReady = Boolean(me?.ready);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. a non-secure context); ignore — the code
      // is on screen to read and type either way.
    }
  };

  return (
    <section className="screen">
      <h1>Lobby</h1>

      <div className="room-code-row">
        <span className="slot-label">Room code</span>
        <div className="room-code">{room.code}</div>
        <button className="btn btn-ghost btn-small" type="button" onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>

      <div className="lobby-slots">
        {[1, 2].map((slot) => {
          const player = room.players.find((p) => p.slot === slot);
          const present = Boolean(player?.connected);
          const ready = Boolean(player?.ready);
          return (
            <div key={slot} className={`player-slot ${present && ready ? 'ready' : 'waiting'}`}>
              <div>
                <span className="slot-label">
                  Player {slot}
                  {slot === selfSlot ? ' (you)' : ''}
                </span>
                <strong>{present ? player.nickname : 'Waiting…'}</strong>
              </div>
              <span className="slot-state">{present ? (ready ? 'Ready' : 'Not ready') : '—'}</span>
            </div>
          );
        })}
      </div>

      {room.players.filter((p) => p.connected).length < 2 && (
        <p className="lobby-wait">Share the code — waiting for a second player…</p>
      )}

      <div className="btn-row stack">
        <button
          className={iAmReady ? 'btn btn-ghost' : 'btn'}
          type="button"
          onClick={iAmReady ? onUnready : onReady}
        >
          {iAmReady ? 'Not ready' : 'Ready'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    </section>
  );
}
