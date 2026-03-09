import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Dimensions,
  Animated,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';

interface Props {
  navigation: any;
}

interface Status {
  status_id: string;
  user_id: string;
  user_name: string;
  user_picture?: string;
  content_type: 'image' | 'text';
  content_url?: string;
  text_content?: string;
  background_color?: string;
  created_at: string;
  viewed_by: string[];
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const StatusScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  
  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [recentStatuses, setRecentStatuses] = useState<Status[]>([]);
  const [viewedStatuses, setViewedStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingStatus, setViewingStatus] = useState<Status | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [selectedBgColor, setSelectedBgColor] = useState('#8B5CF6');

  const progressAnim = useRef(new Animated.Value(0)).current;

  const BG_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    if (viewingStatus) {
      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setViewingStatus(null);
        }
      });
    }
  }, [viewingStatus]);

  const loadStatuses = async () => {
    setLoading(true);
    try {
      // In production, would fetch from API
      // For now, using mock data
      setMyStatuses([]);
      setRecentStatuses([]);
      setViewedStatuses([]);
    } catch (error) {
      console.error('Error loading statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTextStatus = async () => {
    if (!textContent.trim()) {
      Alert.alert(t('error'), 'Please enter some text');
      return;
    }

    try {
      // Would call API to create status
      Alert.alert(t('success'), 'Status posted!');
      setShowAddModal(false);
      setTextContent('');
    } catch (error) {
      Alert.alert(t('error'), 'Failed to post status');
    }
  };

  const handleAddImageStatus = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    });

    if (!result.canceled && result.assets[0]) {
      try {
        // Would upload image and create status
        Alert.alert(t('success'), 'Status posted!');
      } catch (error) {
        Alert.alert(t('error'), 'Failed to post status');
      }
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error'), 'Camera permission required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    });

    if (!result.canceled && result.assets[0]) {
      try {
        // Would upload image and create status
        Alert.alert(t('success'), 'Status posted!');
      } catch (error) {
        Alert.alert(t('error'), 'Failed to post status');
      }
    }
  };

  const styles = createStyles(colors);

  const renderStatusItem = ({ item }: { item: Status }) => (
    <TouchableOpacity
      style={styles.statusItem}
      onPress={() => setViewingStatus(item)}
    >
      <View style={styles.statusRing}>
        {item.user_picture ? (
          <Image source={{ uri: item.user_picture }} style={styles.statusAvatar} />
        ) : (
          <View style={[styles.statusAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{item.user_name?.[0]?.toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.statusName} numberOfLines={1}>{item.user_name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('status_updates')}</Text>
        <TouchableOpacity style={styles.cameraButton} onPress={handleTakePhoto}>
          <Ionicons name="camera" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[]}
        ListHeaderComponent={() => (
          <>
            {/* My Status */}
            <View style={styles.myStatusSection}>
              <TouchableOpacity
                style={styles.myStatusItem}
                onPress={() => setShowAddModal(true)}
              >
                <View style={styles.addStatusButton}>
                  {user?.picture ? (
                    <Image source={{ uri: user.picture }} style={styles.myStatusAvatar} />
                  ) : (
                    <View style={[styles.myStatusAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.avatarTextLarge}>{user?.name?.[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.addIcon}>
                    <Ionicons name="add" size={16} color="#fff" />
                  </View>
                </View>
                <View style={styles.myStatusInfo}>
                  <Text style={styles.myStatusTitle}>{t('my_status')}</Text>
                  <Text style={styles.myStatusSubtitle}>
                    {myStatuses.length > 0 ? 'Tap to view' : t('add_status')}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Recent Updates */}
            {recentStatuses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Updates</Text>
                <FlatList
                  horizontal
                  data={recentStatuses}
                  renderItem={renderStatusItem}
                  keyExtractor={(item) => item.status_id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.statusList}
                />
              </View>
            )}

            {/* Viewed Updates */}
            {viewedStatuses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Viewed</Text>
                <FlatList
                  horizontal
                  data={viewedStatuses}
                  renderItem={renderStatusItem}
                  keyExtractor={(item) => item.status_id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.statusList}
                />
              </View>
            )}

            {/* Empty State */}
            {recentStatuses.length === 0 && viewedStatuses.length === 0 && (
              <View style={styles.emptyContainer}>
                <Ionicons name="aperture" size={64} color={colors.textSecondary} />
                <Text style={styles.emptyTitle}>No Status Updates</Text>
                <Text style={styles.emptyText}>
                  Status updates from your contacts will appear here
                </Text>
              </View>
            )}
          </>
        )}
        renderItem={null}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="pencil" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Add Status Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_status')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Background colors */}
            <View style={styles.colorPicker}>
              {BG_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    selectedBgColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setSelectedBgColor(color)}
                />
              ))}
            </View>

            {/* Text input */}
            <View style={[styles.textPreview, { backgroundColor: selectedBgColor }]}>
              <TextInput
                style={styles.textInput}
                placeholder="Type a status..."
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={textContent}
                onChangeText={setTextContent}
                multiline
                textAlign="center"
                maxLength={200}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleAddImageStatus}>
                <Ionicons name="image" size={24} color={colors.primary} />
                <Text style={styles.actionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleTakePhoto}>
                <Ionicons name="camera" size={24} color={colors.primary} />
                <Text style={styles.actionText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postButton, { backgroundColor: colors.primary }]}
                onPress={handleAddTextStatus}
              >
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.postButtonText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Viewer Modal */}
      <Modal
        visible={!!viewingStatus}
        animationType="fade"
        onRequestClose={() => setViewingStatus(null)}
      >
        {viewingStatus && (
          <TouchableOpacity
            style={styles.statusViewer}
            activeOpacity={1}
            onPress={() => setViewingStatus(null)}
          >
            {/* Progress bar */}
            <View style={styles.progressContainer}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            {/* User info */}
            <View style={styles.statusHeader}>
              <View style={styles.statusUserInfo}>
                {viewingStatus.user_picture ? (
                  <Image source={{ uri: viewingStatus.user_picture }} style={styles.statusUserAvatar} />
                ) : (
                  <View style={[styles.statusUserAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarTextSmall}>{viewingStatus.user_name?.[0]}</Text>
                  </View>
                )}
                <Text style={styles.statusUserName}>{viewingStatus.user_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewingStatus(null)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={[styles.statusContent, { backgroundColor: viewingStatus.background_color || colors.primary }]}>
              {viewingStatus.content_type === 'image' && viewingStatus.content_url ? (
                <Image source={{ uri: viewingStatus.content_url }} style={styles.statusImage} />
              ) : (
                <Text style={styles.statusText}>{viewingStatus.text_content}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
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
    cameraButton: {
      padding: 8,
    },
    myStatusSection: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    myStatusItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    addStatusButton: {
      position: 'relative',
    },
    myStatusAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarTextLarge: {
      color: '#fff',
      fontSize: 24,
      fontWeight: 'bold',
    },
    addIcon: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    myStatusInfo: {
      marginLeft: 16,
    },
    myStatusTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    myStatusSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    section: {
      paddingVertical: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 12,
      marginLeft: 16,
      textTransform: 'uppercase',
    },
    statusList: {
      paddingHorizontal: 16,
    },
    statusItem: {
      alignItems: 'center',
      marginRight: 16,
      width: 72,
    },
    statusRing: {
      padding: 3,
      borderRadius: 30,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    statusAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 20,
      fontWeight: 'bold',
    },
    statusName: {
      fontSize: 12,
      color: colors.text,
      marginTop: 4,
      textAlign: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      paddingHorizontal: 40,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    colorPicker: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 20,
    },
    colorOption: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    colorOptionSelected: {
      borderWidth: 3,
      borderColor: '#fff',
    },
    textPreview: {
      height: 200,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    textInput: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '600',
      textAlign: 'center',
      padding: 20,
      width: '100%',
    },
    modalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    actionButton: {
      flex: 1,
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 12,
    },
    actionText: {
      fontSize: 12,
      color: colors.text,
      marginTop: 4,
    },
    postButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    postButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    statusViewer: {
      flex: 1,
      backgroundColor: '#000',
    },
    progressContainer: {
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.3)',
      marginTop: 50,
      marginHorizontal: 8,
      borderRadius: 2,
    },
    progressBar: {
      height: '100%',
      backgroundColor: '#fff',
      borderRadius: 2,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    statusUserInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statusUserAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarTextSmall: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    statusUserName: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 12,
    },
    statusContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusImage: {
      width: SCREEN_WIDTH,
      height: '100%',
      resizeMode: 'contain',
    },
    statusText: {
      color: '#fff',
      fontSize: 28,
      fontWeight: '600',
      textAlign: 'center',
      padding: 40,
    },
  });
