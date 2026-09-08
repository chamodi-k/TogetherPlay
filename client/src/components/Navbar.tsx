import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Film, Copy, Check, LogOut, User as UserIcon, Plus, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface NavbarProps {
  roomCode?: string;
  onlineCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ roomCode, onlineCount }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-rose-100 to-rose-400 bg-clip-text text-transparent">
              Together<span className="text-rose-500">Play</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-widest text-rose-400/80 ml-2 px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
              Live
            </span>
          </div>
        </Link>

        {/* Room Code Badge (if in room) */}
        {roomCode && (
          <div className="flex items-center gap-3 bg-dark-800/90 border border-rose-500/30 px-3 py-1.5 rounded-full shadow-inner">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-mono font-bold text-rose-300">ROOM: {roomCode}</span>
            </div>
            {onlineCount !== undefined && (
              <span className="text-xs text-gray-400 border-l border-white/10 pl-2">
                👥 {onlineCount} online
              </span>
            )}
            <button
              onClick={handleCopyLink}
              title="Copy Room Invite Link"
              className="flex items-center gap-1 text-xs bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Invite'}</span>
            </button>
          </div>
        )}

        {/* Right Navigation */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {location.pathname !== '/dashboard' && (
                <Link
                  to="/dashboard"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <Home className="w-4 h-4 text-gray-400" />
                  Dashboard
                </Link>
              )}

              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <img
                  src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
                  alt={user.username}
                  className="w-8 h-8 rounded-full border border-rose-500/40 bg-dark-700"
                />
                <span className="hidden md:inline-block text-sm font-medium text-gray-200">
                  {user.username}
                </span>

                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <Link
              to="/auth"
              className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-lg shadow-rose-600/25 transition-all"
            >
              <UserIcon className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
