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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { Message, Conversation } from '../types';
import { MessageBubble } from '../components/MessageBubble';

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
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    
    const interval = setInterval(() => {
      fetchMessages();
      fetchTyping();
    }, 2000);
    
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
    try {
      await api.setTyping(conversationId, true);
    } catch (e) {}

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      try {
        await api.setTyping(conversationId, false);
      } catch (e) {}
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
      keyboardVerticalOffset={0}
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

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachButton}>
          <Ionicons name="attach" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          value={newMessage}
          onChangeText={(text) => {
            setNewMessage(text);
            handleTyping();
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
          <TouchableOpacity style={styles.micButton}>
            <Ionicons name="mic" size={24} color={colors.primary} />
          </TouchableOpacity>
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
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    attachButton: {
      padding: 8,
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
      padding: 8,
    },
  });
