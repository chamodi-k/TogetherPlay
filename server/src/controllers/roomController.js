import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/db.js';

// Helper: Generate unique 6-character alphanumeric room code like AB7X92
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom(req, res) {
  try {
    const { room_name, privacy = 'private', max_users = 10, initial_video } = req.body;
    const host_id = req.user.user_id;

    if (!room_name || room_name.trim().length === 0) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    // Generate unique room code
    let roomCode = generateRoomCode();
    let existing = await queryOne('SELECT room_id FROM ROOMS WHERE room_code = ?', [roomCode]);
    while (existing) {
      roomCode = generateRoomCode();
      existing = await queryOne('SELECT room_id FROM ROOMS WHERE room_code = ?', [roomCode]);
    }

    const roomId = uuidv4();
    const video = initial_video || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Big Buck Bunny / Blender sample

    await execute(
      `INSERT INTO ROOMS (room_id, room_code, host_id, room_name, privacy, max_users, current_video, current_time, is_playing)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [roomId, roomCode, host_id, room_name.trim(), privacy, max_users, video]
    );

    // Add host as member with 'host' role
    const memberId = uuidv4();
    await execute(
      `INSERT INTO ROOM_MEMBERS (id, room_id, user_id, role) VALUES (?, ?, ?, 'host')`,
      [memberId, roomId, host_id]
    );

    const room = await queryOne('SELECT * FROM ROOMS WHERE room_id = ?', [roomId]);

    return res.status(201).json({
      message: 'Room created successfully',
      room: {
        ...room,
        room_code: roomCode,
      },
    });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
}

export async function getRoomByCode(req, res) {
  try {
    const { code } = req.params;
    const room = await queryOne(
      `SELECT r.*, u.username as host_username, u.avatar as host_avatar 
       FROM ROOMS r 
       JOIN USERS u ON r.host_id = u.user_id 
       WHERE UPPER(r.room_code) = UPPER(?)`,
      [code.trim()]
    );

    if (!room) {
      return res.status(404).json({ error: 'Room not found. Please check your room code.' });
    }

    // Get active room members count
    const members = await query(
      `SELECT rm.role, rm.joined_at, u.user_id, u.username, u.avatar 
       FROM ROOM_MEMBERS rm
       JOIN USERS u ON rm.user_id = u.user_id
       WHERE rm.room_id = ?`,
      [room.room_id || room.ROOM_ID]
    );

    return res.json({
      room: {
        ...room,
        members,
      },
    });
  } catch (err) {
    console.error('Get room error:', err);
    return res.status(500).json({ error: 'Failed to fetch room details' });
  }
}

export async function getMyRooms(req, res) {
  try {
    const userId = req.user.user_id;

    const rooms = await query(
      `SELECT DISTINCT r.*, u.username as host_username 
       FROM ROOMS r
       JOIN USERS u ON r.host_id = u.user_id
       LEFT JOIN ROOM_MEMBERS rm ON r.room_id = rm.room_id
       WHERE r.host_id = ? OR rm.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [userId, userId]
    );

    return res.json({ rooms });
  } catch (err) {
    console.error('Get my rooms error:', err);
    return res.status(500).json({ error: 'Failed to fetch your rooms' });
  }
}

export async function getRoomMessages(req, res) {
  try {
    const { roomId } = req.params;
    const messages = await query(
      `SELECT m.message_id, m.room_id, m.content, m.created_at, u.user_id, u.username, u.avatar
       FROM MESSAGES m
       JOIN USERS u ON m.user_id = u.user_id
       WHERE m.room_id = ?
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [roomId]
    );

    return res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
}

export async function getWatchHistory(req, res) {
  try {
    const userId = req.user.user_id;
    const history = await query(
      `SELECT * FROM WATCH_HISTORY 
       WHERE user_id = ? 
       ORDER BY watched_at DESC 
       LIMIT 10`,
      [userId]
    );

    return res.json({ history });
  } catch (err) {
    console.error('Get history error:', err);
    return res.status(500).json({ error: 'Failed to fetch watch history' });
  }
}

export async function saveWatchHistory(req, res) {
  try {
    const userId = req.user.user_id;
    const { video_url, video_title, room_id, last_position } = req.body;

    if (!video_url) {
      return res.status(400).json({ error: 'video_url is required' });
    }

    const historyId = uuidv4();
    await execute(
      `INSERT INTO WATCH_HISTORY (history_id, user_id, video_url, video_title, room_id, last_position, watched_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [historyId, userId, video_url, video_title || 'TogetherPlay Video', room_id || null, last_position || 0]
    );

    return res.status(201).json({ message: 'Watch history updated', historyId });
  } catch (err) {
    console.error('Save history error:', err);
    return res.status(500).json({ error: 'Failed to record watch history' });
  }
}
