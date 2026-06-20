// Pure input validators — no sockets, no state. Easy to reason about and test.

function isValidPresenceId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

// Trim, collapse whitespace, and cap; '' means "nothing usable".
function normalizeNickname(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 20) : '';
}

// Room codes are uppercase, fixed length; '' means invalid.
function normalizeRoomCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9]{6}$/.test(code) ? code : '';
}

module.exports = { isValidPresenceId, normalizeNickname, normalizeRoomCode };
