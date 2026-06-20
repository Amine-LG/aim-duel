// Throwaway smoke test for the realtime layer. Start the server, then run:
//   node smoke-socket.js
// It connects with a presenceId, prints the server's greeting and the online
// count, then disconnects. Not part of the app — delete it whenever you like.

const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { presenceId: 'smoke-test-presence-1234' }
});

socket.on('connect', () => console.log('connected     socket.id =', socket.id));
socket.on('server_status', (payload) => console.log('server_status', payload));
socket.on('online_count', (payload) => console.log('online_count ', payload));
socket.on('connect_error', (err) => console.log('connect_error:', err.message));

// Give the events a moment to arrive, then leave.
setTimeout(() => {
  socket.close();
  process.exit(0);
}, 1500);
