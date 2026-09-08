import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogIn, Clock, Users, Play, Radio, Lock, Globe, Film, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Navbar } from '../components/Navbar.tsx';
import { roomApi } from '../services/api.ts';
import { Room, WatchHistoryItem } from '../types/index.ts';

const SAMPLE_VIDEOS = [
  {
    title: 'Blender Studio — Big Buck Bunny (Animation)',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  },
  {
    title: 'Lofi Hip Hop Radio — Beats to relax/study to',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  },
  {
    title: 'Sintel — Open Movie by Blender Foundation',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

export const DashboardPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Form State
  const [roomName, setRoomName] = useState('Movie Night');
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private');
  const [maxUsers, setMaxUsers] = useState(10);
  const [selectedVideo, setSelectedVideo] = useState(SAMPLE_VIDEOS[0].url);
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    if (user) {
      fetchDashboardData();
    }
  }, [user, authLoading]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [roomsRes, historyRes] = await Promise.all([
        roomApi.getMyRooms(),
        roomApi.getWatchHistory(),
      ]);
      setRooms(roomsRes.data.rooms || []);
      setHistory(historyRes.data.history || []);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    const videoToUse = customVideoUrl.trim() || selectedVideo;

    try {
      const res = await roomApi.createRoom({
        room_name: roomName,
        privacy,
        max_users: maxUsers,
        initial_video: videoToUse,
      });

      const newRoom = res.data.room;
      setShowCreateModal(false);
      navigate(`/room/${newRoom.room_code}`);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create room. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    navigate(`/room/${joinCodeInput.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0d14]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl glass-panel border border-white/10 relative overflow-hidden mb-10 shadow-2xl">
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-300 text-xs font-semibold mb-2 border border-rose-500/20">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              Watch Party Central
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Welcome back, <span className="text-rose-400">{user?.username}</span> 👋
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-xl">
              Host a new synchronized theater room, join your friends with a room code, or continue
              watching from where you left off.
            </p>
          </div>

          <div className="flex items-center gap-3 z-10">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-2xl shadow-lg shadow-rose-600/30 hover:scale-105 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Room</span>
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 text-white text-xs sm:text-sm font-semibold px-5 py-3 rounded-2xl border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-rose-400" />
              <span>Join Room</span>
            </button>
          </div>
        </div>

        {/* Content Grids */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: My Rooms */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-rose-400" />
                Your Recent Rooms
              </h2>
              <span className="text-xs text-gray-400">{rooms.length} rooms</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-gray-400 glass-card rounded-2xl">
                Loading rooms...
              </div>
            ) : rooms.length === 0 ? (
              <div className="p-10 text-center glass-card rounded-3xl border border-dashed border-white/10 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400 mb-3">
                  <Film className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-gray-200">No watch rooms yet</p>
                <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
                  Create your first room to watch movies or videos synchronized with your partner and
                  friends.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  + Create Your First Room
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rooms.map((room) => (
                  <div
                    key={room.room_id}
                    className="p-5 rounded-2xl glass-card border border-white/5 hover:border-rose-500/30 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                          {room.room_code}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          {room.privacy === 'private' ? (
                            <Lock className="w-3 h-3 text-amber-400" />
                          ) : (
                            <Globe className="w-3 h-3 text-emerald-400" />
                          )}
                          <span className="capitalize">{room.privacy}</span>
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-rose-300 transition-colors line-clamp-1">
                        {room.room_name}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                        <span>Host: {room.host_username || 'You'}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> Max {room.max_users}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">
                        {new Date(room.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => navigate(`/room/${room.room_code}`)}
                        className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Join Room</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Col: Watch History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Continue Watching
              </h2>
            </div>

            {history.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 glass-card rounded-2xl">
                No watch history yet. Join a room and play a video!
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.history_id}
                    className="p-3.5 rounded-2xl glass-card border border-white/5 hover:border-white/20 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {item.video_title || 'TogetherPlay Video'}
                      </p>
                      <p className="text-[10px] text-rose-300 font-mono mt-0.5">
                        Stopped at: {Math.floor(item.last_position / 60)}:
                        {String(Math.floor(item.last_position % 60)).padStart(2, '0')}
                      </p>
                    </div>
                    {item.room_id && (
                      <button
                        onClick={() => navigate(`/room/${item.room_id}`)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer shrink-0"
                        title="Resume in Room"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Create Room */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-white/15 shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-1">Create a Watch Room</h2>
            <p className="text-xs text-gray-400 mb-6">
              Configure room privacy and pick your starting video.
            </p>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs mb-4">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Room Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ❤️ Movie Night with Sarah"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Privacy</label>
                  <select
                    value={privacy}
                    onChange={(e: any) => setPrivacy(e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="private">Private (Invite Link / Code)</option>
                    <option value="public">Public Room</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Max Users</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(parseInt(e.target.value) || 10)}
                    className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Choose Starting Video
                </label>
                <div className="space-y-2 mb-3">
                  {SAMPLE_VIDEOS.map((vid) => (
                    <label
                      key={vid.url}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        selectedVideo === vid.url
                          ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                          : 'border-white/5 bg-dark-900/50 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="videoSelection"
                        checked={selectedVideo === vid.url && !customVideoUrl}
                        onChange={() => {
                          setSelectedVideo(vid.url);
                          setCustomVideoUrl('');
                        }}
                        className="accent-rose-500"
                      />
                      <span className="truncate">{vid.title}</span>
                    </label>
                  ))}
                </div>

                <label className="block text-[11px] text-gray-400 mb-1">
                  Or paste YouTube / MP4 direct URL:
                </label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={customVideoUrl}
                  onChange={(e) => setCustomVideoUrl(e.target.value)}
                  className="w-full bg-dark-900 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  {creating ? 'Creating Room...' : 'Launch Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Join Room by Code */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="glass-panel max-w-sm w-full p-6 rounded-3xl border border-white/15 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Join Room</h2>
            <p className="text-xs text-gray-400 mb-5">Enter the 6-character room code:</p>

            <form onSubmit={handleJoinByCode} className="space-y-4">
              <input
                type="text"
                autoFocus
                maxLength={8}
                placeholder="e.g. AB7X92"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                className="w-full bg-dark-900 border border-white/15 focus:border-rose-500 rounded-xl p-3 text-center text-sm font-mono tracking-widest uppercase text-white placeholder-gray-500 focus:outline-none transition-colors"
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCodeInput.trim()}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  Join Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
