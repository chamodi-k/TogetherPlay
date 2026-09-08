-- ============================================================================
-- TOGETHERPLAY — ORACLE DATABASE DDL & PL/SQL DEFINITION
-- Supports: Oracle Database 12c, 19c, 21c, 23c and Autonomous DB
-- ============================================================================

-- Drop tables in reverse dependency order if needed (clean reinstall)
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE WATCH_HISTORY CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE MESSAGES CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE ROOM_MEMBERS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE ROOMS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE VIDEOS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN
   EXECUTE IMMEDIATE 'DROP TABLE USERS CASCADE CONSTRAINTS';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE USERS (
    user_id          VARCHAR2(64) PRIMARY KEY,
    username         VARCHAR2(50) NOT NULL UNIQUE,
    email            VARCHAR2(100) NOT NULL UNIQUE,
    password_hash    VARCHAR2(255) NOT NULL,
    avatar           VARCHAR2(500) DEFAULT 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- 2. ROOMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE ROOMS (
    room_id          VARCHAR2(64) PRIMARY KEY,
    room_code        VARCHAR2(12) NOT NULL UNIQUE,
    host_id          VARCHAR2(64) NOT NULL,
    room_name        VARCHAR2(100) NOT NULL,
    privacy          VARCHAR2(20) DEFAULT 'private' CHECK (privacy IN ('public', 'private')),
    max_users        NUMBER DEFAULT 10 CHECK (max_users BETWEEN 2 AND 50),
    current_video    VARCHAR2(500) DEFAULT 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    current_time     NUMBER(10, 3) DEFAULT 0,
    is_playing       NUMBER(1) DEFAULT 0 CHECK (is_playing IN (0, 1)),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_rooms_host FOREIGN KEY (host_id) REFERENCES USERS(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_rooms_code ON ROOMS(room_code);

-- ----------------------------------------------------------------------------
-- 3. ROOM_MEMBERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE ROOM_MEMBERS (
    id               VARCHAR2(64) PRIMARY KEY,
    room_id          VARCHAR2(64) NOT NULL,
    user_id          VARCHAR2(64) NOT NULL,
    role             VARCHAR2(20) DEFAULT 'member' CHECK (role IN ('host', 'cohost', 'member')),
    joined_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_member_room FOREIGN KEY (room_id) REFERENCES ROOMS(room_id) ON DELETE CASCADE,
    CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES USERS(user_id) ON DELETE CASCADE,
    CONSTRAINT uq_room_user UNIQUE (room_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. VIDEOS TABLE (Catalog of authorized & user-uploaded videos)
-- ----------------------------------------------------------------------------
CREATE TABLE VIDEOS (
    video_id         VARCHAR2(64) PRIMARY KEY,
    title            VARCHAR2(200) NOT NULL,
    source_type      VARCHAR2(30) DEFAULT 'youtube' CHECK (source_type IN ('youtube', 'mp4', 'hls', 'embed')),
    url              VARCHAR2(500) NOT NULL,
    duration         NUMBER(10, 2) DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ----------------------------------------------------------------------------
-- 5. MESSAGES TABLE (Chat history)
-- ----------------------------------------------------------------------------
CREATE TABLE MESSAGES (
    message_id       VARCHAR2(64) PRIMARY KEY,
    room_id          VARCHAR2(64) NOT NULL,
    user_id          VARCHAR2(64) NOT NULL,
    content          VARCHAR2(2000) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_msg_room FOREIGN KEY (room_id) REFERENCES ROOMS(room_id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES USERS(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_msg_room ON MESSAGES(room_id, created_at);

-- ----------------------------------------------------------------------------
-- 6. WATCH_HISTORY TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE WATCH_HISTORY (
    history_id       VARCHAR2(64) PRIMARY KEY,
    user_id          VARCHAR2(64) NOT NULL,
    video_url        VARCHAR2(500) NOT NULL,
    video_title      VARCHAR2(200) DEFAULT 'TogetherPlay Video',
    room_id          VARCHAR2(64),
    last_position    NUMBER(10, 3) DEFAULT 0,
    watched_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_hist_user FOREIGN KEY (user_id) REFERENCES USERS(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_hist_user ON WATCH_HISTORY(user_id, watched_at DESC);

-- ----------------------------------------------------------------------------
-- PL/SQL STORED PROCEDURES & TRIGGERS
-- ----------------------------------------------------------------------------

-- Procedure to join a room atomically
CREATE OR REPLACE PROCEDURE SP_JOIN_ROOM (
    p_room_code   IN  VARCHAR2,
    p_user_id     IN  VARCHAR2,
    p_status      OUT VARCHAR2,
    p_room_id     OUT VARCHAR2
) AS
    v_room_id     VARCHAR2(64);
    v_member_cnt  NUMBER;
    v_max_users   NUMBER;
BEGIN
    SELECT room_id, max_users INTO v_room_id, v_max_users
    FROM ROOMS
    WHERE room_code = p_room_code;

    SELECT COUNT(*) INTO v_member_cnt
    FROM ROOM_MEMBERS
    WHERE room_id = v_room_id;

    IF v_member_cnt >= v_max_users THEN
        p_status := 'FULL';
        p_room_id := v_room_id;
        RETURN;
    END IF;

    MERGE INTO ROOM_MEMBERS m
    USING DUAL
    ON (m.room_id = v_room_id AND m.user_id = p_user_id)
    WHEN MATCHED THEN
        UPDATE SET joined_at = CURRENT_TIMESTAMP
    WHEN NOT MATCHED THEN
        INSERT (id, room_id, user_id, role, joined_at)
        VALUES (RAWTOHEX(SYS_GUID()), v_room_id, p_user_id, 'member', CURRENT_TIMESTAMP);

    p_status := 'SUCCESS';
    p_room_id := v_room_id;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_status := 'NOT_FOUND';
        p_room_id := NULL;
    WHEN OTHERS THEN
        p_status := 'ERROR';
        p_room_id := NULL;
END SP_JOIN_ROOM;
/

-- Procedure to upsert Watch History
CREATE OR REPLACE PROCEDURE SP_UPDATE_WATCH_HISTORY (
    p_user_id       IN VARCHAR2,
    p_video_url     IN VARCHAR2,
    p_video_title   IN VARCHAR2,
    p_room_id       IN VARCHAR2,
    p_position      IN NUMBER
) AS
BEGIN
    INSERT INTO WATCH_HISTORY (history_id, user_id, video_url, video_title, room_id, last_position, watched_at)
    VALUES (RAWTOHEX(SYS_GUID()), p_user_id, p_video_url, p_video_title, p_room_id, p_position, CURRENT_TIMESTAMP);
    COMMIT;
END SP_UPDATE_WATCH_HISTORY;
/
