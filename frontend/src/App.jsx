// App shell + the seed of the screen router. For now it switches between the
// two screens that exist (home, solo) from a single `screen` state. As the game
// grows this becomes a richer router (the original keys off the match's mode),
// but it stays a thin shell — behaviour lives in the screens and the socket
// layer. The mute toggle and the Live status pill are fixed-position and
// rendered globally so they're reachable from every screen.

import { useState } from 'react';
import HomeScreen from './screens/HomeScreen';
import SoloScreen from './screens/SoloScreen';
import SoundToggle from './SoundToggle';
import RealtimeStatus from './RealtimeStatus';

export default function App() {
  const [screen, setScreen] = useState('home');

  return (
    <div className="app">
      {screen === 'home' && (
        // onOpenCreateRoom is intentionally omitted — Create Room gets wired to
        // the backend in the next step.
        <HomeScreen onOpenSolo={() => setScreen('solo')} />
      )}
      {screen === 'solo' && <SoloScreen onBack={() => setScreen('home')} />}
      <SoundToggle />
      <RealtimeStatus />
    </div>
  );
}
