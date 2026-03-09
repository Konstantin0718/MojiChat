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
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { APP_CONFIG } from '../config';
import { notificationService } from '../services/notifications';
import { api } from '../services/api';

interface Props {
  navigation: any;
}

export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const { user, logout, updateUser } = useAuth();
  const { colors, isDark, toggleTheme, setTheme, theme } = useTheme();
  const { t, language, setAppLanguage, availableLanguages } = useLanguage();
  
  const [registeringNotifications, setRegisteringNotifications] = useState(false);
  const [sendingCloudNotification, setSendingCloudNotification] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('logout'),
      'Are you sure you want to logout?',
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleRegisterNotifications = async () => {
    setRegisteringNotifications(true);
    try {
      const token = await notificationService.registerForPushNotifications();
      if (token) {
        Alert.alert(t('success'), 'Push notifications registered!');
      }
    } catch (error) {
      Alert.alert(t('error'), 'Failed to register for notifications');
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
      Alert.alert(t('error'), 'No Expo Push Token found. Please tap "Register for Push" first.');
      return;
    }

    setSendingCloudNotification(true);
    try {
      const result = await api.sendCloudNotification(
        expoToken,
        '🔔 Cloud Test',
        'This notification was sent via Expo Push API!'
      );
      
      if (result.success) {
        Alert.alert(t('success'), result.message);
      } else {
        Alert.alert(t('error'), result.message);
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Failed to send cloud notification');
    } finally {
      setSendingCloudNotification(false);
    }
  };

  const handleLanguageChange = async (langCode: string) => {
    await setAppLanguage(langCode);
    setShowLanguageModal(false);
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    setShowThemeModal(false);
  };

  const styles = createStyles(colors);

  const themeOptions = [
    { id: 'light', name: t('light_mode'), icon: 'sunny' },
    { id: 'dark', name: t('dark_mode'), icon: 'moon' },
    { id: 'system', name: t('system_theme'), icon: 'phone-portrait' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, { backgroundColor: colors.primary }]}>
              <Text style={styles.profileInitial}>{user?.name?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email || user?.phone_number}</Text>
        </View>

        {/* Status Section */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.statusButton}
            onPress={() => navigation.navigate('Status')}
          >
            <Ionicons name="aperture" size={24} color={colors.primary} />
            <Text style={styles.statusButtonText}>{t('my_status')}</Text>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('theme')}</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => setShowThemeModal(true)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color={colors.primary} />
              </View>
              <Text style={styles.settingText}>{t('theme')}</Text>
              <Text style={styles.settingValue}>
                {theme === 'dark' ? t('dark_mode') : theme === 'light' ? t('light_mode') : t('system_theme')}
              </Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => setShowLanguageModal(true)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="language" size={22} color={colors.accent} />
              </View>
              <Text style={styles.settingText}>{t('language')}</Text>
              <Text style={styles.settingValue}>
                {availableLanguages[language as keyof typeof availableLanguages] || language}
              </Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications')}</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => navigation.navigate('NotificationSettings')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="musical-notes" size={22} color={colors.primary} />
              </View>
              <Text style={styles.settingText}>{t('notification_sound')}</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.settingItem}
              onPress={handleRegisterNotifications}
              disabled={registeringNotifications}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="notifications" size={22} color={colors.accent} />
              </View>
              <Text style={styles.settingText}>Register for Push</Text>
              {registeringNotifications ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity style={styles.settingItem} onPress={handleShowTokens}>
              <View style={styles.settingIcon}>
                <Ionicons name="key" size={22} color={colors.warning} />
              </View>
              <Text style={styles.settingText}>Show Tokens</Text>
              <Ionicons name="eye" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity style={styles.settingItem} onPress={handleTestNotification}>
              <View style={styles.settingIcon}>
                <Ionicons name="paper-plane" size={22} color={colors.success} />
              </View>
              <Text style={styles.settingText}>Local Test</Text>
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
              <Text style={styles.settingText}>Cloud Notification</Text>
              {sendingCloudNotification ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="send" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacy')}</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => navigation.navigate('BlockedUsers')}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="ban" size={22} color={colors.error} />
              </View>
              <Text style={styles.settingText}>{t('blocked_users')}</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about')}</Text>
          <View style={styles.card}>
            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons name="information-circle" size={22} color={colors.primary} />
              </View>
              <Text style={styles.settingText}>{t('version')}</Text>
              <Text style={styles.settingValue}>{APP_CONFIG.version}</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={22} color={colors.error} />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('language')}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={Object.entries(availableLanguages)}
              renderItem={({ item: [code, name] }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleLanguageChange(code)}
                >
                  <Text style={styles.modalItemText}>{name}</Text>
                  {language === code && (
                    <Ionicons name="checkmark" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              keyExtractor={([code]) => code}
            />
          </View>
        </View>
      </Modal>

      {/* Theme Modal */}
      <Modal
        visible={showThemeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowThemeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('theme')}</Text>
              <TouchableOpacity onPress={() => setShowThemeModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {themeOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.modalItem}
                onPress={() => handleThemeChange(option.id as 'light' | 'dark' | 'system')}
              >
                <View style={styles.modalItemLeft}>
                  <Ionicons name={option.icon as any} size={22} color={colors.primary} />
                  <Text style={styles.modalItemText}>{option.name}</Text>
                </View>
                {theme === option.id && (
                  <Ionicons name="checkmark" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
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
    profileSection: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    profileImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileInitial: {
      color: '#fff',
      fontSize: 32,
      fontWeight: 'bold',
    },
    profileName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 12,
    },
    profileEmail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    statusButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 16,
      gap: 12,
    },
    statusButtonText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
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
      padding: 16,
    },
    settingIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
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
      fontSize: 14,
      color: colors.textSecondary,
      marginRight: 8,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 16,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 16,
      marginTop: 8,
      gap: 8,
    },
    logoutText: {
      color: colors.error,
      fontSize: 16,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      paddingHorizontal: 20,
    },
    modalItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalItemText: {
      fontSize: 16,
      color: colors.text,
    },
  });
