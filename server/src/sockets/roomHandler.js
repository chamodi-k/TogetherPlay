import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from '../config/db.js';

// In-memory active room states for real-time low latency
// Map<roomCode, { videoUrl, currentTime, isPlaying, updatedAt, hostId, hostOnlyControls, users: Map<socketId, User> }>
const roomStates = new Map();

function getRoomState(roomCode) {
  if (!roomStates.has(roomCode)) {
    roomStates.set(roomCode, {
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
      hostId: null,
      hostOnlyControls: false,
      users: new Map(), // socketId -> user details
    });
  }
  return roomStates.get(roomCode);
}

function calculateCurrentTime(state) {
  if (!state.isPlaying) {
    return state.currentTime;
  }
  const elapsed = (Date.now() - state.updatedAt) / 1000;
  return Math.max(0, state.currentTime + elapsed);
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentRoomCode = null;
    let currentUser = null;

    // 1. Join Room
    socket.on('room:join', async ({ roomCode, user }) => {
      if (!roomCode || !user) return;
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      const existingState = roomStates.get(normalizedRoomCode);

      if (currentRoomCode === normalizedRoomCode && existingState?.users.has(socket.id)) {
        return;
      }

      currentRoomCode = normalizedRoomCode;
      currentUser = {
        ...user,
        socketId: socket.id,
        isMuted: false,
        isVideoOff: false,
      };

      const state = getRoomState(currentRoomCode);
      socket.join(currentRoomCode);
      state.users.set(socket.id, currentUser);

      // Check DB to see if this user is host or room's hostId
      try {
        const roomDb = await queryOne('SELECT host_id, current_video FROM ROOMS WHERE UPPER(room_code) = UPPER(?)', [currentRoomCode]);
        if (roomDb) {
          if (!state.hostId) {
            state.hostId = roomDb.host_id || roomDb.HOST_ID;
          }
          if (roomDb.current_video || roomDb.CURRENT_VIDEO) {
            state.videoUrl = roomDb.current_video || roomDb.CURRENT_VIDEO;
          }
        }
      } catch (err) {
        console.error('Error fetching room DB info on socket join:', err.message);
      }

      // Send initial synchronization state to late-joiner (Phase 9)
      const currentCalculatedTime = calculateCurrentTime(state);
      socket.emit('video:sync', {
        videoUrl: state.videoUrl,
        currentTime: currentCalculatedTime,
        isPlaying: state.isPlaying,
        hostOnlyControls: state.hostOnlyControls,
        isHost: state.hostId === user.user_id,
        serverTime: Date.now(),
      });

      // Notify all users in room about updated presence (Phase 14)
      const userList = Array.from(state.users.values());
      io.to(currentRoomCode).emit('room:presence', {
        users: userList,
        count: userList.length,
        hostId: state.hostId,
        joinedUser: currentUser,
      });

      // Notify existing peers and the new peer so both sides can establish a mesh.
      socket.to(currentRoomCode).emit('webrtc:peer-joined', {
        socketId: socket.id,
        user: currentUser,
      });
      for (const [peerSocketId, peerUser] of state.users) {
        if (peerSocketId !== socket.id) {
          socket.emit('webrtc:peer-existing', {
            socketId: peerSocketId,
            user: peerUser,
          });
        }
      }

      console.log(`[Socket] User ${currentUser.username} (${socket.id}) joined room ${currentRoomCode}`);
    });

    // 2. Video Play (Phase 8)
    socket.on('video:play', ({ currentTime }) => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);

      if (state.hostOnlyControls && state.hostId !== currentUser?.user_id) {
        return socket.emit('room:error', { message: 'Only the host can control playback in this room' });
      }

      state.isPlaying = true;
      state.currentTime = typeof currentTime === 'number' ? currentTime : state.currentTime;
      state.updatedAt = Date.now();

      io.to(currentRoomCode).emit('video:play', {
        currentTime: state.currentTime,
        serverTime: Date.now(),
        by: currentUser?.username,
      });
    });

    // 3. Video Pause (Phase 8)
    socket.on('video:pause', ({ currentTime }) => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);

      if (state.hostOnlyControls && state.hostId !== currentUser?.user_id) {
        return socket.emit('room:error', { message: 'Only the host can control playback in this room' });
      }

      state.isPlaying = false;
      state.currentTime = typeof currentTime === 'number' ? currentTime : calculateCurrentTime(state);
      state.updatedAt = Date.now();

      io.to(currentRoomCode).emit('video:pause', {
        currentTime: state.currentTime,
        serverTime: Date.now(),
        by: currentUser?.username,
      });
    });

    // 4. Video Seek (Phase 8)
    socket.on('video:seek', ({ targetTime }) => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);

      if (state.hostOnlyControls && state.hostId !== currentUser?.user_id) {
        return socket.emit('room:error', { message: 'Only the host can seek in this room' });
      }

      state.currentTime = Math.max(0, targetTime);
      state.updatedAt = Date.now();

      io.to(currentRoomCode).emit('video:seek', {
        targetTime: state.currentTime,
        serverTime: Date.now(),
        by: currentUser?.username,
      });
    });

    // 5. Video Change (Source change: YouTube / Direct MP4) (Phase 7 & 8)
    socket.on('video:change', async ({ videoUrl }) => {
      if (!currentRoomCode || !videoUrl) return;
      const state = getRoomState(currentRoomCode);

      if (state.hostOnlyControls && state.hostId !== currentUser?.user_id) {
        return socket.emit('room:error', { message: 'Only the host can change videos' });
      }

      state.videoUrl = videoUrl;
      state.currentTime = 0;
      state.isPlaying = false;
      state.updatedAt = Date.now();

      // Update in DB
      try {
        await execute(
          'UPDATE ROOMS SET current_video = ?, current_time = 0, is_playing = 0 WHERE UPPER(room_code) = UPPER(?)',
          [videoUrl, currentRoomCode]
        );
      } catch (err) {
        console.error('Error updating video in DB:', err.message);
      }

      io.to(currentRoomCode).emit('video:change', {
        videoUrl: state.videoUrl,
        by: currentUser?.username,
      });
    });

    // 6. Host Toggle Controls (Phase 15)
    socket.on('room:toggle-host-only', ({ hostOnlyControls }) => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);
      if (state.hostId !== currentUser?.user_id) return;

      state.hostOnlyControls = Boolean(hostOnlyControls);
      io.to(currentRoomCode).emit('room:host-only-updated', {
        hostOnlyControls: state.hostOnlyControls,
      });
    });

    // 7. Periodic Drift Heartbeat (Phase 10)
    socket.on('video:ping-sync', () => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);
      socket.emit('video:heartbeat', {
        currentTime: calculateCurrentTime(state),
        isPlaying: state.isPlaying,
        serverTime: Date.now(),
      });
    });

    // 8. Live Chat Message (Phase 12)
    socket.on('chat:send', async ({ content }) => {
      if (!currentRoomCode || !currentUser) {
        return socket.emit('chat:error', { message: 'You are not connected to a room yet.' });
      }

      if (!content?.trim()) {
        return socket.emit('chat:error', { message: 'Message cannot be empty.' });
      }

      const messageId = uuidv4();
      const messageData = {
        message_id: messageId,
        content: content.trim(),
        user_id: currentUser.user_id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        created_at: new Date().toISOString(),
      };

      // Persist to DB asynchronously
      try {
        const room = await queryOne('SELECT room_id FROM ROOMS WHERE UPPER(room_code) = UPPER(?)', [currentRoomCode]);
        if (room) {
          const roomId = room.room_id || room.ROOM_ID;
          await execute(
            'INSERT INTO MESSAGES (message_id, room_id, user_id, content) VALUES (?, ?, ?, ?)',
            [messageId, roomId, currentUser.user_id, content.trim()]
          );
        }
      } catch (err) {
        console.error('Failed to persist chat message to DB:', err.message);
      }

      io.to(currentRoomCode).emit('chat:message', messageData);
    });

    // 9. Floating Reactions (Phase 13)
    socket.on('reaction:send', ({ emoji }) => {
      if (!currentRoomCode || !currentUser) return;
      io.to(currentRoomCode).emit('reaction:receive', {
        id: uuidv4(),
        emoji: emoji || '❤️',
        username: currentUser.username,
      });
    });

    // 10. WebRTC Signaling (Phase 11)
    socket.on('webrtc:offer', ({ toSocketId, offer }) => {
      io.to(toSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        offer,
        user: currentUser,
      });
    });

    socket.on('webrtc:answer', ({ toSocketId, answer }) => {
      io.to(toSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    socket.on('webrtc:ice-candidate', ({ toSocketId, candidate }) => {
      io.to(toSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    socket.on('webrtc:media-state', ({ isMuted, isVideoOff }) => {
      if (!currentRoomCode) return;
      const state = getRoomState(currentRoomCode);
      const u = state.users.get(socket.id);
      if (u) {
        u.isMuted = isMuted;
        u.isVideoOff = isVideoOff;
      }
      socket.to(currentRoomCode).emit('webrtc:peer-media-changed', {
        socketId: socket.id,
        isMuted,
        isVideoOff,
      });
    });

    // 11. Disconnect / Leave
    const handleLeave = () => {
      if (!currentRoomCode) return;
      const roomCodeAtLeave = currentRoomCode;
      const usernameAtLeave = currentUser?.username || socket.id;
      const state = getRoomState(roomCodeAtLeave);
      state.users.delete(socket.id);

      const userList = Array.from(state.users.values());
      io.to(roomCodeAtLeave).emit('room:presence', {
        users: userList,
        count: userList.length,
        hostId: state.hostId,
        leftUser: currentUser,
      });

      socket.to(roomCodeAtLeave).emit('webrtc:peer-left', {
        socketId: socket.id,
      });

      socket.leave(roomCodeAtLeave);
      currentRoomCode = null;
      currentUser = null;
      console.log(`[Socket] User ${usernameAtLeave} left room ${roomCodeAtLeave}`);
    };

    socket.on('room:leave', handleLeave);
    socket.on('disconnect', handleLeave);
  });
}
