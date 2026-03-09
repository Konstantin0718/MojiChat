import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  navigation: any;
}

const NOTIFICATION_SOUNDS = [
  { id: 'default', name: 'Default', file: null },
  { id: 'chime', name: 'Chime', file: null },
  { id: 'bell', name: 'Bell', file: null },
  { id: 'pop', name: 'Pop', file: null },
  { id: 'ding', name: 'Ding', file: null },
  { id: 'none', name: 'None', file: null },
];

const STORAGE_KEYS = {
  NOTIFICATION_SOUND: '@notification_sound',
  VIBRATION_ENABLED: '@vibration_enabled',
  SOUND_ENABLED: '@sound_enabled',
  MESSAGE_PREVIEW: '@message_preview',
};

export const NotificationSettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useLanguage();
  
  const [selectedSound, setSelectedSound] = useState('default');
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [messagePreview, setMessagePreview] = useState(true);
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const sound = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_SOUND);
      const vibration = await AsyncStorage.getItem(STORAGE_KEYS.VIBRATION_ENABLED);
      const soundOn = await AsyncStorage.getItem(STORAGE_KEYS.SOUND_ENABLED);
      const preview = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGE_PREVIEW);

      if (sound) setSelectedSound(sound);
      if (vibration !== null) setVibrationEnabled(vibration === 'true');
      if (soundOn !== null) setSoundEnabled(soundOn === 'true');
      if (preview !== null) setMessagePreview(preview === 'true');
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const saveSettings = async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Error saving setting:', error);
    }
  };

  const handleSoundSelect = async (soundId: string) => {
    setSelectedSound(soundId);
    await saveSettings(STORAGE_KEYS.NOTIFICATION_SOUND, soundId);
    
    // Play preview sound
    if (soundId !== 'none') {
      playPreviewSound(soundId);
    }
  };

  const playPreviewSound = async (soundId: string) => {
    try {
      setPlayingSound(soundId);
      // In production, would load actual sound files
      // For now, just show that we're "playing"
      setTimeout(() => setPlayingSound(null), 500);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const handleVibrationToggle = async (value: boolean) => {
    setVibrationEnabled(value);
    await saveSettings(STORAGE_KEYS.VIBRATION_ENABLED, value.toString());
  };

  const handleSoundToggle = async (value: boolean) => {
    setSoundEnabled(value);
    await saveSettings(STORAGE_KEYS.SOUND_ENABLED, value.toString());
  };

  const handlePreviewToggle = async (value: boolean) => {
    setMessagePreview(value);
    await saveSettings(STORAGE_KEYS.MESSAGE_PREVIEW, value.toString());
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Sound Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notification_sound')}</Text>
          <View style={styles.card}>
            {NOTIFICATION_SOUNDS.map((sound, index) => (
              <React.Fragment key={sound.id}>
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => handleSoundSelect(sound.id)}
                >
                  <View style={styles.soundInfo}>
                    <Ionicons
                      name={sound.id === 'none' ? 'volume-mute' : 'musical-note'}
                      size={22}
                      color={colors.primary}
                    />
                    <Text style={styles.settingText}>{sound.name}</Text>
                  </View>
                  {selectedSound === sound.id && (
                    <Ionicons name="checkmark" size={22} color={colors.primary} />
                  )}
                  {playingSound === sound.id && (
                    <Ionicons name="volume-high" size={22} color={colors.accent} />
                  )}
                </TouchableOpacity>
                {index < NOTIFICATION_SOUNDS.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Toggle Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <View style={styles.card}>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Ionicons name="volume-high" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Sound</Text>
                  <Text style={styles.settingDescription}>Play sound for notifications</Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={handleSoundToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Ionicons name="phone-portrait" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>{t('vibration')}</Text>
                  <Text style={styles.settingDescription}>Vibrate for notifications</Text>
                </View>
              </View>
              <Switch
                value={vibrationEnabled}
                onValueChange={handleVibrationToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Ionicons name="eye" size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Message Preview</Text>
                  <Text style={styles.settingDescription}>Show message content in notifications</Text>
                </View>
              </View>
              <Switch
                value={messagePreview}
                onValueChange={handlePreviewToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            Notification settings are stored locally on your device
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 50,
      paddingBottom: 12,
      paddingHorizontal: 8,
      backgroundColor: colors.card,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    content: {
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    soundInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    settingInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    settingTextContainer: {
      flex: 1,
    },
    settingText: {
      fontSize: 16,
      color: colors.text,
    },
    settingDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 16,
    },
    infoSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    infoText: {
      fontSize: 12,
      color: colors.textSecondary,
      flex: 1,
    },
  });
