import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, ShieldAlert, Settings, Share2, LogOut, Film, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { getSocket } from '../services/socket.ts';
import { roomApi } from '../services/api.ts';
import { Navbar } from '../components/Navbar.tsx';
import { VideoPlayer } from '../components/VideoPlayer.tsx';
import { WebRTCGrid } from '../components/WebRTCGrid.tsx';
import { ChatPanel } from '../components/ChatPanel.tsx';
import { User, ChatMessage, FloatingReaction, Room } from '../types/index.ts';

export const RoomPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const socket = getSocket();

  const [room, setRoom] = useState<Room | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [hostOnlyControls, setHostOnlyControls] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Change Video Modal
  const [showVideoModal, setShowVideoModal] = useState<boolean>(false);
  const [newVideoUrl, setNewVideoUrl] = useState<string>('');

  const roomCode = code?.toUpperCase() || '';

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth?redirect=room/${roomCode}`);
    }
  }, [user, authLoading, roomCode]);

  // Load room details & join socket room
  useEffect(() => {
    if (!user || !roomCode) return;

    let isSubscribed = true;

    const initRoom = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await roomApi.getRoomByCode(roomCode);
        const roomData: Room = res.data.room;

        if (isSubscribed) {
          setRoom(roomData);
          setIsHost(roomData.host_id === user.user_id);

          // Fetch past messages
          try {
            const msgRes = await roomApi.getRoomMessages(roomData.room_id);
            setMessages(msgRes.data.messages || []);
          } catch (e) {}

          // Join immediately when connected; otherwise the connect handler joins once.
          if (socket.connected) {
            socket.emit('room:join', { roomCode, user });
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.response?.data?.error || 'Room not found. Please check your room code.');
        }
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    initRoom();

    // Socket Event Listeners
    const handlePresence = (data: { users: User[]; hostId: string }) => {
      setOnlineUsers(data.users);
      if (data.hostId && user) {
        setIsHost(data.hostId === user.user_id);
      }
    };

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleReaction = (reaction: { id: string; emoji: string; username: string }) => {
      const newReaction: FloatingReaction = {
        id: reaction.id,
        emoji: reaction.emoji,
        username: reaction.username,
        xOffset: 20 + Math.random() * 60, // random horizontal offset 20%-80%
      };

      setReactions((prev) => [...prev, newReaction]);

      // Remove after animation completes
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 2500);
    };

    const handleHostOnlyUpdated = (data: { hostOnlyControls: boolean }) => {
      setHostOnlyControls(data.hostOnlyControls);
    };

    const handleRoomError = (data: { message: string }) => {
      alert(data.message);
    };

    const handleSocketConnect = () => {
      socket.emit('room:join', { roomCode, user });
    };

    socket.on('room:presence', handlePresence);
    socket.on('chat:message', handleChatMessage);
    socket.on('reaction:receive', handleReaction);
    socket.on('room:host-only-updated', handleHostOnlyUpdated);
    socket.on('room:error', handleRoomError);
    socket.on('connect', handleSocketConnect);

    return () => {
      isSubscribed = false;
      socket.emit('room:leave');
      socket.off('room:presence', handlePresence);
      socket.off('chat:message', handleChatMessage);
      socket.off('reaction:receive', handleReaction);
      socket.off('room:host-only-updated', handleHostOnlyUpdated);
      socket.off('room:error', handleRoomError);
      socket.off('connect', handleSocketConnect);
    };
  }, [roomCode, user, socket]);

  // Send Reaction
  const handleSendReaction = (emoji: string) => {
    socket.emit('reaction:send', { emoji });
  };

  // Toggle Host-only controls
  const handleToggleHostOnly = () => {
    if (!isHost) return;
    const nextState = !hostOnlyControls;
    setHostOnlyControls(nextState);
    socket.emit('room:toggle-host-only', { hostOnlyControls: nextState });
  };

  // Submit Video Change
  const handleSubmitVideoChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;

    socket.emit('video:change', { videoUrl: newVideoUrl.trim() });
    setShowVideoModal(false);
    setNewVideoUrl('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center animate-spin mb-4">
          <Film className="w-6 h-6 text-rose-500" />
        </div>
        <p className="text-sm font-semibold text-white">Joining room {roomCode}...</p>
        <p className="text-xs text-gray-400 mt-1">Connecting to real-time sync engine</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <div className="p-8 max-w-md w-full glass-panel rounded-3xl border border-rose-500/20">
            <h2 className="text-xl font-bold text-rose-400 mb-2">Room Error</h2>
            <p className="text-xs text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0d14]">
      {/* Top Navbar with live code & invite link */}
      <Navbar roomCode={roomCode} onlineCount={onlineUsers.length} />

      {/* Main Cinema Theater Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        {/* Left Side: Cinema Stage & WebRTC Calls */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Room Header Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-2xl glass-card">
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>{room?.room_name}</span>
                {isHost && (
                  <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                    Host
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Host: <span className="text-gray-300 font-medium">{room?.host_username}</span> • Code:{' '}
                <span className="font-mono text-rose-300">{roomCode}</span>
              </p>
            </div>

            {/* Host Controls Toggle */}
            <div className="flex items-center gap-3">
              {isHost && (
                <button
                  onClick={handleToggleHostOnly}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
                    hostOnlyControls
                      ? 'bg-rose-600 text-white'
                      : 'bg-white/10 text-gray-300 hover:text-white'
                  }`}
                  title={
                    hostOnlyControls
                      ? 'Only you can control playback'
                      : 'All members can control playback'
                  }
                >
                  {hostOnlyControls ? (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  ) : (
                    <Shield className="w-3.5 h-3.5" />
                  )}
                  <span>{hostOnlyControls ? 'Host Controls Only' : 'Free Control'}</span>
                </button>
              )}

              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-rose-400 px-3 py-1.5 rounded-xl hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave</span>
              </button>
            </div>
          </div>

          {/* Video Player */}
          <VideoPlayer
            roomCode={roomCode}
            isHost={isHost}
            hostOnlyControls={hostOnlyControls}
            reactions={reactions}
            onVideoChangeRequest={() => setShowVideoModal(true)}
            initialVideoUrl={room?.current_video}
          />

          {/* WebRTC Video Call Grid */}
          {user && <WebRTCGrid currentUser={user} roomCode={roomCode} />}
        </div>

        {/* Right Side: Live Chat & Members Panel */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 h-[600px] lg:h-auto flex flex-col">
          {user && (
            <ChatPanel
              messages={messages}
              currentUser={user}
              roomCode={roomCode}
              onlineUsers={onlineUsers}
              onSendReaction={handleSendReaction}
            />
          )}
        </div>
      </main>

      {/* Modal: Change Video */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel max-w-md w-full p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Change Video</h2>
            <p className="text-xs text-gray-400 mb-5">
              Enter a YouTube link or direct MP4 video link.
            </p>

            <form onSubmit={handleSubmitVideoChange} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Video URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Presets */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">
                  Quick Presets:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setNewVideoUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
                  }
                  className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 truncate cursor-pointer"
                >
                  🎬 Big Buck Bunny (YouTube)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewVideoUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk')
                  }
                  className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 truncate cursor-pointer"
                >
                  🎵 Lofi Hip Hop Radio (YouTube)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewVideoUrl(
                      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
                    )
                  }
                  className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 truncate cursor-pointer"
                >
                  🎞️ Sintel Open Movie (Direct MP4)
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowVideoModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newVideoUrl.trim()}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  Sync New Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
