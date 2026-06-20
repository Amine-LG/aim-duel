// Throwaway smoke test for the room/lobby domain. Start the server, then run:
//   node smoke-socket.js
// Alice creates a room, Bob joins by its code, then both ready up. The room
// each client sees is printed at every step. Not part of the app — delete it
// whenever you like.

const { io } = require('socket.io-client');

const connect = (presenceId) => io('http://localhost:3000', { auth: { presenceId } });

const alice = connect('smoke-alice-0001');
const bob = connect('smoke-bob-0002');
let code = null;

alice.on('connect', () => alice.emit('create_room', { nickname: 'Alice' }));

alice.on('room_created', (p) => {
  code = p.code;
  console.log(`Alice created room ${code}`);
  bob.emit('join_room', { code, nickname: 'Bob' });
});

bob.on('room_joined', () => {
  console.log('Bob joined; both readying up');
  alice.emit('player_ready');
  bob.emit('player_ready');
});

alice.on('room_state', (p) => console.log('  Alice sees', JSON.stringify(p.room)));
bob.on('room_state', (p) => console.log('  Bob sees  ', JSON.stringify(p.room)));
alice.on('room_error', (p) => console.log('Alice error:', p.message));
bob.on('room_error', (p) => console.log('Bob error:', p.message));

// Give the exchange a couple of seconds, then leave.
setTimeout(() => {
  alice.close();
  bob.close();
  process.exit(0);
}, 2000);
