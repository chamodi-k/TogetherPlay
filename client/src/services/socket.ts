import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const serverUrl =
      import.meta.env.DEV
        ? `http://${window.location.hostname}:5000`
        : 'https://togetherplay-server.onrender.com';

    socket = io(serverUrl, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log(
        '⚡ Connected to TogetherPlay Real-time Socket Server:',
        socket?.id
      );
    });

    socket.on('disconnect', (reason) => {
      console.warn(
        '🔌 Disconnected from Socket Server:',
        reason
      );
    });

    socket.on('connect_error', (error) => {
      console.error(
        '❌ Socket connection error:',
        error.message
      );
    });
  }

  return socket;
}