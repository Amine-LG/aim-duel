// Room storage adapter. Every read/write of room state in roomService goes
// through this surface, which makes the state footprint visible and lets
// tests inject prepared rooms.
//
// Honest Redis caveat: rooms are NOT a drop-in store swap. Room objects hold
// live setTimeout handles and the game loop relies on object identity
// (`store.get(code) !== room` detects replaced rooms). Multi-replica rooms
// need sticky room→pod ownership (Socket.IO Redis adapter + consistent
// routing) or a snapshot/restore redesign — see ARCHITECTURE.md. This
// adapter exists for visibility and testability, not to pretend that swap
// is free.

function createInMemoryRoomStore() {
  const rooms = new Map();

  return {
    get(code) {
      return rooms.get(code);
    },
    set(code, room) {
      rooms.set(code, room);
    },
    delete(code) {
      return rooms.delete(code);
    },
    has(code) {
      return rooms.has(code);
    },
    values() {
      return rooms.values();
    },
    codes() {
      return [...rooms.keys()];
    },
    count() {
      return rooms.size;
    }
  };
}

module.exports = { createInMemoryRoomStore };
