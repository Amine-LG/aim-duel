import { DEFAULT_PLAYER_TWO } from '../lib/constants.js';
import { nameForSlot } from '../lib/format.js';

function PlayerSlot({ label, player }) {
  if (!player) {
    return (
      <div className="player-slot waiting">
        <div>
          <span className="slot-label">{label}</span>
          <strong>Waiting for {DEFAULT_PLAYER_TWO}...</strong>
        </div>
        <span className="slot-state">Open</span>
      </div>
    );
  }

  return (
    <div
      className={`player-slot ${player.connected ? 'connected' : 'disconnected'}${
        player.ready ? ' ready' : ''
      }`}
    >
      <div>
        <span className="slot-label">{label}</span>
        <strong>{player.nickname || 'Open slot'}</strong>
      </div>
      <span className="slot-state">
        {player.connected ? (player.ready ? 'Ready' : 'Not ready') : 'Left'}
      </span>
    </div>
  );
}

export default function LobbyScreen({
  room,
  selfSlot,
  busy,
  inviteUrl,
  whatsAppShareUrl,
  onShareInvite,
  onCopyInvite,
  onToggleReady,
  onLeaveRoom
}) {
  const playerOne = room.players?.[0] || null;
  const playerTwo = room.players?.[1] || null;
  const currentPlayer = room.players?.find((player) => player.slot === selfSlot) || null;
  const opponentPlayer = room.players?.find((player) => player.slot !== selfSlot) || null;
  const waitingForOpponent = !playerTwo;
  const opponentDisconnected = room.players?.some((player) => !player.connected);
  const isReady = Boolean(currentPlayer?.ready);
  const readyToggleDisabled =
    busy || !currentPlayer || ['countdown', 'playing', 'finished'].includes(room.status);

  return (
    <section id="lobby" className="screen">
      <img className="home-logo small" src="/favicon.svg" alt="" aria-hidden="true" />
      <h1>Lobby</h1>
      <div className="room-code-row">
        <div className="room-code" aria-label={`Room code ${room.code}`}>
          {room.code}
        </div>
      </div>
      {waitingForOpponent && (
        <p className="lobby-wait">Waiting for {DEFAULT_PLAYER_TWO} — send them the invite.</p>
      )}
      <button className="btn btn-share share-invite" type="button" onClick={onShareInvite}>
        <span className="btn-icon" aria-hidden="true">📤</span>
        Share Invite
      </button>
      <div className="invite-row">
        <span>{inviteUrl}</span>
        <div className="invite-actions">
          <button className="btn-small invite-action" type="button" onClick={onCopyInvite}>
            <span className="btn-icon" aria-hidden="true">📋</span>
            Copy link
          </button>
          <a
            className="btn-small invite-action"
            href={whatsAppShareUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="btn-icon" aria-hidden="true">💬</span>
            WhatsApp
          </a>
        </div>
      </div>

      <div className="lobby-slots">
        <PlayerSlot label="Player 1" player={playerOne} />
        <PlayerSlot label="Player 2" player={playerTwo} />
      </div>

      {waitingForOpponent && (
        <p className="lobby-note">
          Keep this page open. Your friend can also find this room under Open Rooms on the
          homepage.
        </p>
      )}
      {opponentDisconnected && (
        <p className="lobby-alert">
          {nameForSlot(opponentPlayer?.nickname, opponentPlayer?.slot)} disconnected. This room
          will expire automatically.
        </p>
      )}
      <div className="ready-panel">
        <button
          className={`btn ready-button ${
            isReady ? 'is-ready' : !readyToggleDisabled ? 'needs-ready' : ''
          }`}
          type="button"
          onClick={() => onToggleReady(!isReady)}
          disabled={readyToggleDisabled}
          aria-pressed={isReady}
        >
          {isReady ? (
            <>
              <span className="btn-icon" aria-hidden="true">✓</span>
              Ready<small>tap to unready</small>
            </>
          ) : (
            <>
              <span className="btn-icon" aria-hidden="true">✓</span>
              Ready Up
            </>
          )}
        </button>
      </div>
      <p className="lobby-note">First to 10 wins. Red bomb is instant loss.</p>

      <div className="btn-row">
        <button className="btn btn-exit" type="button" onClick={onLeaveRoom}>
          <span className="btn-icon" aria-hidden="true">🚪</span>
          Leave Room
        </button>
      </div>
    </section>
  );
}
