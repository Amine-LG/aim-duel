// App shell + router. It owns the multiplayer flow: it listens to the backend's
// room events, keeps the current `room` in sync, and routes between home, the
// room form (create/join), the lobby, and solo. Behaviour still lives in the
// screens and the socket layer; this just wires them together. The mute toggle
// and Live pill are rendered globally so they're reachable from every screen.

import { useEffect, useState } from 'react';
import { useSocket } from './socket.jsx';
import HomeScreen from './screens/HomeScreen';
import SoloScreen from './screens/SoloScreen';
import RoomFormScreen from './screens/RoomFormScreen';
import LobbyScreen from './screens/LobbyScreen';
import SoundToggle from './SoundToggle';
import RealtimeStatus from './RealtimeStatus';

export default function App() {
  const { socket } = useSocket();
  const [screen, setScreen] = useState('home'); // home | solo | create | join | lobby
  const [room, setRoom] = useState(null);
  const [selfSlot, setSelfSlot] = useState(null);
  const [error, setError] = useState(null);

  // Keep the room view in sync with the server, and route to the lobby the
  // moment a create/join succeeds.
  useEffect(() => {
    const enterLobby = (payload) => {
      setRoom(payload.room);
      setSelfSlot(payload.selfSlot);
      setError(null);
      setScreen('lobby');
    };
    const onState = (payload) => setRoom(payload.room);
    const onError = (payload) => setError(payload.message);

    socket.on('room_created', enterLobby);
    socket.on('room_joined', enterLobby);
    socket.on('room_state', onState);
    socket.on('room_error', onError);
    return () => {
      socket.off('room_created', enterLobby);
      socket.off('room_joined', enterLobby);
      socket.off('room_state', onState);
      socket.off('room_error', onError);
    };
  }, [socket]);

  const goHome = () => {
    setScreen('home');
    setRoom(null);
    setSelfSlot(null);
    setError(null);
  };

  return (
    <div className="app">
      {screen === 'home' && (
        <HomeScreen
          onOpenCreateRoom={() => {
            setError(null);
            setScreen('create');
          }}
          onOpenJoinRoom={() => {
            setError(null);
            setScreen('join');
          }}
          onOpenSolo={() => setScreen('solo')}
        />
      )}

      {screen === 'solo' && <SoloScreen onBack={goHome} />}

      {(screen === 'create' || screen === 'join') && (
        <RoomFormScreen
          mode={screen}
          error={error}
          onBack={goHome}
          onSubmit={(payload) =>
            socket.emit(screen === 'create' ? 'create_room' : 'join_room', payload)
          }
        />
      )}

      {screen === 'lobby' && room && (
        <LobbyScreen
          room={room}
          selfSlot={selfSlot}
          onReady={() => socket.emit('player_ready')}
          onUnready={() => socket.emit('player_unready')}
          onLeave={() => {
            socket.emit('leave_room');
            goHome();
          }}
        />
      )}

      <SoundToggle />
      <RealtimeStatus />
    </div>
  );
}
