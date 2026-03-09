import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { APP_CONFIG } from '../config';
import { notificationService } from '../services/notifications';

interface Props {
  navigation: any;
}

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout, updateUser } = useAuth();
  const { colors, isDark, toggleTheme, setTheme, theme } = useTheme();
  const { api } = require('../services/api');
  const [registeringNotifications, setRegisteringNotifications] = useState(false);
  const [sendingCloudNotification, setSendingCloudNotification] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleLanguageChange = async (langCode: string) => {
    try {
      await api.updateLanguage(langCode);
      updateUser({ preferred_language: langCode });
    } catch (error) {
      Alert.alert('Error', 'Failed to update language');
    }
  };

  const handleRegisterNotifications = async () => {
    setRegisteringNotifications(true);
    try {
      const token = await notificationService.registerForPushNotifications();
      if (token) {
        Alert.alert(
          '✅ Registration Complete',
          'Check your console logs for the FCM token. You can also tap "Show Tokens" to see them.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to register for notifications');
    } finally {
      setRegisteringNotifications(false);
    }
  };

  const handleShowTokens = () => {
    notificationService.showTokensAlert();
  };

  const handleTestNotification = async () => {
    await notificationService.sendTestNotification();
  };

  const handleSendCloudNotification = async () => {
    const expoToken = notificationService.getExpoPushToken();
    
    if (!expoToken) {
      Alert.alert('Error', 'No Expo Push Token found. Please tap "Register for Push" first.');
      return;
    }

    setSendingCloudNotification(true);
    try {
      const result = await api.sendCloudNotification(
        expoToken,
        '🔔 Cloud Test',
        'This notification was sent via Expo Push API through our backend!'
      );
      
      if (result.success) {
        Alert.alert('✅ Success', result.message);
      } else {
        Alert.alert('❌ Failed', result.message + '\n\nDetails: ' + JSON.stringify(result.details, null, 2));
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send cloud notification');
    } finally {
      setSendingCloudNotification(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.profileCard}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>
                  {user?.name?.[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setTheme('light')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="sunny" size={22} color={colors.warning} />
              </View>
              <Text style={styles.settingText}>Light</Text>
              {theme === 'light' && (
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setTheme('dark')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="moon" size={22} color={colors.primary} />
              </View>
              <Text style={styles.settingText}>Dark</Text>
              {theme === 'dark' && (
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setTheme('system')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="phone-portrait" size={22} color={colors.text} />
              </View>
              <Text style={styles.settingText}>System</Text>
              {theme === 'system' && (
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language</Text>
          <Text style={styles.sectionSubtitle}>
            Messages will be translated to your preferred language
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.languageScroll}>
            {Object.entries(APP_CONFIG.supportedLanguages).map(([code, name]) => (
              <TouchableOpacity
                key={code}
                style={[
                  styles.languageChip,
                  user?.preferred_language === code && styles.languageChipActive,
                ]}
                onPress={() => handleLanguageChange(code)}
              >
                <Text
                  style={[
                    styles.languageChipText,
                    user?.preferred_language === code && styles.languageChipTextActive,
                  ]}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={handleRegisterNotifications}
              disabled={registeringNotifications}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="notifications" size={22} color={colors.primary} />
              </View>
              <Text style={styles.settingText}>Register for Push</Text>
              {registeringNotifications ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={handleShowTokens}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="key" size={22} color={colors.accent} />
              </View>
              <Text style={styles.settingText}>Show Tokens</Text>
              <Ionicons name="eye" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={handleTestNotification}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="paper-plane" size={22} color={colors.success} />
              </View>
              <Text style={styles.settingText}>Local Test Notification</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={handleSendCloudNotification}
              disabled={sendingCloudNotification}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="cloud-upload" size={22} color="#FF6B6B" />
              </View>
              <Text style={styles.settingText}>Send Cloud Notification</Text>
              {sendingCloudNotification ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="send" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="information-circle" size={22} color={colors.accent} />
              </View>
              <Text style={styles.settingText}>Version</Text>
              <Text style={styles.settingValue}>{APP_CONFIG.version}</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={22} color={colors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
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
      paddingBottom: 40,
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
    sectionSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 16,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 24,
      fontWeight: 'bold',
    },
    profileInfo: {
      marginLeft: 16,
    },
    profileName: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    profileEmail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    settingIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    settingText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
    },
    settingValue: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 64,
    },
    languageScroll: {
      marginHorizontal: -16,
      paddingHorizontal: 16,
    },
    languageChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    languageChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    languageChipText: {
      fontSize: 14,
      color: colors.text,
    },
    languageChipTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 16,
      gap: 8,
    },
    logoutText: {
      fontSize: 16,
      color: colors.error,
      fontWeight: '600',
    },
  });
