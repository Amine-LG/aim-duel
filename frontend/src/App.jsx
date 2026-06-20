// App shell + the seed of the screen router. For now it switches between the
// two screens that exist (home, solo) from a single `screen` state. As the game
// grows this becomes a richer router (the original keys off the match's mode),
// but it stays a thin shell — behaviour lives in the screens and, later, the
// socket layer.

import { useState } from 'react';
import HomeScreen from './screens/HomeScreen';
import SoloScreen from './screens/SoloScreen';

export default function App() {
  const [screen, setScreen] = useState('home');

  return (
    <div className="app">
      {screen === 'home' && (
        // onOpenCreateRoom is intentionally omitted — Create Room needs the
        // multiplayer backend, so it stays inert until that step.
        <HomeScreen onOpenSolo={() => setScreen('solo')} />
      )}
      {screen === 'solo' && <SoloScreen onBack={() => setScreen('home')} />}
    </div>
  );
}
