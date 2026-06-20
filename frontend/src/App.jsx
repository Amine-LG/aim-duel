// App shell. For now it just renders the landing screen. As the game grows,
// this becomes the conductor that swaps between screens (home, lobby,
// countdown, race, results) based on app state — but it stays a thin shell;
// behaviour lives in the screens and (later) the socket layer.

import HomeScreen from './screens/HomeScreen';

export default function App() {
  return (
    <div className="app">
      <HomeScreen />
    </div>
  );
}
