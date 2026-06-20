// A small fixed pill (bottom-right) showing the realtime connection state and
// the live online count. Reads straight from the socket context.

import { useSocket } from './socket.jsx';

export default function RealtimeStatus() {
  const { status, onlineCount } = useSocket();

  return (
    <div className={`realtime-status ${status}`}>
      <span className="realtime-dot" />
      <span className="realtime-label">Live</span>
      {onlineCount != null && <span className="realtime-count">{onlineCount}</span>}
    </div>
  );
}
