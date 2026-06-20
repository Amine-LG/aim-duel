import { useRealtimeSocket } from './socket.jsx';

export default function RealtimeStatus({ compact = false }) {
  const { status } = useRealtimeSocket();
  const stateLabel =
    status.state === 'connected'
      ? 'Connected'
      : status.state === 'disconnected'
        ? 'Disconnected'
        : status.state === 'reconnecting'
          ? 'Reconnecting'
          : 'Connecting';
  const hasCount = typeof status.onlineCount === 'number';
  const accessibleLabel = `Realtime ${stateLabel.toLowerCase()}${
    hasCount ? `, ${status.onlineCount} online` : ''
  }`;
  const visualLabel =
    status.state === 'connected'
      ? 'Live'
      : status.state === 'disconnected'
        ? 'Off'
        : 'Sync';

  return (
    <aside
      className={`realtime-status ${status.state}${compact ? ' compact' : ''}`}
      aria-label={accessibleLabel}
      aria-live="polite"
      title={accessibleLabel}
    >
      <span className="realtime-dot" aria-hidden="true" />
      <span className="realtime-label" aria-hidden="true">
        {visualLabel}
      </span>
      {hasCount && (
        <span className="realtime-count" aria-hidden="true">
          {status.onlineCount}
        </span>
      )}
    </aside>
  );
}
