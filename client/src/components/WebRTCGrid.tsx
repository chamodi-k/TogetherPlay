import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Volume2, UserCheck } from 'lucide-react';
import { getSocket } from '../services/socket.ts';
import { User } from '../types/index.ts';

interface WebRTCGridProps {
  currentUser: User;
  roomCode: string;
}

interface PeerConnectionMap {
  [socketId: string]: RTCPeerConnection;
}

interface RemoteStreamMap {
  [socketId: string]: {
    stream: MediaStream;
    user: User;
  };
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const WebRTCGrid: React.FC<WebRTCGridProps> = ({ currentUser, roomCode }) => {
  const socket = getSocket();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [peers, setPeers] = useState<RemoteStreamMap>({});
  const peerConnections = useRef<PeerConnectionMap>({});
  const pendingCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const remoteMediaState = useRef<Record<string, { isMuted: boolean; isVideoOff: boolean }>>({});

  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [hasAudioAccess, setHasAudioAccess] = useState<boolean>(false);
  const [hasVideoAccess, setHasVideoAccess] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const reportMediaState = (muted: boolean, videoOff: boolean) => {
    if (socket.connected) {
      socket.emit('webrtc:media-state', {
        isMuted: muted,
        isVideoOff: videoOff,
      });
    }
  };

  // Initialize Local Media Stream
  const initLocalMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError('Camera is unavailable. Use HTTPS (or localhost) in a supported browser.');
      return;
    }

