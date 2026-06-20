// Create-room or join-room form. One component, two modes: create asks only for
// a nickname; join also asks for the room code. Submitting emits to the backend
// (via the onSubmit the parent passes). The parent flips to the lobby when the
// server answers room_created / room_joined, or surfaces the error shown here.

import { useState } from 'react';

export default function RoomFormScreen({ mode, error, onBack, onSubmit }) {
  const isJoin = mode === 'join';
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');

  const submit = (event) => {
    event.preventDefault();
    onSubmit(isJoin ? { nickname, code } : { nickname });
  };

  return (
    <section className="screen">
      <h1>{isJoin ? 'Join Room' : 'Create Room'}</h1>
      <form className="room-panel" onSubmit={submit}>
        <label className="field">
          <span>Nickname</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            placeholder="Your name"
            autoFocus
          />
        </label>

        {isJoin && (
          <label className="field">
            <span>Room code</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              placeholder="ABC123"
            />
          </label>
        )}

        {error && <p className="room-error">{error}</p>}

        <div className="btn-row stack">
          <button className="btn" type="submit">
            {isJoin ? 'Join' : 'Create'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </section>
  );
}
