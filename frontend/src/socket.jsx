// The realtime context. One Socket.IO connection for the whole app, created
// once and shared via context. It connects to the app's own origin — in dev the
// Vite proxy forwards /socket.io to the backend; in production one origin serves
// both — so there's never a hardcoded backend URL.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

// A stable per-browser id so the server recognizes the same player across
// refreshes and reconnects. Generated once, kept in localStorage.
function loadPresenceId() {
  const key = 'aim-duel-presence-id';
  try {
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = window.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const presenceId = useMemo(loadPresenceId, []);
  // `io()` with no URL targets the page's origin; the handshake carries the id.
  const socket = useMemo(() => io({ auth: { presenceId } }), [presenceId]);

  const [status, setStatus] = useState('connecting'); // connecting | connected | disconnected
  const [onlineCount, setOnlineCount] = useState(null);

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onCount = (payload) => setOnlineCount(payload?.onlineCount ?? null);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('server_status', onCount);
    socket.on('online_count', onCount);

    // If we connected before the listeners attached, reflect it now.
    if (socket.connected) setStatus('connected');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('server_status', onCount);
      socket.off('online_count', onCount);
      // Intentionally NOT closing the socket: this provider lives for the app's
      // whole lifetime, and closing on effect cleanup would drop the connection
      // under React StrictMode's mount→cleanup→mount in dev. The browser tears
      // the socket down on page unload, which the server sees as a disconnect.
    };
  }, [socket]);

  const value = useMemo(
    () => ({ socket, presenceId, status, onlineCount }),
    [socket, presenceId, status, onlineCount]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