    setPermissionError(null);
    let stream: MediaStream;
    try {
      const tracks: MediaStreamTrack[] = [];
      let videoGranted = false;
      let audioGranted = false;

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 360 } },
        });
        tracks.push(...videoStream.getVideoTracks());
        videoGranted = true;
      } catch (err) {
        console.warn('Camera access not granted:', err);
      }

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tracks.push(...audioStream.getAudioTracks());
        audioGranted = true;
      } catch (err) {
        console.warn('Microphone access not granted:', err);
      }

      if (!tracks.length) {
        throw new DOMException('No media device permission', 'NotAllowedError');
      }

      stream = new MediaStream(tracks);
      setHasVideoAccess(videoGranted);
      setHasAudioAccess(audioGranted);
      setIsVideoOff(!videoGranted);
      setIsAudioMuted(!audioGranted);
      reportMediaState(!audioGranted, !videoGranted);
    } catch (err: any) {
      console.warn('Camera/microphone access not granted:', err?.message || err);
      setHasVideoAccess(false);
      setHasAudioAccess(false);
      const message = err?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow access in the browser address bar and try again.'
        : err?.name === 'NotFoundError'
          ? 'No camera or microphone was found on this device.'
          : 'Camera access failed. Check browser permissions and try again.';
      setPermissionError(message);
      reportMediaState(true, true);
      return;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // Replace existing senders where possible, then renegotiate newly added tracks.
    Object.entries(peerConnections.current).forEach(async ([targetSocketId, pc]) => {
      let needsNegotiation = false;
      stream.getTracks().forEach((track) => {
        const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
        if (sender) sender.replaceTrack(track).catch(() => {});
        else {
          pc.addTrack(track, stream);
          needsNegotiation = true;
        }
      });
      if (needsNegotiation && pc.signalingState === 'stable') {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', { toSocketId: targetSocketId, offer });
        } catch (err) {
          console.error('Error renegotiating media:', err);
        }
      }
    });
  };

  useEffect(() => {
    initLocalMedia();

    const reportCurrentMediaState = () => {
      reportMediaState(isAudioMuted, isVideoOff || !hasVideoAccess);
    };
    socket.on('connect', reportCurrentMediaState);

    return () => {
      socket.off('connect', reportCurrentMediaState);
      // Clean up local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Close all peer connections
      Object.values(peerConnections.current).forEach((pc) => pc.close());
    };
  }, []);

  // WebRTC Signaling Handlers
  useEffect(() => {
    // 1. Create WebRTC Peer Connection helper
    const createPeerConnection = (targetSocketId: string, remoteUser: User): RTCPeerConnection => {
      if (peerConnections.current[targetSocketId]) {
        return peerConnections.current[targetSocketId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnections.current[targetSocketId] = pc;

      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Send ICE candidates to peer via socket
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice-candidate', {
            toSocketId: targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle receiving remote stream tracks
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: {
            stream: remoteStream,
            user: { ...remoteUser, ...remoteMediaState.current[targetSocketId] },
          },
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          handlePeerDisconnect(targetSocketId);
        }
      };

      return pc;
    };

    const negotiate = async (targetSocketId: string, pc: RTCPeerConnection) => {
      if (pc.signalingState !== 'stable') return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', { toSocketId: targetSocketId, offer });
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    };

    const handlePeerDisconnect = (socketId: string) => {
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
      setPeers((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    };

    // Existing peers are announced for the new client, which owns offer creation.
    const handlePeerExisting = async ({ socketId, user }: { socketId: string; user: User }) => {
      const pc = createPeerConnection(socketId, user);
      await negotiate(socketId, pc);
    };

    // Keep the connection ready for an offer from an existing peer.
    const handlePeerJoined = async ({ socketId, user }: { socketId: string; user: User }) => {
      console.log(`[WebRTC] Peer joined: ${user.username} (${socketId})`);
      createPeerConnection(socketId, user);
    };

    // When receiving an offer from another peer, respond with an answer
    const handleOffer = async ({ fromSocketId, offer, user }: any) => {
      console.log(`[WebRTC] Received offer from ${user.username} (${fromSocketId})`);
      const pc = createPeerConnection(fromSocketId, user);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const queued = pendingCandidates.current[fromSocketId] || [];
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        delete pendingCandidates.current[fromSocketId];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:answer', {
          toSocketId: fromSocketId,
          answer,
        });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    };

    // When receiving an answer
    const handleAnswer = async ({ fromSocketId, answer }: any) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          const queued = pendingCandidates.current[fromSocketId] || [];
          for (const candidate of queued) await pc.addIceCandidate(candidate);
          delete pendingCandidates.current[fromSocketId];
        } catch (err) {
          console.error('Error setting remote description for answer:', err);
        }
      }
    };

    // When receiving ICE candidate
    const handleIceCandidate = async ({ fromSocketId, candidate }: any) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc && candidate && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      } else if (candidate) {
        pendingCandidates.current[fromSocketId] ||= [];
        pendingCandidates.current[fromSocketId].push(candidate);
      }
    };

    const handlePeerMediaChanged = ({ socketId, isMuted, isVideoOff }: { socketId: string; isMuted: boolean; isVideoOff: boolean }) => {
      remoteMediaState.current[socketId] = { isMuted, isVideoOff };
      setPeers((prev) => {
        const peer = prev[socketId];
        return peer
          ? { ...prev, [socketId]: { ...peer, user: { ...peer.user, isMuted, isVideoOff } } }
          : prev;
      });
    };

    const handlePeerLeft = ({ socketId }: { socketId: string }) => {
      handlePeerDisconnect(socketId);
    };

    socket.on('webrtc:peer-existing', handlePeerExisting);
    socket.on('webrtc:peer-joined', handlePeerJoined);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('webrtc:peer-left', handlePeerLeft);
    socket.on('webrtc:peer-media-changed', handlePeerMediaChanged);

    return () => {
      socket.off('webrtc:peer-existing', handlePeerExisting);
      socket.off('webrtc:peer-joined', handlePeerJoined);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('webrtc:peer-left', handlePeerLeft);
      socket.off('webrtc:peer-media-changed', handlePeerMediaChanged);
    };
  }, [socket]);

  // Media Toggles
  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) {
      void initLocalMedia();
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    setIsAudioMuted(!audioTrack.enabled);
    socket.emit('webrtc:media-state', {
      isMuted: !audioTrack.enabled,
      isVideoOff,
    });
  };

  const toggleVideo = () => {
    if (!localStreamRef.current || !localStreamRef.current.getVideoTracks()[0]) {
      void initLocalMedia();
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
      socket.emit('webrtc:media-state', {
        isMuted: isAudioMuted,
        isVideoOff: !videoTrack.enabled,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl glass-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300">Live Video Call</span>
          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30">
            WebRTC P2P
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Toggle */}
          <button
            onClick={toggleAudio}
            title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isAudioMuted
                ? 'bg-rose-600/80 text-white hover:bg-rose-600'
                : 'bg-white/10 hover:bg-white/20 text-emerald-400'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={toggleVideo}
            title={
              !hasVideoAccess
                ? 'Allow Camera'
                : isVideoOff
                  ? 'Turn Video On'
                  : 'Turn Video Off'
            }
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isVideoOff || !hasVideoAccess
                ? 'bg-rose-600/80 text-white hover:bg-rose-600'
                : 'bg-white/10 hover:bg-white/20 text-emerald-400'
            }`}
          >
            {isVideoOff || !hasVideoAccess ? (
              <VideoOff className="w-4 h-4" />
            ) : (
              <Video className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {permissionError && (
        <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-center justify-between">
          <span>{permissionError}</span>
          <button
            onClick={initLocalMedia}
            className="text-xs text-white underline ml-2 cursor-pointer"
          >
            Allow Camera
          </button>
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Local Stream (You) */}
        <div className="relative rounded-xl overflow-hidden aspect-video bg-dark-800 border border-white/10 flex items-center justify-center group shadow-md">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 ${
              isVideoOff || !hasVideoAccess ? 'hidden' : 'block'
            }`}
          />

          {(isVideoOff || !hasVideoAccess) && (
            <div className="flex flex-col items-center justify-center p-2">
              <img
                src={currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.username}`}
                alt={currentUser.username}
                className="w-10 h-10 rounded-full border border-rose-500/40 mb-1"
              />
              <span className="text-[11px] text-gray-400">Camera Off</span>
            </div>
          )}

          {/* Badge */}
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-white">
            <span>You</span>
            {isAudioMuted && <MicOff className="w-3 h-3 text-rose-400" />}
          </div>
        </div>

        {/* Remote Peers Streams */}
        {Object.entries(peers).map(([peerId, { stream, user }]) => (
          <RemoteVideoTile key={peerId} stream={stream} user={user} />
        ))}

        {/* If no peers yet, show waiting card */}
        {Object.keys(peers).length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 aspect-video flex flex-col items-center justify-center p-2 text-center text-gray-400 bg-white/5">
            <span className="text-xl mb-1">👥</span>
            <span className="text-[11px] font-medium text-gray-300">Invite a partner</span>
            <span className="text-[10px] text-gray-400">Share your room link</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Remote Video Tile Subcomponent
const RemoteVideoTile: React.FC<{ stream: MediaStream; user: User }> = ({ stream, user }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-xl overflow-hidden aspect-video bg-dark-800 border border-white/10 flex items-center justify-center shadow-md">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${user.isVideoOff ? 'hidden' : 'block'}`}
      />
      {user.isVideoOff && (
        <div className="flex flex-col items-center justify-center p-2">
          <img
            src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
            alt={user.username}
            className="w-10 h-10 rounded-full border border-rose-500/40 mb-1"
          />
          <span className="text-[11px] text-gray-400">Camera Off</span>
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] text-white">
        <span>{user.username}</span>
        {user.isMuted && <MicOff className="w-3 h-3 text-rose-400" />}
      </div>
    </div>
  );
};
