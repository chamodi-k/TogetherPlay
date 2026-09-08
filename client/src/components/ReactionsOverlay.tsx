import React, { useEffect, useState } from 'react';
import { FloatingReaction } from '../types/index.ts';

interface ReactionsOverlayProps {
  reactions: FloatingReaction[];
}

export const ReactionsOverlay: React.FC<ReactionsOverlayProps> = ({ reactions }) => {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-6 flex flex-col items-center animate-float-up pointer-events-none"
          style={{
            left: `${r.xOffset ?? 50}%`,
            transition: 'all 2s ease-out',
          }}
        >
          <span className="text-4xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] filter select-none">
            {r.emoji}
          </span>
          {r.username && (
            <span className="text-[10px] bg-black/60 backdrop-blur-sm text-rose-200 px-2 py-0.5 rounded-full mt-1 border border-white/10 font-medium">
              {r.username}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
