// The lobby — matches the original: a small logo, the room code (with a Copy
// button), both player slots, and the pulsing Ready button. Everything it
// renders comes from the `room` the parent keeps in sync with room_state.

import { useState } from 'react';

export default function LobbyScreen({ room, selfSlot, onReady, onUnready, onLeave }) {
  const me = room.players.find((player) => player.slot === selfSlot);
  const iAmReady = Boolean(me?.ready);
  const bothPresent = room.players.filter((p) => p.connected).length >= 2;
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. a non-secure context); the code is on
      // screen to read either way.
    }
  };

  return (
    <section className="screen">
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Lobby</h1>

      <div className="room-code-row">
        <div className="room-code" aria-label={`Room code ${room.code}`}>
          {room.code}
        </div>
        <button className="btn btn-ghost btn-small" type="button" onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>

      {!bothPresent && (
        <p className="lobby-wait">Waiting for a second player — share the code.</p>
      )}

      <div className="lobby-slots">
        {[1, 2].map((slot) => {
          const player = room.players.find((p) => p.slot === slot);
          const present = Boolean(player?.connected);
          const ready = Boolean(player?.ready);
          return (
            <div key={slot} className={`player-slot ${present ? (ready ? 'ready' : 'connected') : 'waiting'}`}>
              <div>
                <span className="slot-label">
                  Player {slot}
                  {slot === selfSlot ? ' (you)' : ''}
                </span>
                <strong>{present ? player.nickname : 'Waiting…'}</strong>
              </div>
              <span className="slot-state">{present ? (ready ? 'Ready' : 'Not ready') : 'Open'}</span>
            </div>
          );
        })}
      </div>

      <div className="ready-panel">
        <button
          className={`btn ready-button ${iAmReady ? 'is-ready' : 'needs-ready'}`}
          type="button"
          onClick={iAmReady ? onUnready : onReady}
          aria-pressed={iAmReady}
        >
          {iAmReady ? (
            <>
              Ready ✓<small>tap to unready</small>
            </>
          ) : (
            'Ready Up'
          )}
        </button>
      </div>

      <p className="lobby-note">First to 10 wins.</p>

      <div className="btn-row">
        <button className="btn btn-ghost" type="button" onClick={onLeave}>
          Leave Room
        </button>
      </div>
    </section>
  );
}
