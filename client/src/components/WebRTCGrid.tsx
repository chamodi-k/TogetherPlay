import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { getSocket } from '../services/socket.ts';
import { User } from '../types/index.ts';

interface Props { currentUser: User; roomCode: string; }
interface Peer { pc: RTCPeerConnection; user: User; makingOffer: boolean; }
interface Remote { stream: MediaStream; user: User; }

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const WebRTCGrid: React.FC<Props> = ({ currentUser }) => {
  const socket = getSocket();
  const localVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Record<string, Peer>>({});
  const queuedIce = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const mediaState = useRef<Record<string, Partial<User>>>({});
  const [remote, setRemote] = useState<Record<string, Remote>>({});
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [videoAccess, setVideoAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const announceMedia = (isMuted: boolean, isVideoOff: boolean) => {
    if (socket.connected) socket.emit('webrtc:media-state', { isMuted, isVideoOff });
  };

  const removePeer = (id: string) => {
    peers.current[id]?.pc.close();
    delete peers.current[id];
    delete queuedIce.current[id];
    delete mediaState.current[id];
    setRemote((old) => { const next = { ...old }; delete next[id]; return next; });
  };

  const flushIce = async (id: string, pc: RTCPeerConnection) => {
    const candidates = queuedIce.current[id] || [];
    delete queuedIce.current[id];
    for (const candidate of candidates) await pc.addIceCandidate(candidate);
  };

  const createPeer = (id: string, user: User) => {
    const existing = peers.current[id];
    if (existing) { existing.user = { ...existing.user, ...user }; return existing; }
    const pc = new RTCPeerConnection(rtcConfig);
    const peer: Peer = { pc, user, makingOffer: false };
    peers.current[id] = peer;
    localStream.current?.getTracks().forEach((track) => pc.addTrack(track, localStream.current!));
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc:ice-candidate', {
        toSocketId: id, candidate: event.candidate,
      });
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemote((old) => ({ ...old, [id]: {
        stream, user: { ...peer.user, ...mediaState.current[id] },
      } }));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') removePeer(id);
    };
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable' || peer.makingOffer) return;
      peer.makingOffer = true;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        socket.emit('webrtc:offer', { toSocketId: id, offer: pc.localDescription });
      } catch (err) { console.error('[WebRTC] offer failed', err); }
      peer.makingOffer = false;
    };
    return peer;
  };

  const setLocalStream = async (stream: MediaStream) => {
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    for (const peer of Object.values(peers.current)) {
      for (const track of stream.getTracks()) {
        const sender = peer.pc.getSenders().find((item) => item.track?.kind === track.kind);
        if (sender) await sender.replaceTrack(track); else peer.pc.addTrack(track, stream);
      }
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is unavailable. Use HTTPS or localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => { track.enabled = true; });
      await setLocalStream(stream);
      setVideoAccess(stream.getVideoTracks().length > 0);
      setVideoOff(false); setMuted(false); setError(null); announceMedia(false, false);
    } catch (err: any) {
      setVideoAccess(false); setVideoOff(true); setMuted(true);
      setError(err?.name === 'NotAllowedError'
        ? 'Camera and microphone permission was denied. Allow access in the browser address bar and try again.'
        : err?.name === 'NotFoundError'
          ? 'No camera or microphone was found on this device.'
          : 'Camera and microphone access failed. Check browser permissions and try again.');
      announceMedia(true, true);
    }
  };

  useEffect(() => {
    void startCamera();
    const reconnect = () => { void startCamera(); };
    socket.on('connect', reconnect);
    return () => {
      socket.off('connect', reconnect);
      localStream.current?.getTracks().forEach((track) => track.stop());
      Object.keys(peers.current).forEach(removePeer);
    };
  }, []);

  useEffect(() => {
    const peerJoined = ({ socketId, user }: { socketId: string; user: User }) => {
      createPeer(socketId, user);
    };
    const offer = async (data: { fromSocketId: string; offer: RTCSessionDescriptionInit; user: User }) => {
      const peer = createPeer(data.fromSocketId, data.user);
      const pc = peer.pc;
      if (peer.makingOffer || pc.signalingState !== 'stable') return;
      try {
        await pc.setRemoteDescription(data.offer);
        await flushIce(data.fromSocketId, pc);
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('webrtc:answer', {
          toSocketId: data.fromSocketId, answer: pc.localDescription,
        });
      } catch (err) { console.error('[WebRTC] answer failed', err); }
    };
    const answer = async (data: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peers.current[data.fromSocketId];
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription(data.answer);
      await flushIce(data.fromSocketId, peer.pc);
    };
    const ice = async (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peers.current[data.fromSocketId];
      if (!peer) return;
      if (!peer.pc.remoteDescription) {
        queuedIce.current[data.fromSocketId] ||= [];
        queuedIce.current[data.fromSocketId].push(data.candidate);
      } else await peer.pc.addIceCandidate(data.candidate);
    };
    const media = (data: { socketId: string; isMuted: boolean; isVideoOff: boolean }) => {
      mediaState.current[data.socketId] = data;
      setRemote((old) => old[data.socketId] ? {
        ...old, [data.socketId]: { ...old[data.socketId], user: { ...old[data.socketId].user, ...data } },
      } : old);
    };
    const left = ({ socketId }: { socketId: string }) => removePeer(socketId);
    socket.on('webrtc:peer-existing', peerJoined);
    socket.on('webrtc:peer-joined', peerJoined);
    socket.on('webrtc:offer', offer);
    socket.on('webrtc:answer', answer);
    socket.on('webrtc:ice-candidate', ice);
    socket.on('webrtc:peer-media-changed', media);
    socket.on('webrtc:peer-left', left);
    return () => {
      socket.off('webrtc:peer-existing', peerJoined);
      socket.off('webrtc:peer-joined', peerJoined);
      socket.off('webrtc:offer', offer);
      socket.off('webrtc:answer', answer);
      socket.off('webrtc:ice-candidate', ice);
      socket.off('webrtc:peer-media-changed', media);
      socket.off('webrtc:peer-left', left);
    };
  }, []);

  const toggleAudio = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) { void startCamera(); return; }
    track.enabled = !track.enabled; setMuted(!track.enabled); announceMedia(!track.enabled, videoOff);
  };
  const toggleVideo = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) { void startCamera(); return; }
    track.enabled = !track.enabled; setVideoOff(!track.enabled); announceMedia(muted, !track.enabled);
  };

  return <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between px-3 py-2 rounded-xl glass-card">
      <span className="text-xs font-semibold text-gray-300">Live Video Call</span>
      <div className="flex gap-2">
        <button onClick={toggleAudio} title={muted ? 'Unmute Mic' : 'Mute Mic'} className="p-2 rounded-lg bg-white/10 text-emerald-400">{muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
        <button onClick={toggleVideo} title={videoOff ? 'Turn Video On' : 'Turn Video Off'} className="p-2 rounded-lg bg-white/10 text-emerald-400">{videoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}</button>
      </div>
    </div>
    {error && <div className="text-[11px] text-amber-400 p-2 rounded-lg bg-amber-500/10"><span>{error}</span><button onClick={() => void startCamera()} className="ml-2 underline text-white">Allow Camera</button></div>}
    <div className="grid grid-cols-2 gap-2">
      <VideoTile stream={localStream.current} user={currentUser} local videoOff={videoOff || !videoAccess} muted={muted} videoRef={localVideo} />
      {Object.entries(remote).map(([id, peer]) => <VideoTile key={id} stream={peer.stream} user={peer.user} videoOff={Boolean(peer.user.isVideoOff)} muted={Boolean(peer.user.isMuted)} />)}
    </div>
  </div>;
};

const VideoTile: React.FC<{ stream: MediaStream | null; user: User; local?: boolean; videoOff: boolean; muted: boolean; videoRef?: React.RefObject<HTMLVideoElement> }> = ({ stream, user, local, videoOff, muted, videoRef }) => {
  const ownRef = useRef<HTMLVideoElement>(null); const ref = videoRef || ownRef;
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [ref, stream]);
  return <div className="relative rounded-xl overflow-hidden aspect-video bg-dark-800 flex items-center justify-center">
    <video ref={ref} autoPlay playsInline muted={local} className={`w-full h-full object-cover ${videoOff ? 'hidden' : ''} ${local ? 'transform -scale-x-100' : ''}`} />
    {videoOff && <div className="text-center"><img src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`} alt={user.username} className="w-10 h-10 rounded-full mx-auto" /><span className="text-[11px] text-gray-400">Camera Off</span></div>}
    <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 rounded text-[10px] text-white">{local ? 'You' : user.username}{muted && <MicOff className="inline w-3 h-3 ml-1" />}</div>
  </div>;
};
