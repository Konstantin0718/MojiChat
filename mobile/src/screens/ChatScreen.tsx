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
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { MessageBubble } from '../components/MessageBubble';

const LANGUAGES: Record<string, { name: string; flag: string; native: string }> = {
  auto: { name: 'Auto-detect', flag: '🌐', native: 'Auto' },
  en: { name: 'English', flag: '🇬🇧', native: 'English' },
  bg: { name: 'Bulgarian', flag: '🇧🇬', native: 'Български' },
  de: { name: 'German', flag: '🇩🇪', native: 'Deutsch' },
  es: { name: 'Spanish', flag: '🇪🇸', native: 'Español' },
  fr: { name: 'French', flag: '🇫🇷', native: 'Français' },
  it: { name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
  ru: { name: 'Russian', flag: '🇷🇺', native: 'Русский' },
  tr: { name: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
  zh: { name: 'Chinese', flag: '🇨🇳', native: '中文' },
  ja: { name: 'Japanese', flag: '🇯🇵', native: '日本語' },
  ko: { name: 'Korean', flag: '🇰🇷', native: '한국어' },
  ar: { name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
  pt: { name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
  nl: { name: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
  pl: { name: 'Polish', flag: '🇵🇱', native: 'Polski' },
  uk: { name: 'Ukrainian', flag: '🇺🇦', native: 'Українська' },
};

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
  const [translationLang, setTranslationLang] = useState('bg');
  const [showLangModal, setShowLangModal] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const [conversationData, setConversationData] = useState<any>(null);

  // Load translation language from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('mojichat_translation_lang').then((lang) => {
      if (lang) setTranslationLang(lang);
    });
  }, []);

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

  const selectLanguage = async (langCode: string) => {
    setTranslationLang(langCode);
    await AsyncStorage.setItem('mojichat_translation_lang', langCode);
    setShowLangModal(false);
  };

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        currentUser={user}
        conversation={conversationData}
        colors={colors}
        translationLanguage={translationLang}
      />
    ),
    [user, conversationData, colors, translationLang]
  );

  const keyExtractor = useCallback(
    (item: Message, index: number) => item.message_id || `msg-${index}`,
    []
  );

  const currentLangData = LANGUAGES[translationLang] || LANGUAGES.bg;

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
    langButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    langButtonText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
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
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      width: '85%',
      maxHeight: '70%',
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 16,
    },
    langOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 4,
    },
    langOptionActive: {
      backgroundColor: colors.primary + '20',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    langOptionInactive: {
      backgroundColor: colors.background,
    },
    langFlag: {
      fontSize: 24,
      marginRight: 12,
    },
    langName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    langNameNative: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    langCheck: {
      marginLeft: 'auto',
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
          {/* Translation Language Selector */}
          <TouchableOpacity
            style={styles.langButton}
            onPress={() => setShowLangModal(true)}
          >
            <Text style={{ fontSize: 18 }}>{currentLangData.flag}</Text>
            <Text style={styles.langButtonText}>{currentLangData.native}</Text>
            <Ionicons name="globe-outline" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Language Selection Modal */}
        <Modal
          visible={showLangModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLangModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowLangModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Превод на съобщения</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Object.entries(LANGUAGES).map(([code, data]) => (
                  <TouchableOpacity
                    key={code}
                    style={[
                      styles.langOption,
                      translationLang === code ? styles.langOptionActive : styles.langOptionInactive,
                    ]}
                    onPress={() => selectLanguage(code)}
                  >
                    <Text style={styles.langFlag}>{data.flag}</Text>
                    <View>
                      <Text style={styles.langName}>{data.native}</Text>
                      <Text style={styles.langNameNative}>{data.name}</Text>
                    </View>
                    {translationLang === code && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.langCheck} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Messages */}
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
