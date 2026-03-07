import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

interface AudioPlayerProps {
  uri: string;
  duration?: number;
  isOwn: boolean;
  colors: any;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  uri,
  duration = 0,
  isOwn,
  colors,
}) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration * 1000);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const loadAndPlay = async () => {
    try {
      setIsLoading(true);
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (sound) {
        // Resume existing sound
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        // Load new sound
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const pause = async () => {
    if (sound) {
      await sound.pauseAsync();
      setIsPlaying(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      if (status.durationMillis) {
        setTotalDuration(status.durationMillis);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        sound?.setPositionAsync(0);
      }
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? (position / totalDuration) * 100 : 0;
  const styles = createStyles(colors, isOwn);

  return (
    <View style={styles.container}>
      {/* Play/Pause button */}
      <TouchableOpacity
        style={styles.playButton}
        onPress={isPlaying ? pause : loadAndPlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isOwn ? '#fff' : colors.primary} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={isOwn ? '#fff' : colors.primary}
          />
        )}
      </TouchableOpacity>

      {/* Waveform / Progress */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {[...Array(20)].map((_, i) => {
            const barProgress = (i / 20) * 100;
            const isActive = barProgress <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: Math.sin((i / 20) * Math.PI) * 16 + 6,
                    backgroundColor: isActive
                      ? (isOwn ? '#fff' : colors.primary)
                      : (isOwn ? 'rgba(255,255,255,0.3)' : colors.border),
                  },
                ]}
              />
            );
          })}
        </View>
        
        {/* Duration */}
        <Text style={styles.duration}>
          {isPlaying || position > 0 
            ? formatTime(position) 
            : formatTime(totalDuration)}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: any, isOwn: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 200,
    },
    playButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    waveformContainer: {
      flex: 1,
      gap: 4,
    },
    waveform: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      height: 24,
    },
    waveformBar: {
      width: 3,
      borderRadius: 2,
    },
    duration: {
      fontSize: 12,
      color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textSecondary,
    },
  });
