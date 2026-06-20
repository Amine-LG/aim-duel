// Pure input validators. Nothing in here touches sockets, rooms, or timers,
// so these are trivially unit-testable.

function isValidPresenceId(value) {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function normalizeNickname(value) {
  if (typeof value !== 'string') return null;

  const nickname = value.trim().replace(/\s+/g, ' ');
  if (!nickname || nickname.length > 20 || /[\u0000-\u001f\u007f]/.test(nickname)) {
    return null;
  }

  return nickname;
}

function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null;

  const code = value.trim().toUpperCase();
  if (code.length !== 6 || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    return null;
  }

  return code;
}

module.exports = { isValidPresenceId, normalizeNickname, normalizeRoomCode };
