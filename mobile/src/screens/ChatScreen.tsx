import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { Message, Conversation } from '../types';
import { MessageBubble } from '../components/MessageBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { GiphyPicker } from '../components/GiphyPicker';
import { GiphyGif } from '../services/giphy';

interface Props {
  route: any;
  navigation: any;
}

export const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket connection and handlers
  useEffect(() => {
    if (!user?.user_id) return;

    // Connect to WebSocket if not connected
    if (!wsService.isConnected()) {
      wsService.connect(user.user_id);
    }

    // Subscribe to conversation
    wsService.subscribeToConversation(conversationId);

    // Handle new messages
    const unsubMessage = wsService.on('new_message', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages(prev => {
          // Check if message already exists
          if (prev.some(m => m.message_id === data.message.message_id)) {
            return prev;
          }
          return [...prev, data.message];
        });
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    });

    // Handle typing indicators
    const unsubTyping = wsService.on('typing', (data) => {
      if (data.conversation_id === conversationId) {
        if (data.is_typing) {
          setTypingUsers(prev => {
            if (prev.some(u => u.user_id === data.user_id)) return prev;
            return [...prev, { user_id: data.user_id, user_name: data.user_name }];
          });
        } else {
          setTypingUsers(prev => prev.filter(u => u.user_id !== data.user_id));
        }
      }
    });

    // Handle read receipts
    const unsubRead = wsService.on('message_read', (data) => {
      if (data.conversation_id === conversationId) {
        setMessages(prev => prev.map(m => {
          if (m.message_id === data.message_id) {
            return { ...m, read_by: [...(m.read_by || []), data.reader_id] };
          }
          return m;
        }));
      }
    });

    // Handle online status
    const unsubOnline = wsService.on('online_status', (data) => {
      if (conversation?.participants) {
        setConversation(prev => {
          if (!prev || !prev.participants) return prev;
          return {
            ...prev,
            participants: prev.participants.map(p => 
              p.user_id === data.user_id 
                ? { ...p, is_online: data.is_online } 
                : p
            )
          };
        });
      }
    });

    return () => {
      unsubMessage();
      unsubTyping();
      unsubRead();
      unsubOnline();
      wsService.unsubscribeFromConversation(conversationId);
    };
  }, [user?.user_id, conversationId, conversation?.participants]);

  const fetchConversation = useCallback(async () => {
    try {
      const data = await api.getConversation(conversationId);
      setConversation(data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  }, [conversationId]);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [conversationId]);

  const fetchTyping = useCallback(async () => {
    try {
      const data = await api.getTyping(conversationId);
      setTypingUsers(data);
    } catch (error) {}
  }, [conversationId]);

  useEffect(() => {
    fetchConversation();
    fetchMessages();
    
    // Reduced polling since we have WebSocket
    const interval = setInterval(() => {
      if (!wsService.isConnected()) {
        fetchMessages();
        fetchTyping();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchConversation, fetchMessages, fetchTyping]);

  const getConversationName = () => {
    if (!conversation) return 'Chat';
    if (conversation.name) return conversation.name;
    const others = conversation.participants?.filter(p => p.user_id !== user?.user_id) || [];
    return others.map(p => p.name).join(', ');
  };

  const getOtherParticipant = () => {
    return conversation?.participants?.find(p => p.user_id !== user?.user_id);
  };

  const handleTyping = async () => {
    // Use WebSocket for typing if connected
    if (wsService.isConnected()) {
      wsService.sendTyping(conversationId, true);
    } else {
      try {
        await api.setTyping(conversationId, true);
      } catch (e) {}
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      if (wsService.isConnected()) {
        wsService.sendTyping(conversationId, false);
      } else {
        try {
          await api.setTyping(conversationId, false);
        } catch (e) {}
      }
    }, 3000);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await api.sendMessage(conversationId, newMessage.trim());
      setNewMessage('');
      await fetchMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const sendVoiceMessage = async (audioData: string, duration: number) => {
    setSending(true);
    setIsRecording(false);
    try {
      // Upload voice to backend
      const uploadResult = await api.uploadVoice(audioData, duration);
      
      // Send as message
      await api.sendMessage(conversationId, 'Voice message', 'audio', {
        file_url: uploadResult.file_url,
        duration: duration,
        file_size: uploadResult.file_size,
      });
      
      await fetchMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('Voice upload error:', error);
      Alert.alert('Error', 'Failed to send voice message');
    } finally {
      setSending(false);
    }
  };

  const sendGif = async (gif: GiphyGif) => {
    setShowGiphyPicker(false);
    setSending(true);
    try {
      await api.sendMessage(conversationId, gif.title || 'GIF', 'gif', {
        file_url: gif.url,
        file_name: `${gif.id}.gif`,
      });
      await fetchMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('GIF send error:', error);
      Alert.alert('Error', 'Failed to send GIF');
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    setShowAttachMenu(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAndSendFile(result.assets[0].uri, 'image.jpg', 'image/jpeg', 'image');
    }
  };

  const takePhoto = async () => {
    setShowAttachMenu(false);
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAndSendFile(result.assets[0].uri, 'photo.jpg', 'image/jpeg', 'image');
    }
  };

  const pickDocument = async () => {
    setShowAttachMenu(false);
    
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadAndSendFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', 'file');
    }
  };

  const uploadAndSendFile = async (uri: string, fileName: string, mimeType: string, type: string) => {
    setSending(true);
    try {
      const uploadResult = await api.uploadFile(uri, fileName, mimeType);
      
      await api.sendMessage(conversationId, fileName, type, {
        file_url: uploadResult.file_url,
        file_name: uploadResult.file_name,
        file_size: uploadResult.file_size,
      });
      
      await fetchMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('File upload error:', error);
      Alert.alert('Error', 'Failed to upload file');
    } finally {
      setSending(false);
    }
  };

  const startCall = async (isVideo: boolean) => {
    try {
      const call = await api.initiateCall(conversationId, isVideo);
      Alert.alert(
        isVideo ? 'Video Call' : 'Voice Call',
        'Call initiated! (Video calling feature coming soon)',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to start call');
    }
  };

  const styles = createStyles(colors);

  const renderMessage = ({ item: msg }: { item: Message }) => (
    <MessageBubble
      message={msg}
      currentUser={user}
      conversation={conversation}
      colors={colors}
    />
  );

  const other = getOtherParticipant();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{getConversationName()}</Text>
          {!conversation?.is_group && other?.is_online && (
            <Text style={styles.onlineStatus}>Online</Text>
          )}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => startCall(false)} style={styles.headerButton}>
            <Ionicons name="call" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => startCall(true)} style={styles.headerButton}>
            <Ionicons name="videocam" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.message_id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListFooterComponent={
          typingUsers.length > 0 ? (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <View style={styles.typingDots}>
                  {[0, 1, 2].map((i) => (
                    <Animated.View key={i} style={[styles.typingDot, { backgroundColor: colors.primary }]} />
                  ))}
                </View>
              </View>
              <Text style={styles.typingText}>{typingUsers[0]?.user_name} is typing...</Text>
            </View>
          ) : null
        }
      />

      {/* Attachment Menu */}
      {showAttachMenu && (
        <View style={styles.attachMenu}>
          <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
            <View style={[styles.attachIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
            <Text style={styles.attachText}>Camera</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.attachOption} onPress={pickImage}>
            <View style={[styles.attachIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="image" size={24} color="#fff" />
            </View>
            <Text style={styles.attachText}>Gallery</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
            <View style={[styles.attachIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="document" size={24} color="#fff" />
            </View>
            <Text style={styles.attachText}>Document</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.attachOption} 
            onPress={() => {
              setShowAttachMenu(false);
              setShowGiphyPicker(true);
            }}
          >
            <View style={[styles.attachIcon, { backgroundColor: '#FF6B6B' }]}>
              <Text style={styles.gifIcon}>GIF</Text>
            </View>
            <Text style={styles.attachText}>GIF</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* GIF Picker Modal */}
      <Modal
        visible={showGiphyPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGiphyPicker(false)}
      >
        <View style={styles.giphyModalContainer}>
          <TouchableOpacity 
            style={styles.giphyModalOverlay} 
            onPress={() => setShowGiphyPicker(false)}
            activeOpacity={1}
          />
          <View style={styles.giphyModalContent}>
            <GiphyPicker
              colors={colors}
              onSelect={sendGif}
              onClose={() => setShowGiphyPicker(false)}
            />
          </View>
        </View>
      </Modal>

      {/* Input */}
      <View style={styles.inputContainer}>
        {isRecording ? (
          <VoiceRecorder
            colors={colors}
            onSend={sendVoiceMessage}
            onCancel={() => setIsRecording(false)}
          />
        ) : (
          <>
            <TouchableOpacity 
              style={styles.attachButton} 
              onPress={() => setShowAttachMenu(!showAttachMenu)}
            >
              <Ionicons 
                name={showAttachMenu ? 'close' : 'add-circle'} 
                size={28} 
                color={showAttachMenu ? colors.error : colors.primary} 
              />
            </TouchableOpacity>
            
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={colors.textSecondary}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text);
                handleTyping();
                if (showAttachMenu) setShowAttachMenu(false);
              }}
              multiline
              maxLength={2000}
            />

            {newMessage.trim() ? (
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={sending}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.micButton}
                onPress={() => setIsRecording(true)}
              >
                <Ionicons name="mic" size={26} color={colors.primary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
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
      paddingTop: 50,
      paddingBottom: 12,
      paddingHorizontal: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerInfo: {
      flex: 1,
      marginLeft: 4,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    onlineStatus: {
      fontSize: 12,
      color: '#22C55E',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 4,
    },
    headerButton: {
      padding: 8,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      marginTop: 8,
    },
    typingBubble: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 20,
      borderBottomLeftRadius: 4,
    },
    typingDots: {
      flexDirection: 'row',
      gap: 4,
    },
    typingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    typingText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: 8,
    },
    attachMenu: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 16,
      paddingHorizontal: 24,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    attachOption: {
      alignItems: 'center',
      gap: 8,
    },
    attachIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    attachText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 32, // Increased for better visibility above navigation bar
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    attachButton: {
      padding: 6,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      backgroundColor: colors.background,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.7,
    },
    micButton: {
      padding: 6,
    },
    gifIcon: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
    },
    giphyModalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    giphyModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    giphyModalContent: {
      height: '70%',
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
  });
