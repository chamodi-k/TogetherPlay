import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read database type AFTER dotenv has been loaded
let dbType = process.env.DB_TYPE || 'sqlite';
let oraclePool = null;

// Ensure server/data directory exists
const dataDir = path.resolve(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'togetherplay_db.json');

// In-memory data store with file persistence
let store = {
  USERS: [],
  ROOMS: [],
  ROOM_MEMBERS: [],
  VIDEOS: [],
  MESSAGES: [],
  WATCH_HISTORY: [],
};

// ============================================================
// LOCAL JSON DATABASE
// ============================================================

function loadStore() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const data = fs.readFileSync(dbFilePath, 'utf-8');

      store = {
        ...store,
        ...JSON.parse(data),
      };
    } else {
      saveStore();
    }
  } catch (err) {
    console.error(
      'Failed to load local database JSON file:',
      err.message
    );
  }
}

function saveStore() {
  try {
    fs.writeFileSync(
      dbFilePath,
      JSON.stringify(store, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error(
      'Failed to persist local database JSON file:',
      err.message
    );
  }
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

export async function initDatabase() {
  // ----------------------------------------------------------
  // ORACLE DATABASE
  // ----------------------------------------------------------

  if (dbType === 'oracle') {
    try {
      console.log('🔌 [Database] Connecting to Oracle Database...');

      const oracledb = await import('oracledb');

      oraclePool = await oracledb.default.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONNECT_STRING,
        poolMin: 1,
        poolMax: 10,
        poolIncrement: 1,
      });

      // Test an actual connection
      let connection;

      try {
        connection = await oraclePool.getConnection();

        await connection.execute(
          'SELECT 1 AS CONNECTION_TEST FROM DUAL'
        );

        console.log(
          '✅ [Database] Connected successfully to Oracle Database'
        );

        console.log(
          `👤 [Database] Oracle User: ${process.env.ORACLE_USER}`
        );

        console.log(
          `🔗 [Database] Connect String: ${process.env.ORACLE_CONNECT_STRING}`
        );

        return;
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      }
    } catch (err) {
      console.warn(
        '⚠️ [Database] Oracle connection failed:',
        err.message
      );

      console.log(
        '🔄 [Database] Falling back to Local Persistent Mode'
      );

      dbType = 'sqlite';
      oraclePool = null;
    }
  }

  // ----------------------------------------------------------
  // LOCAL FALLBACK
  // ----------------------------------------------------------

  loadStore();

  console.log(
    `✅ [Database] Local Persistent Storage initialized at: ${dbFilePath}`
  );
}

// ============================================================
// UNIVERSAL QUERY RUNNER
// ============================================================

export async function query(sql, params = []) {
  // ----------------------------------------------------------
  // ORACLE QUERY
  // ----------------------------------------------------------

  if (dbType === 'oracle' && oraclePool) {
    const oracledb = await import('oracledb');

    let connection;

    try {
      connection = await oraclePool.getConnection();

      // Convert ? placeholders to Oracle :1, :2, :3...
      let bindIndex = 1;

      const oracleSql = sql.replace(
        /\?/g,
        () => `:${bindIndex++}`
      );

      const result = await connection.execute(
        oracleSql,
        params,
        {
          outFormat: oracledb.default.OUT_FORMAT_OBJECT,
          autoCommit: true,
        }
      );

      // Normalize Oracle uppercase column names
      // to lowercase for JavaScript compatibility
      const rows = (result.rows || []).map((row) => {
        const normalizedRow = {
          ...row,
        };

        for (const [key, val] of Object.entries(row)) {
          normalizedRow[key.toLowerCase()] = val;
        }

        return normalizedRow;
      });

      return rows;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {
          // Ignore connection close errors
        }
      }
    }
  }

  // ==========================================================
  // LOCAL JSON ENGINE
  // ==========================================================

  const normalized = sql.trim().replace(/\s+/g, ' ');

  // ----------------------------------------------------------
  // 1. SELECT USERS BY USERNAME OR EMAIL
  // ----------------------------------------------------------

  if (
    /SELECT \* FROM USERS WHERE LOWER\(username\) = LOWER\(\?\) OR LOWER\(email\) = LOWER\(\?\)/i.test(
      normalized
    )
  ) {
    const p1 = (params[0] || '').toLowerCase();
    const p2 = (params[1] || '').toLowerCase();

    return store.USERS.filter(
      (u) =>
        u.username.toLowerCase() === p1 ||
        u.email.toLowerCase() === p2
    );
  }

  // ----------------------------------------------------------
  // 2. INSERT USER
  // ----------------------------------------------------------

  if (/INSERT INTO USERS/i.test(normalized)) {
    const [
      user_id,
      username,
      email,
      password_hash,
      avatar,
    ] = params;

    const newUser = {
      user_id,
      username,
      email,
      password_hash,
      avatar,
      created_at: new Date().toISOString(),
    };

    store.USERS.push(newUser);

    saveStore();

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // 3. SELECT USER BY ID
  // ----------------------------------------------------------

  if (
    /SELECT .* FROM USERS WHERE user_id = \?/i.test(
      normalized
    )
  ) {
    const id = params[0];

    const user = store.USERS.find(
      (u) => u.user_id === id
    );

    return user ? [user] : [];
  }

  // ----------------------------------------------------------
  // 4. SELECT ROOM BY ROOM CODE
  // ----------------------------------------------------------

  if (
    /SELECT .* FROM ROOMS WHERE room_code = \?/i.test(
      normalized
    ) ||
    /SELECT .* FROM ROOMS WHERE UPPER\(room_code\) = UPPER\(\?\)/i.test(
      normalized
    )
  ) {
    const code = (params[0] || '').toUpperCase();

    const room = store.ROOMS.find(
      (rm) =>
        rm.room_code.toUpperCase() === code
    );

    return room ? [room] : [];
  }

  // ----------------------------------------------------------
  // 5. INSERT ROOM
  // ----------------------------------------------------------

  if (/INSERT INTO ROOMS/i.test(normalized)) {
    const [
      room_id,
      room_code,
      host_id,
      room_name,
      privacy,
      max_users,
      current_video,
    ] = params;

    const newRoom = {
      room_id,
      room_code: room_code.toUpperCase(),
      host_id,
      room_name,
      privacy: privacy || 'private',
      max_users: max_users || 10,
      current_video:
        current_video ||
        'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      current_time: 0,
      is_playing: 0,
      created_at: new Date().toISOString(),
    };

    store.ROOMS.push(newRoom);

    saveStore();

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // 6. INSERT ROOM MEMBER
  // ----------------------------------------------------------

  if (/INSERT INTO ROOM_MEMBERS/i.test(normalized)) {
    const [
      id,
      room_id,
      user_id,
      role,
    ] = params;

    const existing = store.ROOM_MEMBERS.find(
      (m) =>
        m.room_id === room_id &&
        m.user_id === user_id
    );

    if (!existing) {
      store.ROOM_MEMBERS.push({
        id,
        room_id,
        user_id,
        role: role || 'member',
        joined_at: new Date().toISOString(),
      });

      saveStore();
    }

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // 7. SELECT ROOM BY ID
  // ----------------------------------------------------------

  if (
    /SELECT \* FROM ROOMS WHERE room_id = \?/i.test(
      normalized
    )
  ) {
    const id = params[0];

    const room = store.ROOMS.find(
      (rm) => rm.room_id === id
    );

    return room ? [room] : [];
  }

  // ----------------------------------------------------------
  // 8. SELECT ROOM + HOST
  // ----------------------------------------------------------

  if (
    /FROM ROOMS r.*WHERE UPPER\(r\.room_code\) = UPPER\(\?\)/i.test(
      normalized
    ) ||
    /WHERE UPPER\(room_code\) = UPPER\(\?\)/i.test(
      normalized
    )
  ) {
    const code = (params[0] || '').toUpperCase();

    const room = store.ROOMS.find(
      (rm) =>
        rm.room_code.toUpperCase() === code
    );

    if (!room) {
      return [];
    }

    const host = store.USERS.find(
      (u) => u.user_id === room.host_id
    );

    return [
      {
        ...room,
        host_username:
          host?.username || 'Host',
        host_avatar: host?.avatar,
      },
    ];
  }

  // ----------------------------------------------------------
  // 9. SELECT ROOM MEMBERS
  // ----------------------------------------------------------

  if (
    /FROM ROOM_MEMBERS rm.*WHERE rm\.room_id = \?/i.test(
      normalized
    )
  ) {
    const roomId = params[0];

    const members = store.ROOM_MEMBERS.filter(
      (m) => m.room_id === roomId
    );

    return members.map((m) => {
      const user = store.USERS.find(
        (u) => u.user_id === m.user_id
      );

      return {
        role: m.role,
        joined_at: m.joined_at,
        user_id: m.user_id,
        username:
          user?.username || 'User',
        avatar: user?.avatar,
      };
    });
  }

  // ----------------------------------------------------------
  // 10. SELECT USER'S ROOMS
  // ----------------------------------------------------------

  if (
    /FROM ROOMS r.*WHERE r\.host_id = \? OR rm\.user_id = \?/i.test(
      normalized
    )
  ) {
    const userId = params[0];

    const userMemberRoomIds =
      store.ROOM_MEMBERS
        .filter((m) => m.user_id === userId)
        .map((m) => m.room_id);

    const rooms = store.ROOMS.filter(
      (r) =>
        r.host_id === userId ||
        userMemberRoomIds.includes(r.room_id)
    );

    return rooms
      .map((r) => {
        const host = store.USERS.find(
          (u) => u.user_id === r.host_id
        );

        return {
          ...r,
          host_username:
            host?.username || 'Host',
          host_avatar: host?.avatar,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )
      .slice(0, 20);
  }

  // ----------------------------------------------------------
  // 11. SELECT ROOM MESSAGES
  // ----------------------------------------------------------

  if (
    /FROM MESSAGES m.*WHERE m\.room_id = \?/i.test(
      normalized
    )
  ) {
    const roomId = params[0];

    const messages = store.MESSAGES.filter(
      (m) => m.room_id === roomId
    );

    return messages
      .map((m) => {
        const user = store.USERS.find(
          (u) => u.user_id === m.user_id
        );

        return {
          message_id: m.message_id,
          room_id: m.room_id,
          content: m.content,
          created_at: m.created_at,
          user_id: m.user_id,
          username:
            user?.username || 'User',
          avatar: user?.avatar,
        };
      })
      .slice(-100);
  }

  // ----------------------------------------------------------
  // 12. INSERT MESSAGE
  // ----------------------------------------------------------

  if (/INSERT INTO MESSAGES/i.test(normalized)) {
    const [
      message_id,
      room_id,
      user_id,
      content,
    ] = params;

    store.MESSAGES.push({
      message_id,
      room_id,
      user_id,
      content,
      created_at: new Date().toISOString(),
    });

    saveStore();

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // 13. SELECT WATCH HISTORY
  // ----------------------------------------------------------

  if (
    /SELECT \* FROM WATCH_HISTORY WHERE user_id = \?/i.test(
      normalized
    )
  ) {
    const userId = params[0];

    const history = store.WATCH_HISTORY
      .filter((h) => h.user_id === userId)
      .sort(
        (a, b) =>
          new Date(b.watched_at).getTime() -
          new Date(a.watched_at).getTime()
      )
      .slice(0, 10);

    return history;
  }

  // ----------------------------------------------------------
  // 14. INSERT WATCH HISTORY
  // ----------------------------------------------------------

  if (/INSERT INTO WATCH_HISTORY/i.test(normalized)) {
    const [
      history_id,
      user_id,
      video_url,
      video_title,
      room_id,
      last_position,
    ] = params;

    store.WATCH_HISTORY.push({
      history_id,
      user_id,
      video_url,
      video_title,
      room_id,
      last_position,
      watched_at: new Date().toISOString(),
    });

    saveStore();

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // 15. UPDATE ROOM VIDEO
  // ----------------------------------------------------------

  if (
    /UPDATE ROOMS SET current_video = \?/i.test(
      normalized
    )
  ) {
    const [
      videoUrl,
      roomCode,
    ] = params;

    const room = store.ROOMS.find(
      (rm) =>
        rm.room_code.toUpperCase() ===
        (roomCode || '').toUpperCase()
    );

    if (room) {
      room.current_video = videoUrl;
      room.current_time = 0;
      room.is_playing = 0;

      saveStore();
    }

    return {
      changes: 1,
    };
  }

  // ----------------------------------------------------------
  // UNKNOWN QUERY
  // ----------------------------------------------------------

  return [];
}

// ============================================================
// QUERY ONE
// ============================================================

export async function queryOne(
  sql,
  params = []
) {
  const rows = await query(sql, params);

  if (Array.isArray(rows)) {
    return rows[0] || null;
  }

  return rows || null;
}

// ============================================================
// EXECUTE
// ============================================================

export async function execute(
  sql,
  params = []
) {
  return await query(sql, params);
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  initDatabase,
  query,
  queryOne,
  execute,
};