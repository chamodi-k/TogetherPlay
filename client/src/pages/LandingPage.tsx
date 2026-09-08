import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Users, Video, Heart, Shield, ArrowRight, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Navbar } from '../components/Navbar.tsx';

export const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/room/${joinCode.trim().toUpperCase()}`);
  };

  const handleStartRoom = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth?redirect=dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0d14]">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center relative overflow-hidden">
        {/* Ambient Glows */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-rose-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 left-1/4 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto z-10 flex flex-col items-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider mb-6 animate-pulse">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            Watch party reimagined for friends & couples
          </div>

          {/* Big Title */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-6">
            Watch together.{' '}
            <span className="bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 bg-clip-text text-transparent">
              Even when you're apart.
            </span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-gray-300 mb-10 leading-relaxed font-light">
            Synchronize YouTube, movies, and streams in real-time. Talk, react, and share smiles over
            crystal-clear WebRTC video calls and live chat.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md mb-12">
            <button
              onClick={handleStartRoom}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold px-7 py-3.5 rounded-2xl shadow-xl shadow-rose-600/30 hover:scale-105 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Create a Room</span>
            </button>

            {/* Quick Join Code Form */}
            <form onSubmit={handleJoinByCode} className="w-full sm:w-auto flex items-center gap-2">
              <input
                type="text"
                maxLength={8}
                placeholder="Enter Code (e.g. AB7X92)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full sm:w-44 bg-dark-800 border border-white/15 focus:border-rose-500 rounded-2xl px-4 py-3.5 text-sm uppercase tracking-wider font-mono text-center text-white placeholder-gray-500 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white p-3.5 rounded-2xl transition-colors cursor-pointer"
                title="Join Room"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full text-left mt-8">
            <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 mb-3">
                <Film className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Synchronized Playback</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Play, pause, seek, and sub-second clock drift correction across all devices.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">WebRTC Camera & Mic</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Peer-to-peer live video and voice calling right alongside your video stream.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3">
                <Heart className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Reactions & Chat</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Express yourself with floating hearts, live emoji reactions, and real-time room chat.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Private & Secure</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                6-character private invite codes, host-only permission controls, and Oracle/JWT security.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
