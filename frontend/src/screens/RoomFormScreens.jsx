import { DEFAULT_PLAYER_ONE, DEFAULT_PLAYER_TWO } from '../lib/constants.js';

export function CreateRoomScreen({ form, error, busy, onChange, onSubmit, onBack }) {
  return (
    <section id="room" className="screen">
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Create Room</h1>
      <p className="sub">Start a temporary 2-player lobby. Names are optional.</p>
      <form className="room-panel" onSubmit={onSubmit}>
        <label className="field">
          <span>Your name</span>
          <input
            name="nickname"
            type="text"
            value={form.nickname}
            onChange={onChange}
            maxLength={20}
            autoComplete="nickname"
            placeholder={DEFAULT_PLAYER_ONE}
          />
        </label>
        <label className="field">
          <span>Friend name</span>
          <input
            name="friendNickname"
            type="text"
            value={form.friendNickname}
            onChange={onChange}
            maxLength={20}
            autoComplete="off"
            placeholder={DEFAULT_PLAYER_TWO}
          />
        </label>
        {error && <div className="room-error">{error}</div>}
        <div className="btn-row">
          <button className="btn" type="submit" disabled={busy}>
            <span className="btn-icon" aria-hidden="true">⚔️</span>
            {busy ? 'Creating...' : 'Create'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            <span className="btn-icon" aria-hidden="true">←</span>
            Back
          </button>
        </div>
      </form>
    </section>
  );
}

export function JoinRoomScreen({ form, error, busy, onChange, onSubmit, onBack }) {
  return (
    <section id="room" className="screen">
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Join Room</h1>
      <p className="sub">Enter a room code. Name is optional.</p>
      <form className="room-panel" onSubmit={onSubmit}>
        <label className="field">
          <span>Room code</span>
          <input
            className="code-input"
            name="code"
            type="text"
            value={form.code}
            onChange={onChange}
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC234"
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input
            name="nickname"
            type="text"
            value={form.nickname}
            onChange={onChange}
            maxLength={20}
            autoComplete="nickname"
            placeholder={DEFAULT_PLAYER_TWO}
          />
        </label>
        {error && <div className="room-error">{error}</div>}
        <div className="btn-row">
          <button className="btn" type="submit" disabled={busy}>
            <span className="btn-icon" aria-hidden="true">➡</span>
            {busy ? 'Joining...' : 'Join'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            <span className="btn-icon" aria-hidden="true">←</span>
            Back
          </button>
        </div>
      </form>
    </section>
  );
}
