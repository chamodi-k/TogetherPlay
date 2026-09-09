import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Radio, AlertCircle } from 'lucide-react';
import { getSocket } from '../services/socket.ts';
import { ReactionsOverlay } from './ReactionsOverlay.tsx';
import { FloatingReaction } from '../types/index.ts';

interface VideoPlayerProps {
  roomCode: string;
  isHost: boolean;
  hostOnlyControls: boolean;
  reactions: FloatingReaction[];
  initialVideoUrl?: string;
  onVideoChangeRequest: () => void;
}

// Helper: Extract YouTube ID
function extractYouTubeId(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url.match(/^https?:\/\//i) ? url : `https://${url}`);
    let id = parsed.searchParams.get('v');

    if (parsed.hostname === 'youtu.be') {
      id = parsed.pathname.slice(1);
    } else if (parsed.pathname.startsWith('/embed/')) {
      id = parsed.pathname.split('/')[2];
    } else if (parsed.pathname.startsWith('/shorts/')) {
      id = parsed.pathname.split('/')[2];
    }

    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isDirectMediaUrl(url: string): boolean {
  try {
    return /\.(mp4|webm|ogg|m4v)(?:$|\/)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  roomCode,
  isHost,
  hostOnlyControls,
  reactions,
  initialVideoUrl,
  onVideoChangeRequest,
}) => {
  const socket = getSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  const youtubeContainerRef = useRef<HTMLDivElement>(null);
  const html5VideoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);

  const [videoUrl, setVideoUrl] = useState<string>(
    initialVideoUrl || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [driftNotification, setDriftNotification] = useState<string | null>(null);

  // Flags to prevent echo loops when receiving remote socket events
  const isRemoteAction = useRef<boolean>(false);
  const youtubeReady = useRef<boolean>(false);
  const videoUrlRef = useRef<string>(initialVideoUrl || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  const pendingSyncRef = useRef<{ currentTime: number; isPlaying: boolean } | null>(null);
  const [mediaLoading, setMediaLoading] = useState<boolean>(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const youtubeId = extractYouTubeId(videoUrl);
  const directMedia = !youtubeId && isDirectMediaUrl(videoUrl);

  useEffect(() => {
    if (initialVideoUrl && initialVideoUrl !== videoUrl) {
      videoUrlRef.current = initialVideoUrl;
      setVideoUrl(initialVideoUrl);
    }
  }, [initialVideoUrl]);

  useEffect(() => {
    videoUrlRef.current = videoUrl;
    setMediaLoading(true);
    setMediaError(youtubeId || directMedia ? null : 'Enter a valid YouTube URL or a direct MP4/WebM URL.');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [videoUrl, youtubeId, directMedia]);
  // Load YouTube Iframe API once
  useEffect(() => {
    if (
      youtubeId &&
      !(window as any).YT &&
      !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    ) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, [youtubeId]);

  // Initialize or update YouTube Player
  useEffect(() => {
    if (!youtubeId) return;

    const initYT = () => {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(youtubeId);
        return;
      }

      const playerElement = youtubeContainerRef.current;
      if (!playerElement) return;

      ytPlayerRef.current = new (window as any).YT.Player(playerElement, {
        videoId: youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            youtubeReady.current = true;
            setMediaLoading(false);
            setMediaError(null);
            ytPlayerRef.current.setVolume(volume * 100);
            setDuration(ytPlayerRef.current.getDuration() || 0);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (isRemoteAction.current) return;

            if (event.data === 1 && !isPlaying) {
              if (hostOnlyControls && !isHost) {
                ytPlayerRef.current.pauseVideo();
                return;
              }
              const time = ytPlayerRef.current.getCurrentTime();
              socket.emit('video:play', { currentTime: time });
            } else if (event.data === 2 && isPlaying) {
              if (hostOnlyControls && !isHost) {
                ytPlayerRef.current.playVideo();
                return;
              }
              const time = ytPlayerRef.current.getCurrentTime();
              socket.emit('video:pause', { currentTime: time });
            }
          },
          onError: () => {
            setMediaLoading(false);
            setMediaError('YouTube could not play this video. Check that the URL is valid and embeddable.');
          },
        },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initYT();
    } else {
      const previousReadyHandler = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        previousReadyHandler?.();
        initYT();
      };
    }

    return () => {
      youtubeReady.current = false;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
    };
  }, [youtubeId]);

  // Update progress timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          const t = ytPlayerRef.current.getCurrentTime();
          const d = ytPlayerRef.current.getDuration();
          if (t !== undefined) setCurrentTime(t);
          if (d !== undefined && d > 0) setDuration(d);
        } catch (e) {}
      } else if (html5VideoRef.current) {
        setCurrentTime(html5VideoRef.current.currentTime);
        setDuration(html5VideoRef.current.duration || 0);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [youtubeId]);

  // Socket event listeners for Video Synchronization
  useEffect(() => {
    // 1. Initial Sync on join (Phase 9)
    const handleSync = (data: any) => {
      console.log('🔄 Initial Video Sync received:', data);
      if (data.videoUrl && data.videoUrl !== videoUrl) {
        videoUrlRef.current = data.videoUrl;
        setVideoUrl(data.videoUrl);
      }

      isRemoteAction.current = true;
      const targetTime = data.currentTime || 0;

      if (data.videoUrl && data.videoUrl !== videoUrl) {
        pendingSyncRef.current = { currentTime: targetTime, isPlaying: Boolean(data.isPlaying) };
        setIsPlaying(Boolean(data.isPlaying));
        setCurrentTime(targetTime);
        window.setTimeout(() => {
          isRemoteAction.current = false;
        }, 600);
        return;
      }

      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          ytPlayerRef.current.seekTo(targetTime, true);
          if (data.isPlaying) {
            ytPlayerRef.current.playVideo();
          } else {
            ytPlayerRef.current.pauseVideo();
          }
        } catch (e) {}
      } else if (html5VideoRef.current) {
        html5VideoRef.current.currentTime = targetTime;
        if (data.isPlaying) {
          html5VideoRef.current.play().catch(() => {});
        } else {
          html5VideoRef.current.pause();
        }
      }

      setIsPlaying(data.isPlaying);
      setCurrentTime(targetTime);
      setTimeout(() => {
        isRemoteAction.current = false;
      }, 600);
    };

    // 2. Play Event (Phase 8)
    const handlePlay = (data: any) => {
      console.log('▶️ Remote Play Event:', data);
      isRemoteAction.current = true;
      setIsPlaying(true);

      const targetTime = data.currentTime;
      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          if (Math.abs(ytPlayerRef.current.getCurrentTime() - targetTime) > 0.75) {
            ytPlayerRef.current.seekTo(targetTime, true);
          }
          ytPlayerRef.current.playVideo();
        } catch (e) {}
      } else if (html5VideoRef.current) {
        if (Math.abs(html5VideoRef.current.currentTime - targetTime) > 0.75) {
          html5VideoRef.current.currentTime = targetTime;
        }
        html5VideoRef.current.play().catch(() => {});
      }

      setTimeout(() => {
        isRemoteAction.current = false;
      }, 500);
    };

    // 3. Pause Event (Phase 8)
    const handlePause = (data: any) => {
      console.log('⏸️ Remote Pause Event:', data);
      isRemoteAction.current = true;
      setIsPlaying(false);

      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          ytPlayerRef.current.pauseVideo();
          if (data.currentTime !== undefined) {
            ytPlayerRef.current.seekTo(data.currentTime, true);
          }
        } catch (e) {}
      } else if (html5VideoRef.current) {
        html5VideoRef.current.pause();
        if (data.currentTime !== undefined) {
          html5VideoRef.current.currentTime = data.currentTime;
        }
      }

      setTimeout(() => {
        isRemoteAction.current = false;
      }, 500);
    };

    // 4. Seek Event (Phase 8)
    const handleSeek = (data: any) => {
      console.log('⏩ Remote Seek Event:', data);
      isRemoteAction.current = true;
      setCurrentTime(data.targetTime);

      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          ytPlayerRef.current.seekTo(data.targetTime, true);
        } catch (e) {}
      } else if (html5VideoRef.current) {
        html5VideoRef.current.currentTime = data.targetTime;
      }

      setTimeout(() => {
        isRemoteAction.current = false;
      }, 500);
    };

    // 5. Change Video (Phase 7 & 8)
    const handleChange = (data: any) => {
      console.log('🎬 Remote Video Change:', data);
      videoUrlRef.current = data.videoUrl;
      setVideoUrl(data.videoUrl);
      setCurrentTime(0);
      setIsPlaying(false);
    };

    // 6. Clock Drift Correction (Phase 10)
    const handleHeartbeat = (data: any) => {
      if (!data.isPlaying) return;

      let localTime = 0;
      if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
        try {
          localTime = ytPlayerRef.current.getCurrentTime();
        } catch (e) {}
      } else if (html5VideoRef.current) {
        localTime = html5VideoRef.current.currentTime;
      }

      const drift = Math.abs(localTime - data.currentTime);

      // If drift is small (0.5s - 1.5s), gradually correct without hard-seeking
      if (drift > 0.5 && drift <= 1.5) {
        setDriftNotification(`Drift ${(drift * 1000).toFixed(0)}ms: fine-tuning`);
        if (html5VideoRef.current) {
          html5VideoRef.current.playbackRate = localTime < data.currentTime ? 1.05 : 0.95;
          setTimeout(() => {
            if (html5VideoRef.current) html5VideoRef.current.playbackRate = 1.0;
            setDriftNotification(null);
          }, 1500);
        }
      } else if (drift > 1.5) {
        // Severe drift: hard resync
        setDriftNotification(`Resyncing (${(drift * 1000).toFixed(0)}ms drift)...`);
        isRemoteAction.current = true;
        if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
          try {
            ytPlayerRef.current.seekTo(data.currentTime, true);
          } catch (e) {}
        } else if (html5VideoRef.current) {
          html5VideoRef.current.currentTime = data.currentTime;
        }
        setTimeout(() => {
          isRemoteAction.current = false;
          setDriftNotification(null);
        }, 800);
      }
    };

    socket.on('video:sync', handleSync);
    socket.on('video:play', handlePlay);
    socket.on('video:pause', handlePause);
    socket.on('video:seek', handleSeek);
    socket.on('video:change', handleChange);
    socket.on('video:heartbeat', handleHeartbeat);

    // Periodic Heartbeat request for drift check (Phase 10)
    const driftInterval = setInterval(() => {
      socket.emit('video:ping-sync');
    }, 4000);

    return () => {
      socket.off('video:sync', handleSync);
      socket.off('video:play', handlePlay);
      socket.off('video:pause', handlePause);
      socket.off('video:seek', handleSeek);
      socket.off('video:change', handleChange);
      socket.off('video:heartbeat', handleHeartbeat);
      clearInterval(driftInterval);
    };
  }, [socket, videoUrl, youtubeId]);

  useEffect(() => {
    if (youtubeId || !html5VideoRef.current || !directMedia) return;

    const element = html5VideoRef.current;
    const handleLoaded = () => {
      setMediaLoading(false);
      setMediaError(null);
      setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    };
    const handleError = () => {
      setMediaLoading(false);
      setMediaError('This direct video URL could not be loaded. Use a public MP4 or WebM URL.');
    };

    element.addEventListener('loadedmetadata', handleLoaded);
    element.addEventListener('canplay', handleLoaded);
    element.addEventListener('error', handleError);
    element.load();

    return () => {
      element.pause();
      element.removeEventListener('loadedmetadata', handleLoaded);
      element.removeEventListener('canplay', handleLoaded);
      element.removeEventListener('error', handleError);
    };
  }, [videoUrl, youtubeId, directMedia]);

  // Apply a queued initial sync after a newly selected source is ready.
  useEffect(() => {
    if (!pendingSyncRef.current || mediaLoading || mediaError) return;
    const pending = pendingSyncRef.current;
    pendingSyncRef.current = null;
    isRemoteAction.current = true;
    const target = pending.currentTime;
    if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
      ytPlayerRef.current.seekTo(target, true);
      pending.isPlaying ? ytPlayerRef.current.playVideo() : ytPlayerRef.current.pauseVideo();
    } else if (html5VideoRef.current) {
      html5VideoRef.current.currentTime = target;
      if (pending.isPlaying) html5VideoRef.current.play().catch(() => {
        setMediaError('Playback was blocked. Press play to start the video.');
      });
      else html5VideoRef.current.pause();
    }
    setCurrentTime(target);
    setIsPlaying(pending.isPlaying);
    window.setTimeout(() => {
      isRemoteAction.current = false;
    }, 600);
  }, [mediaLoading, mediaError, youtubeId]);

  // Local Controls Handlers
  const applyLocalPlayback = (playing: boolean, time = currentTime) => {
    isRemoteAction.current = true;
    if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
      if (Math.abs(ytPlayerRef.current.getCurrentTime() - time) > 0.75) {
        ytPlayerRef.current.seekTo(time, true);
      }
      if (playing) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    } else if (html5VideoRef.current) {
      html5VideoRef.current.currentTime = time;
      if (playing) {
        html5VideoRef.current.play().catch(() => {
          setMediaError('Playback was blocked. Press play to start the video.');
        });
      } else {
        html5VideoRef.current.pause();
      }
    }
    setIsPlaying(playing);
    setCurrentTime(time);
    window.setTimeout(() => {
      isRemoteAction.current = false;
    }, 500);
  };

  const handleTogglePlay = () => {
    if (hostOnlyControls && !isHost) {
      alert('Only the room host has playback controls enabled.');
      return;
    }

    applyLocalPlayback(!isPlaying);
    socket.emit(isPlaying ? 'video:pause' : 'video:play', { currentTime });
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hostOnlyControls && !isHost) return;
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    isRemoteAction.current = true;
    if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
      ytPlayerRef.current.seekTo(target, true);
    } else if (html5VideoRef.current) {
      html5VideoRef.current.currentTime = target;
    }
    socket.emit('video:seek', { targetTime: target });
    window.setTimeout(() => {
      isRemoteAction.current = false;
    }, 400);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);

    if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
      try {
        ytPlayerRef.current.setVolume(val * 100);
      } catch (e) {}
    } else if (html5VideoRef.current) {
      html5VideoRef.current.volume = val;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (youtubeId && ytPlayerRef.current && youtubeReady.current) {
      try {
        if (nextMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch (e) {}
    } else if (html5VideoRef.current) {
      html5VideoRef.current.muted = nextMuted;
    }
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden bg-black aspect-video shadow-2xl border border-white/10 flex flex-col group"
    >
      {/* Drift / Sync Notification Badge */}
      {driftNotification && (
        <div className="absolute top-4 left-4 z-40 bg-rose-600/90 text-white text-xs px-3 py-1 rounded-full shadow-lg backdrop-blur-md animate-pulse flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" />
          {driftNotification}
        </div>
      )}

      {/* Floating Reactions Overlay (Phase 13) */}
      <ReactionsOverlay reactions={reactions} />

      {/* Video Content Container */}
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        {youtubeId ? (
          <div
            ref={youtubeContainerRef}
            key={youtubeId}
            className="w-full h-full pointer-events-none [&>iframe]:w-full [&>iframe]:h-full"
          />
        ) : (
          <video
            ref={html5VideoRef}
            src={directMedia ? videoUrl : undefined}
            className="w-full h-full object-contain"
            playsInline
            onLoadedMetadata={() => {
              setMediaLoading(false);
              setMediaError(null);
            }}
            onError={() => {
              setMediaLoading(false);
              setMediaError('This direct video URL could not be loaded. Use a public MP4 or WebM URL.');
            }}
            onEnded={() => setIsPlaying(false)}
          />
        )}

        {mediaLoading && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
            Loading video...
          </div>
        )}
        {mediaError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center bg-black/75 text-rose-200 text-sm">
            <AlertCircle className="w-7 h-7 text-rose-400" />
            <span>{mediaError}</span>
          </div>
        )}

        {/* Big Clickable Overlay to toggle play/pause */}
        <div
          onClick={handleTogglePlay}
          className="absolute inset-0 cursor-pointer flex items-center justify-center bg-transparent group-hover:bg-black/20 transition-colors"
        >
          {!isPlaying && (
            <div className="w-16 h-16 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 ml-1 fill-current" />
            </div>
          )}
        </div>
      </div>

      {/* Video Control Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-95 group-hover:opacity-100 transition-opacity z-30">
        {/* Progress Slider */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-mono text-gray-300 w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeekChange}
            disabled={hostOnlyControls && !isHost}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500 hover:h-2 transition-all disabled:opacity-50"
          />
          <span className="text-xs font-mono text-gray-400 w-10">
            {formatTime(duration)}
          </span>
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePlay}
              disabled={hostOnlyControls && !isHost}
              className="p-2 rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer disabled:opacity-40"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleMute}
                className="p-1.5 text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Change Video Button */}
            <button
              onClick={onVideoChangeRequest}
              disabled={hostOnlyControls && !isHost}
              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-40"
              title="Change Video Source"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Change Video</span>
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={handleFullscreen}
              className="p-2 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Fullscreen"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
