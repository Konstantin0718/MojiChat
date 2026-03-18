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
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { MessageBubble } from '../components/MessageBubble';

interface Message {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  emoji_content?: string;
  translations?: Record<string, string>;
  reactions?: Record<string, string[]>;
  read_by?: string[];
  message_type?: string;
  file_url?: string;
  created_at: string;
}

interface Props {
  route: any;
  navigation: any;
}

export const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const conversationId = route?.params?.conversationId;
  const paramName = route?.params?.name;

  const { user } = useAuth();
  const { colors } = useTheme();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationName, setConversationName] = useState(paramName || 'Chat');

  const flatListRef = useRef<FlatList>(null);

  const [conversationData, setConversationData] = useState<any>(null);

  useEffect(() => {
    if (!conversationId) {
      Alert.alert('Error', 'No conversation ID provided');
      setLoading(false);
      return;
    }

    loadMessages();
    loadConversation();

    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const loadConversation = async () => {
    if (!conversationId) return;
    try {
      const conv = await api.getConversation(conversationId);
      setConversationData(conv);
      if (conv.name) {
        setConversationName(conv.name);
      } else if (conv.participants) {
        const other = conv.participants.find((p: any) => p.user_id !== user?.user_id);
        setConversationName(other?.name || paramName || 'Chat');
      }
    } catch (_) {}
  };

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await api.getMessages(conversationId);
      if (Array.isArray(data)) {
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMessages(prev => {
          // Only update if messages changed (preserve reveal/translation state)
          if (prev.length !== sorted.length) return sorted;
          if (prev[0]?.message_id !== sorted[0]?.message_id) return sorted;
          return prev;
        });
      } else {
        setMessages([]);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const sendMessage = async () => {
    if (!inputText.trim() || sending || !conversationId) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await api.sendMessage(conversationId, text, 'text');
      await loadMessages();
    } catch (e: any) {
      setInputText(text);
      Alert.alert('Send Error', e?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        currentUser={user}
        conversation={conversationData}
        colors={colors}
        userLanguage={user?.preferred_language || 'en'}
      />
    ),
    [user, conversationData, colors]
  );

  const keyExtractor = useCallback(
    (item: Message, index: number) => item.message_id || `msg-${index}`,
    []
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: Platform.OS === 'ios' ? 50 : 10,
      paddingBottom: 12,
      paddingHorizontal: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginLeft: 8,
    },
    messagesList: {
      flex: 1,
      paddingHorizontal: 12,
    },
    messagesContent: {
      paddingVertical: 12,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 30,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      backgroundColor: colors.background,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      marginRight: 10,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: colors.border,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
      // Flip text back upright inside inverted FlatList
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversationName}
          </Text>
        </View>

        {/* Messages - inverted: data[0] (newest) renders at the bottom */}
        <FlatList
          ref={flatListRef}
          inverted
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={styles.messagesList}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && { flexGrow: 1 },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 8 }]}>
                Start the conversation!
              </Text>
            </View>
          }
          // No manual scroll-to logic - let inverted handle it naturally
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
