import React, { useState, useEffect, useRef } from 'react';
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

interface Message {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

interface Props {
  route: any;
  navigation: any;
}

export const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { conversationId } = route.params || {};
  const { user } = useAuth();
  const { colors } = useTheme();
  
  // DEBUG: Log conversationId
  console.log("Loading chat for ID:", conversationId);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationName, setConversationName] = useState('Chat');
  const [debugInfo, setDebugInfo] = useState('');
  
  const flatListRef = useRef<FlatList>(null);

  // Check if conversationId exists
  useEffect(() => {
    if (!conversationId) {
      Alert.alert("Error", "No conversation ID provided");
      setLoading(false);
      return;
    }
    
    loadMessages();
    loadConversation();
    
    // Poll for new messages every 3 seconds
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const loadConversation = async () => {
    try {
      const conv = await api.getConversation(conversationId);
      if (conv.name) {
        setConversationName(conv.name);
      } else if (conv.participants) {
        const other = conv.participants.find((p: any) => p.user_id !== user?.user_id);
        setConversationName(other?.name || 'Chat');
      }
    } catch (e) {
      console.log('Failed to load conversation');
    }
  };

  const loadMessages = async () => {
    if (!conversationId) return;
    
    console.log("Fetching messages for:", conversationId);
    
    try {
      const data = await api.getMessages(conversationId);
      console.log("Messages received:", data?.length || 0);
      setDebugInfo(`Loaded ${data?.length || 0} messages`);
      
      if (Array.isArray(data)) {
        setMessages(data.reverse()); // Oldest first
      } else {
        console.log("Data is not array:", typeof data);
        setMessages([]);
      }
    } catch (err: any) {
      console.log('Failed to load messages:', err);
      Alert.alert("Chat Load Error", JSON.stringify(err?.message || err));
      setDebugInfo(`Error: ${err?.message || 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || sending) return;
    
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    
    try {
      await api.sendMessage(conversationId, text, 'text');
      await loadMessages();
      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      console.log('Failed to send message');
      setInputText(text); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.user_id;
    
    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        <View style={[
          styles.messageBubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          { backgroundColor: isOwn ? colors.primary : colors.card }
        ]}>
          <Text style={[
            styles.messageText,
            { color: isOwn ? '#fff' : colors.text }
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            { color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textSecondary }
          ]}>
            {new Date(item.created_at).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </View>
    );
  };

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
    messageRow: {
      marginVertical: 4,
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },
    messageRowOwn: {
      justifyContent: 'flex-end',
    },
    messageBubble: {
      maxWidth: '80%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    bubbleOwn: {
      borderBottomRightRadius: 4,
    },
    bubbleOther: {
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 16,
      lineHeight: 22,
      fontFamily: 'System',
    },
    messageTime: {
      fontSize: 11,
      marginTop: 4,
      textAlign: 'right',
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
      fontFamily: 'System',
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
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 40,
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
        behavior="height"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 120}
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

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item, index) => item.message_id || index.toString()}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={[styles.emptyText, { fontSize: 12, marginTop: 8 }]}>
                ID: {conversationId || 'undefined'}
              </Text>
              <Text style={[styles.emptyText, { fontSize: 10, marginTop: 4 }]}>
                {debugInfo}
              </Text>
            </View>
          }
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
              (!inputText.trim() || sending) && styles.sendButtonDisabled
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
