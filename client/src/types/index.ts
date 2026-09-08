export interface User {
  user_id: string;
  username: string;
  email?: string;
  avatar?: string;
  socketId?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export interface Room {
  room_id: string;
  room_code: string;
  host_id: string;
  room_name: string;
  privacy: 'public' | 'private';
  max_users: number;
  current_video: string;
  current_time: number;
  is_playing: boolean | number;
  created_at: string;
  host_username?: string;
  host_avatar?: string;
  members?: Array<{
    user_id: string;
    username: string;
    avatar?: string;
    role: 'host' | 'cohost' | 'member';
    joined_at: string;
  }>;
}

export interface VideoSyncState {
  videoUrl: string;
  currentTime: number;
  isPlaying: boolean;
  hostOnlyControls: boolean;
  isHost: boolean;
  serverTime: number;
}

export interface ChatMessage {
  message_id: string;
  room_id?: string;
  user_id: string;
  username: string;
  avatar?: string;
  content: string;
  created_at: string;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  username: string;
  xOffset?: number;
}

export interface WatchHistoryItem {
  history_id: string;
  user_id: string;
  video_url: string;
  video_title: string;
  room_id?: string;
  last_position: number;
  watched_at: string;
}
