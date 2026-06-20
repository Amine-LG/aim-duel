// URL routing and form-input sanitizers. The app uses replaceState so in-app
// navigation never builds browser history — the phone Back button leaves the
// site naturally, and the URL always matches the visible screen for recovery.

export function sanitizeRoomCodeInput(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function normalizeNicknameInput(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20);
}

export function displayNicknameInput(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20);
}

export function nicknameOrDefault(value, fallback) {
  return normalizeNicknameInput(value) || fallback;
}

export function routeRoomCode() {
  const match = window.location.pathname.match(/^\/(?:join|room)\/([A-Za-z0-9]{1,12})\/?$/);
  return match ? sanitizeRoomCodeInput(match[1]) : '';
}

export function routeNickname() {
  const params = new URLSearchParams(window.location.search);
  return normalizeNicknameInput(params.get('nickname') || '');
}

export function routeMode() {
  if (window.location.pathname.startsWith('/create')) return 'create-room';
  if (window.location.pathname.startsWith('/room')) return 'room-recovery';
  if (window.location.pathname.startsWith('/join')) {
    return 'join-room';
  }
  return 'home';
}

export function setRoute(path) {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
}
