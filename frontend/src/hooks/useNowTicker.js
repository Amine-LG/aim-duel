import { useEffect, useState } from 'react';

// A cheap "current time" that only ticks while something on screen needs a
// live countdown (rematch window, disconnect grace). Frozen otherwise so the
// app doesn't re-render 4×/second for nothing.
export function useNowTicker(active, intervalMs = 250) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;

    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);

  return nowMs;
}
