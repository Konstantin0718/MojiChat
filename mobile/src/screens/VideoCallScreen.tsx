import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Audio } from 'expo-av';
import { Camera, CameraView } from 'expo-camera';

interface Props {
  route: any;
  navigation: any;
}

export const VideoCallScreen: React.FC<Props> = ({ route, navigation }) => {
  const { callId, callerName, callerPicture, isVideo, isIncoming } = route.params;
  const { colors } = useTheme();
  const { t } = useLanguage();
  
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'ended'>('ringing');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(isVideo);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<'front' | 'back'>('front');
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Request camera permission
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();

    // Pulse animation for ringing
    if (callStatus === 'ringing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }

    // Simulate call connecting after 2 seconds
    if (!isIncoming) {
      setTimeout(() => {
        setCallStatus('connecting');
        setTimeout(() => {
          setCallStatus('active');
        }, 1500);
      }, 2000);
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (callStatus === 'active') {
      durationInterval.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [callStatus]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      navigation.goBack();
    }, 1000);
  };

  const handleAcceptCall = () => {
    setCallStatus('connecting');
    setTimeout(() => {
      setCallStatus('active');
    }, 1500);
  };

  const handleDeclineCall = () => {
    setCallStatus('ended');
    navigation.goBack();
  };

  const toggleMute = () => setIsMuted(!isMuted);
  const toggleCamera = () => setIsCameraOn(!isCameraOn);
  const toggleSpeaker = () => setIsSpeakerOn(!isSpeakerOn);
  const flipCamera = () => setCameraType(prev => prev === 'front' ? 'back' : 'front');

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Background - Camera or Avatar */}
      {isVideo && isCameraOn && hasPermission ? (
        <CameraView style={styles.camera} facing={cameraType}>
          {/* Local video preview would go here */}
        </CameraView>
      ) : (
        <View style={styles.avatarBackground}>
          {callerPicture ? (
            <Image source={{ uri: callerPicture }} style={styles.backgroundImage} />
          ) : (
            <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{callerName?.[0]?.toUpperCase()}</Text>
            </View>
          )}
        </View>
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top Info */}
        <View style={styles.topSection}>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callStatus}>
            {callStatus === 'ringing' && (isIncoming ? t('incoming_call') : t('calling'))}
            {callStatus === 'connecting' && 'Connecting...'}
            {callStatus === 'active' && formatDuration(duration)}
            {callStatus === 'ended' && t('call_ended')}
          </Text>
        </View>

        {/* Ringing Avatar (when not video) */}
        {(callStatus === 'ringing' || callStatus === 'connecting') && !isVideo && (
          <View style={styles.centerSection}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
              {callerPicture ? (
                <Image source={{ uri: callerPicture }} style={styles.callerAvatar} />
              ) : (
                <View style={[styles.callerAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarTextLarge}>{callerName?.[0]?.toUpperCase()}</Text>
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.bottomSection}>
          {/* Incoming call buttons */}
          {callStatus === 'ringing' && isIncoming && (
            <View style={styles.incomingControls}>
              <TouchableOpacity style={styles.declineButton} onPress={handleDeclineCall}>
                <Ionicons name="close" size={36} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptCall}>
                <Ionicons name={isVideo ? 'videocam' : 'call'} size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Active call controls */}
          {(callStatus === 'active' || (callStatus !== 'ringing' && !isIncoming)) && (
            <>
              <View style={styles.controlsRow}>
                <TouchableOpacity
                  style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                  onPress={toggleMute}
                >
                  <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={28} color="#fff" />
                  <Text style={styles.controlLabel}>{isMuted ? t('unmute') : t('mute')}</Text>
                </TouchableOpacity>

                {isVideo && (
                  <TouchableOpacity
                    style={[styles.controlButton, !isCameraOn && styles.controlButtonActive]}
                    onPress={toggleCamera}
                  >
                    <Ionicons name={isCameraOn ? 'videocam' : 'videocam-off'} size={28} color="#fff" />
                    <Text style={styles.controlLabel}>{isCameraOn ? t('camera_off') : t('camera_on')}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
                  onPress={toggleSpeaker}
                >
                  <Ionicons name={isSpeakerOn ? 'volume-high' : 'volume-medium'} size={28} color="#fff" />
                  <Text style={styles.controlLabel}>{t('speaker')}</Text>
                </TouchableOpacity>

                {isVideo && (
                  <TouchableOpacity style={styles.controlButton} onPress={flipCamera}>
                    <Ionicons name="camera-reverse" size={28} color="#fff" />
                    <Text style={styles.controlLabel}>Flip</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
                <Ionicons name="call" size={32} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {/* Outgoing call (not yet connected) */}
          {callStatus === 'ringing' && !isIncoming && (
            <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    camera: {
      flex: 1,
    },
    avatarBackground: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    backgroundImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
      opacity: 0.3,
    },
    avatarLarge: {
      width: 150,
      height: 150,
      borderRadius: 75,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 60,
      fontWeight: 'bold',
      color: '#fff',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingBottom: 50,
    },
    topSection: {
      alignItems: 'center',
    },
    callerName: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#fff',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    callStatus: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 8,
    },
    centerSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pulseCircle: {
      padding: 10,
      borderRadius: 100,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    callerAvatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarTextLarge: {
      fontSize: 48,
      fontWeight: 'bold',
      color: '#fff',
    },
    bottomSection: {
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    incomingControls: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      paddingHorizontal: 40,
    },
    declineButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#EF4444',
      justifyContent: 'center',
      alignItems: 'center',
    },
    acceptButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#22C55E',
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 32,
    },
    controlButton: {
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      minWidth: 70,
    },
    controlButtonActive: {
      backgroundColor: 'rgba(255,255,255,0.4)',
    },
    controlLabel: {
      color: '#fff',
      fontSize: 11,
      marginTop: 4,
    },
    endCallButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: '#EF4444',
      justifyContent: 'center',
      alignItems: 'center',
      transform: [{ rotate: '135deg' }],
    },
  });
