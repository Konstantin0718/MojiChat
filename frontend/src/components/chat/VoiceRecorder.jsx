import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Send, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export const VoiceRecorder = ({ onSend, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioUrl(null);
    setDuration(0);
    onCancel?.();
  };

  const sendVoiceMessage = async () => {
    if (!audioChunksRef.current.length) return;
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    
    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      onSend?.(reader.result, duration);
    };
    reader.readAsDataURL(audioBlob);
    
    setAudioUrl(null);
    setDuration(0);
    audioChunksRef.current = [];
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3" data-testid="voice-recorder">
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      <AnimatePresence mode="wait">
        {!isRecording && !audioUrl ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={startRecording}
              className="rounded-full hover:bg-primary/10 hover:text-primary"
              data-testid="start-recording-btn"
            >
              <Mic className="w-5 h-5" />
            </Button>
          </motion.div>
        ) : isRecording ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex items-center gap-3 bg-destructive/10 rounded-full px-4 py-2"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-destructive"
            />
            <span className="text-sm font-medium text-destructive">
              {formatDuration(duration)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={stopRecording}
              className="h-8 w-8 rounded-full hover:bg-destructive/20"
              data-testid="stop-recording-btn"
            >
              <Square className="w-4 h-4 text-destructive" />
            </Button>
          </motion.div>
        ) : audioUrl ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex items-center gap-2 bg-muted rounded-full px-3 py-2"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={togglePlayback}
              className="h-8 w-8 rounded-full"
              data-testid="play-recording-btn"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            
            {/* Waveform visualization */}
            <div className="flex items-center gap-0.5 h-6">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-primary rounded-full"
                  animate={isPlaying ? {
                    height: [8, Math.random() * 20 + 8, 8],
                  } : { height: 8 }}
                  transition={{
                    duration: 0.5,
                    repeat: isPlaying ? Infinity : 0,
                    delay: i * 0.05,
                  }}
                />
              ))}
            </div>
            
            <span className="text-xs text-muted-foreground min-w-[40px]">
              {formatDuration(duration)}
            </span>
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={cancelRecording}
              className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
              data-testid="cancel-recording-btn"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            
            <Button
              type="button"
              size="icon"
              onClick={sendVoiceMessage}
              className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
              data-testid="send-voice-btn"
            >
              <Send className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
