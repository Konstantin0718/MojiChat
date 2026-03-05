import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Phone, 
  PhoneOff,
  Users,
  Maximize2,
  Minimize2,
  ScreenShare,
  ScreenShareOff,
  Settings
} from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '../../lib/utils';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const VideoCall = ({ 
  callId, 
  conversationId,
  participants = [],
  currentUser,
  isInitiator = false,
  isVideo = true,
  api,
  onEnd 
}) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(isVideo);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting'); // connecting, active, ended
  const [connectedPeers, setConnectedPeers] = useState([]);
  
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pollingIntervalRef = useRef(null);
  const containerRef = useRef(null);

  // Initialize local media stream
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideo ? { width: 1280, height: 720, facingMode: 'user' } : false,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioStream);
        setIsVideoEnabled(false);
        return audioStream;
      } catch (audioError) {
        console.error('Error accessing audio:', audioError);
        return null;
      }
    }
  }, [isVideo]);

  // Create peer connection for a user
  const createPeerConnection = useCallback((userId) => {
    if (peerConnectionsRef.current[userId]) {
      return peerConnectionsRef.current[userId];
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await api.post(`/calls/${callId}/signal`, {
            type: 'ice-candidate',
            data: event.candidate,
            target_user_id: userId
          });
        } catch (error) {
          console.error('Error sending ICE candidate:', error);
        }
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track from:', userId);
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
      setConnectedPeers(prev => 
        prev.includes(userId) ? prev : [...prev, userId]
      );
    };

    // Connection state change
    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('active');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setConnectedPeers(prev => prev.filter(id => id !== userId));
      }
    };

    peerConnectionsRef.current[userId] = pc;
    return pc;
  }, [localStream, callId, api]);

  // Send offer to a peer
  const sendOffer = useCallback(async (userId) => {
    const pc = createPeerConnection(userId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await api.post(`/calls/${callId}/signal`, {
        type: 'offer',
        data: pc.localDescription,
        target_user_id: userId
      });
    } catch (error) {
      console.error('Error sending offer:', error);
    }
  }, [createPeerConnection, callId, api]);

  // Handle received signal
  const handleSignal = useCallback(async (signal) => {
    const { type, data, from_user_id } = signal;
    
    if (type === 'offer') {
      const pc = createPeerConnection(from_user_id);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await api.post(`/calls/${callId}/signal`, {
        type: 'answer',
        data: pc.localDescription,
        target_user_id: from_user_id
      });
    } else if (type === 'answer') {
      const pc = peerConnectionsRef.current[from_user_id];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      }
    } else if (type === 'ice-candidate') {
      const pc = peerConnectionsRef.current[from_user_id];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data));
      }
    }
  }, [createPeerConnection, callId, api]);

  // Poll for signals
  const pollSignals = useCallback(async () => {
    try {
      const response = await api.get(`/calls/${callId}/signals`);
      const signals = response.data;
      
      for (const signal of signals) {
        await handleSignal(signal);
      }
    } catch (error) {
      console.error('Error polling signals:', error);
    }
  }, [callId, api, handleSignal]);

  // Initialize call
  useEffect(() => {
    const init = async () => {
      const stream = await initLocalStream();
      if (!stream) return;

      // Join the call
      try {
        await api.post(`/calls/${callId}/join`);
      } catch (error) {
        console.error('Error joining call:', error);
      }

      // If initiator, send offers to all participants
      if (isInitiator) {
        for (const participant of participants) {
          if (participant.user_id !== currentUser?.user_id) {
            await sendOffer(participant.user_id);
          }
        }
      }

      // Start polling for signals
      pollingIntervalRef.current = setInterval(pollSignals, 1000);
    };

    init();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [callId, isInitiator, participants, currentUser, initLocalStream, sendOffer, pollSignals, api]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      // Close all peer connections
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    };
  }, [localStream]);

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Screen sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing, restore camera
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
      });
      const videoTrack = cameraStream.getVideoTracks()[0];
      
      // Replace track in all peer connections
      Object.values(peerConnectionsRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });
      
      // Update local stream
      if (localStream) {
        localStream.getVideoTracks()[0]?.stop();
      }
      setLocalStream(prev => {
        const newStream = new MediaStream([videoTrack, ...prev.getAudioTracks()]);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        return newStream;
      });
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace track in all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });
        
        // Handle when user stops sharing via browser UI
        screenTrack.onended = () => toggleScreenShare();
        
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    }
  };

  // End call
  const endCall = async () => {
    // Stop all streams
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connections
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    
    // Notify server
    try {
      await api.post(`/calls/${callId}/end`);
    } catch (error) {
      console.error('Error ending call:', error);
    }
    
    setCallStatus('ended');
    onEnd?.();
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Get participant info
  const getParticipantInfo = (userId) => {
    return participants.find(p => p.user_id === userId) || { name: 'Unknown', picture: null };
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "fixed inset-0 z-50 bg-black flex flex-col",
        isFullscreen ? "" : "md:inset-4 md:rounded-2xl md:overflow-hidden"
      )}
      data-testid="video-call"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-3 h-3 rounded-full",
            callStatus === 'active' ? "bg-green-500 animate-pulse" : "bg-yellow-500"
          )} />
          <span className="text-white font-medium">
            {callStatus === 'connecting' ? 'Connecting...' : 
             callStatus === 'active' ? `${connectedPeers.length + 1} in call` : 'Call ended'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          className="text-white hover:bg-white/20"
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </Button>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 pt-16 pb-24">
        <div className={cn(
          "h-full grid gap-2",
          connectedPeers.length === 0 ? "grid-cols-1" :
          connectedPeers.length === 1 ? "grid-cols-2" :
          connectedPeers.length <= 3 ? "grid-cols-2 grid-rows-2" :
          "grid-cols-3 grid-rows-2"
        )}>
          {/* Local video */}
          <div className="relative bg-gray-900 rounded-xl overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={cn(
                "w-full h-full object-cover",
                !isVideoEnabled && "hidden"
              )}
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={currentUser?.picture} />
                  <AvatarFallback className="text-3xl bg-primary text-white">
                    {currentUser?.name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">
              You {!isAudioEnabled && '🔇'}
            </div>
          </div>

          {/* Remote videos */}
          {connectedPeers.map((peerId) => {
            const participant = getParticipantInfo(peerId);
            const stream = remoteStreams[peerId];
            
            return (
              <div key={peerId} className="relative bg-gray-900 rounded-xl overflow-hidden">
                {stream ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && stream) {
                        el.srcObject = stream;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={participant.picture} />
                      <AvatarFallback className="text-3xl bg-secondary text-white">
                        {participant.name?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-white text-sm">
                  {participant.name}
                </div>
              </div>
            );
          })}

          {/* Waiting for others */}
          {connectedPeers.length === 0 && callStatus === 'connecting' && (
            <div className="flex items-center justify-center">
              <div className="text-center text-white">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Waiting for others to join...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAudio}
          className={cn(
            "w-14 h-14 rounded-full",
            isAudioEnabled ? "bg-white/20 text-white hover:bg-white/30" : "bg-red-500 text-white hover:bg-red-600"
          )}
          data-testid="toggle-audio-btn"
        >
          {isAudioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleVideo}
          className={cn(
            "w-14 h-14 rounded-full",
            isVideoEnabled ? "bg-white/20 text-white hover:bg-white/30" : "bg-red-500 text-white hover:bg-red-600"
          )}
          data-testid="toggle-video-btn"
        >
          {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleScreenShare}
          className={cn(
            "w-14 h-14 rounded-full",
            isScreenSharing ? "bg-primary text-white hover:bg-primary/90" : "bg-white/20 text-white hover:bg-white/30"
          )}
          data-testid="screen-share-btn"
        >
          {isScreenSharing ? <ScreenShareOff className="w-6 h-6" /> : <ScreenShare className="w-6 h-6" />}
        </Button>

        <Button
          variant="destructive"
          size="icon"
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600"
          data-testid="end-call-btn"
        >
          <PhoneOff className="w-6 h-6" />
        </Button>
      </div>
    </motion.div>
  );
};
