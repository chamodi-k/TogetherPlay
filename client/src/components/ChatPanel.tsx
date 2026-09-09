import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Users } from 'lucide-react';
import { ChatMessage, User } from '../types/index.ts';
import { getSocket } from '../services/socket.ts';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUser: User;
  roomCode: string;
  onlineUsers: User[];
  onSendReaction: (emoji: string) => void;
}

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '😮', '👏', '🍿'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentUser,
  roomCode,
  onlineUsers,
  onSendReaction,
}) => {
  const socket = getSocket();
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'users'>('chat');
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (!socket.connected) {
      setSendError('Reconnecting to the room...');
      socket.connect();
      return;
    }

    socket.emit('chat:send', { content: inputText.trim() });
    setInputText('');
    setSendError(null);
  };

  useEffect(() => {
    const handleChatError = (data: { message: string }) => {
      setSendError(data.message);
    };

    socket.on('chat:error', handleChatError);
    return () => {
      socket.off('chat:error', handleChatError);
    };
  }, [socket]);

  const formatMessageTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full rounded-2xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 bg-dark-800/60">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Live Chat
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Online ({onlineUsers.length})</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                <Smile className="w-8 h-8 mb-2 opacity-50 text-rose-400" />
                <p className="text-xs">No messages yet.</p>
                <p className="text-[11px] text-gray-400">Say hi to start the party! 🎉</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.user_id === currentUser.user_id;
                return (
                  <div
                    key={msg.message_id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400">
                      <span className="font-medium text-gray-300">{isMe ? 'You' : msg.username}</span>
                      <span>•</span>
                      <span>{formatMessageTime(msg.created_at)}</span>
                    </div>

                    <div
                      className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs break-words shadow-sm ${
                        isMe
                          ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-br-none'
                          : 'bg-dark-700/80 text-gray-100 border border-white/10 rounded-bl-none'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reaction Bar */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/5 bg-black/20 overflow-x-auto">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mr-1">
              React:
            </span>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSendReaction(emoji)}
                className="hover:scale-125 transition-transform p-1 text-base cursor-pointer select-none"
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 bg-dark-800/80">
            {sendError && <p className="text-[10px] text-amber-400 mb-2">{sendError}</p>}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-dark-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white p-2 rounded-xl transition-colors cursor-pointer shadow-lg shadow-rose-600/30"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Online Users List Tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {onlineUsers.map((u) => (
            <div
              key={u.socketId || u.user_id}
              className="flex items-center justify-between p-2 rounded-xl bg-dark-700/50 border border-white/5"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                    alt={u.username}
                    className="w-8 h-8 rounded-full border border-rose-500/30"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-dark-800"></span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-200">
                    {u.username} {u.user_id === currentUser.user_id && '(You)'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
