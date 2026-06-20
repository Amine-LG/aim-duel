import { useEffect, useState } from 'react';

// Polls the open-rooms list while `active` (the Home screen) and keeps it
// fresh across reconnects. Returns the current list; empty when inactive.
export function useOpenRooms(socket, active) {
  const [openRooms, setOpenRooms] = useState([]);

  useEffect(() => {
    if (!socket || !active) return undefined;

    const handleOpenRooms = (payload = {}) => {
      setOpenRooms(Array.isArray(payload.rooms) ? payload.rooms : []);
    };

    const requestRooms = () => {
      if (socket.connected) socket.emit('get_open_rooms');
    };

    socket.on('open_rooms', handleOpenRooms);
    socket.on('connect', requestRooms);
    requestRooms();
    const timer = window.setInterval(requestRooms, 5000);

    return () => {
      window.clearInterval(timer);
      socket.off('open_rooms', handleOpenRooms);
      socket.off('connect', requestRooms);
    };
  }, [active, socket]);

  return openRooms;
}
