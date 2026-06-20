import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const presenceStorageKey = 'aim-duel-presence-id';

const initialStatus = {
  state: 'connecting',
  onlineCount: null
};

const SocketContext = createContext({
  socket: null,
  status: initialStatus
});

function createPresenceId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `presence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPresenceId() {
  // localStorage so the same identity survives tab close + reopen (even in a
  // new tab) and the server's same-presence resume path recognises the player.
  try {
    const existingPresenceId = window.localStorage.getItem(presenceStorageKey);
    if (existingPresenceId) return existingPresenceId;

    const presenceId = createPresenceId();
    window.localStorage.setItem(presenceStorageKey, presenceId);
    return presenceId;
  } catch {
    return createPresenceId();
  }
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const presenceId = getPresenceId();
    const realtimeSocket = io(window.location.origin, {
      path: '/socket.io',
      auth: { presenceId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000
    });

    const setReconnecting = () => {
      setStatus((current) => ({ ...current, state: 'reconnecting' }));
    };

    const setOnlineCount = (payload) => {
      if (typeof payload?.onlineCount !== 'number') return;
      setStatus((current) => ({ ...current, onlineCount: payload.onlineCount }));
    };

    realtimeSocket.on('connect', () => {
      setStatus((current) => ({ ...current, state: 'connected' }));
    });

    realtimeSocket.on('disconnect', () => {
      setStatus((current) => ({ ...current, state: 'disconnected' }));
    });

    realtimeSocket.on('connect_error', () => {
      setStatus((current) => ({ ...current, state: 'disconnected' }));
    });

    realtimeSocket.io.on('reconnect_attempt', setReconnecting);
    realtimeSocket.io.on('reconnect', () => {
      setStatus((current) => ({ ...current, state: 'connected' }));
    });
    realtimeSocket.io.on('reconnect_error', setReconnecting);

    realtimeSocket.on('server_status', (payload) => {
      const onlineCount =
        typeof payload?.onlineCount === 'number'
          ? payload.onlineCount
          : typeof payload?.connectedCount === 'number'
            ? payload.connectedCount
            : null;

      if (onlineCount !== null) {
        setStatus((current) => ({ ...current, onlineCount }));
      }
    });
    realtimeSocket.on('online_count', setOnlineCount);

    // pagehide fires when the tab is really going away (close, hard navigation
    // off the SPA). Explicitly disconnect so the server pauses the match and
    // drops the Live counter immediately instead of waiting for ping timeout.
    // Skip bfcache (event.persisted = true) — the page may come right back.
    const handlePageHide = (event) => {
      if (event.persisted) return;
      try {
        realtimeSocket.disconnect();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', handlePageHide);

    setSocket(realtimeSocket);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      realtimeSocket.io.off('reconnect_attempt', setReconnecting);
      realtimeSocket.io.off('reconnect_error', setReconnecting);
      realtimeSocket.disconnect();
      setSocket(null);
    };
  }, []);

  const value = useMemo(() => ({ socket, status }), [socket, status]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useRealtimeSocket() {
  return useContext(SocketContext);
}
