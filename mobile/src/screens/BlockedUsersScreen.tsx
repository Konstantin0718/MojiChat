import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';

interface Props {
  navigation: any;
}

interface BlockedUser {
  user_id: string;
  name: string;
  email: string;
  picture?: string;
  blocked_at: string;
}

export const BlockedUsersScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getBlockedUsers();
      setBlockedUsers(data || []);
    } catch (error) {
      console.error('Error loading blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${user.name}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await api.unblockUser(user.user_id);
              setBlockedUsers(prev => prev.filter(u => u.user_id !== user.user_id));
            } catch (error) {
              Alert.alert(t('error'), 'Failed to unblock user');
            }
          },
        },
      ]
    );
  };

  const styles = createStyles(colors);

  const renderUser = ({ item }: { item: BlockedUser }) => (
    <View style={styles.userItem}>
      {item.picture ? (
        <Image source={{ uri: item.picture }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{item.name?.[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => handleUnblock(item)}
      >
        <Text style={styles.unblockText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('blocked_users')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Blocked Users</Text>
          <Text style={styles.emptyText}>
            Users you block won't be able to message you or see your profile
          </Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
        />
      )}
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
    loader: {
      flex: 1,
      justifyContent: 'center',
    },
    listContent: {
      padding: 16,
    },
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 12,
      borderRadius: 16,
      marginBottom: 8,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    userInfo: {
      flex: 1,
      marginLeft: 12,
    },
    userName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    userEmail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    unblockButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    unblockText: {
      color: '#fff',
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
    },
  });
