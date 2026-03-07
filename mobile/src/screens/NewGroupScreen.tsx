import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { User } from '../types';

interface Props {
  navigation: any;
}

export const NewGroupScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState<'members' | 'name'>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const results = await api.searchUsers(query);
      setSearchResults(results.filter(
        (u: User) => !selectedUsers.find(s => s.user_id === u.user_id)
      ));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUsers]);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    searchUsers(text);
  };

  const toggleUser = (toggledUser: User) => {
    const isSelected = selectedUsers.find(u => u.user_id === toggledUser.user_id);
    if (isSelected) {
      setSelectedUsers(selectedUsers.filter(u => u.user_id !== toggledUser.user_id));
    } else {
      setSelectedUsers([...selectedUsers, toggledUser]);
      setSearchResults(searchResults.filter(u => u.user_id !== toggledUser.user_id));
    }
  };

  const goToNameStep = () => {
    if (selectedUsers.length < 1) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }
    setStep('name');
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setCreating(true);
    try {
      const participantIds = selectedUsers.map(u => u.user_id);
      const conversation = await api.createConversation(participantIds, groupName.trim(), true);
      navigation.replace('Chat', { conversationId: conversation.conversation_id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const styles = createStyles(colors);

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => toggleUser(item)}
    >
      {item.picture ? (
        <Image source={{ uri: item.picture }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={styles.avatarText}>
            {item.name?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
      <Ionicons name="add-circle" size={28} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderSelectedUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.selectedUserChip}
      onPress={() => toggleUser(item)}
    >
      {item.picture ? (
        <Image source={{ uri: item.picture }} style={styles.chipAvatar} />
      ) : (
        <View style={[styles.chipAvatar, { backgroundColor: colors.accent }]}>
          <Text style={styles.chipAvatarText}>
            {item.name?.[0]?.toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.chipName}>{item.name?.split(' ')[0]}</Text>
      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  if (step === 'name') {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('members')} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Name Group</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.nameContainer}>
          <View style={styles.groupIconContainer}>
            <Ionicons name="people" size={48} color={colors.primary} />
          </View>
          
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name"
            placeholderTextColor={colors.textSecondary}
            value={groupName}
            onChangeText={setGroupName}
            autoFocus
            maxLength={50}
          />

          <Text style={styles.membersCount}>
            {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected
          </Text>

          <FlatList
            horizontal
            data={selectedUsers}
            renderItem={renderSelectedUser}
            keyExtractor={(item) => item.user_id}
            showsHorizontalScrollIndicator={false}
            style={styles.selectedList}
          />

          <TouchableOpacity
            style={[styles.createButton, creating && styles.createButtonDisabled]}
            onPress={createGroup}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={22} color="#fff" />
                <Text style={styles.createButtonText}>Create Group</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity
          onPress={goToNameStep}
          disabled={selectedUsers.length < 1}
          style={styles.nextButton}
        >
          <Text style={[
            styles.nextButtonText,
            selectedUsers.length < 1 && styles.nextButtonTextDisabled
          ]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selected users */}
      {selectedUsers.length > 0 && (
        <View style={styles.selectedContainer}>
          <FlatList
            horizontal
            data={selectedUsers}
            renderItem={renderSelectedUser}
            keyExtractor={(item) => item.user_id}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Add members..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Results */}
      <FlatList
        data={searchResults}
        renderItem={renderUser}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>
              {searchQuery.length >= 2 
                ? (loading ? 'Searching...' : 'No users found')
                : 'Search to add members'
              }
            </Text>
          </View>
        }
      />
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
    nextButton: {
      padding: 8,
    },
    nextButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    nextButtonTextDisabled: {
      color: colors.textSecondary,
    },
    selectedContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    selectedUserChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      paddingVertical: 6,
      paddingLeft: 6,
      paddingRight: 10,
      borderRadius: 20,
      marginRight: 8,
      gap: 6,
    },
    chipAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chipAvatarText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: 'bold',
    },
    chipName: {
      fontSize: 14,
      color: colors.text,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      marginHorizontal: 16,
      marginVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      height: 48,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 16,
      color: colors.text,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 20,
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
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 60,
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    nameContainer: {
      flex: 1,
      alignItems: 'center',
      padding: 24,
    },
    groupIconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    groupNameInput: {
      width: '100%',
      height: 56,
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 20,
      fontSize: 18,
      color: colors.text,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    membersCount: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    selectedList: {
      maxHeight: 60,
      marginBottom: 24,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 16,
      gap: 8,
      width: '100%',
    },
    createButtonDisabled: {
      opacity: 0.7,
    },
    createButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
    },
  });
