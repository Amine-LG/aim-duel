// App shell + router. It owns the multiplayer flow: it listens to the backend's
// room and match events, keeps the current room + match state in sync, and
// routes between home, the room form, the lobby, the race, and results (the
// in-room view is chosen by room.status). Behaviour still lives in the screens
// and the socket layer; this wires them together. The mute toggle and Live pill
// are rendered globally so they're reachable from every screen.

import { useEffect, useState } from 'react';
import { useSocket } from './socket.jsx';
import HomeScreen from './screens/HomeScreen';
import SoloScreen from './screens/SoloScreen';
import RoomFormScreen from './screens/RoomFormScreen';
import LobbyScreen from './screens/LobbyScreen';
import RaceScreen from './screens/RaceScreen';
import RaceResultsScreen from './screens/RaceResultsScreen';
import SoundToggle from './SoundToggle';
import RealtimeStatus from './RealtimeStatus';

export default function App() {
  const { socket } = useSocket();
  const [screen, setScreen] = useState('home'); // home | solo | create | join | lobby
  const [room, setRoom] = useState(null);
  const [selfSlot, setSelfSlot] = useState(null);
  const [error, setError] = useState(null);

  // Match state — driven by the dedicated match events, not room_state.
  const [countdownValue, setCountdownValue] = useState('3');
  const [scores, setScores] = useState([]);
  const [target, setTarget] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const enterLobby = (payload) => {
      setRoom(payload.room);
      setSelfSlot(payload.selfSlot);
      setError(null);
      setResult(null);
      setScreen('lobby');
    };
    const onState = (payload) => setRoom(payload.room);
    const onError = (payload) => setError(payload.message);

    const onCountdown = (payload) => setCountdownValue(payload.value);
    const onStarted = (payload) => {
      setScores(payload.scores || []);
      setTarget(null);
      setResult(null);
    };
    const onSpawn = (payload) => {
      setTarget(payload.target);
      setScores(payload.scores || []);
    };
    const onResolved = (payload) => {
      setScores(payload.scores || []);
      setTarget(null);
    };
    const onOver = (payload) => {
      setResult({ winnerSlot: payload.winnerSlot, scores: payload.scores });
      setTarget(null);
    };

    socket.on('room_created', enterLobby);
    socket.on('room_joined', enterLobby);
    socket.on('room_state', onState);
    socket.on('room_error', onError);
    socket.on('countdown_tick', onCountdown);
    socket.on('game_started', onStarted);
    socket.on('target_spawn', onSpawn);
    socket.on('target_claimed', onResolved);
    socket.on('target_missed', onResolved);
    socket.on('game_over', onOver);

    return () => {
      socket.off('room_created', enterLobby);
      socket.off('room_joined', enterLobby);
      socket.off('room_state', onState);
      socket.off('room_error', onError);
      socket.off('countdown_tick', onCountdown);
      socket.off('game_started', onStarted);
      socket.off('target_spawn', onSpawn);
      socket.off('target_claimed', onResolved);
      socket.off('target_missed', onResolved);
      socket.off('game_over', onOver);
    };
  }, [socket]);

  const goHome = () => {
    setScreen('home');
    setRoom(null);
    setSelfSlot(null);
    setError(null);
    setTarget(null);
    setResult(null);
    setScores([]);
  };
  const leaveAndHome = () => {
    socket.emit('leave_room');
    goHome();
  };

  const inRoom = screen === 'lobby' && room;
  const status = room?.status;

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

      {inRoom && (status === 'waiting' || status === 'ready') && (
        <LobbyScreen
          room={room}
          selfSlot={selfSlot}
          onReady={() => socket.emit('player_ready')}
          onUnready={() => socket.emit('player_unready')}
          onLeave={leaveAndHome}
        />
      )}

      {inRoom && (status === 'countdown' || status === 'playing') && (
        <RaceScreen
          selfSlot={selfSlot}
          status={status}
          countdownValue={countdownValue}
          scores={scores}
          target={target}
          onTargetClick={(t) => socket.emit('target_click', { targetId: t.id, matchId: t.matchId })}
          onLeave={leaveAndHome}
        />
      )}

      {inRoom && status === 'finished' && result && (
        <RaceResultsScreen
          selfSlot={selfSlot}
          result={result}
          onPlayAgain={() => socket.emit('return_to_lobby')}
          onLeave={leaveAndHome}
        />
      )}

      <SoundToggle />
      <RealtimeStatus />
    </div>
  );
}
