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
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import { MessageBubble } from '../components/MessageBubble';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { GiphyPicker } from '../components/GiphyPicker';

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

// Common emojis for quick picker
const EMOJI_ROWS = [
  ['😀','😂','🥰','😍','😘','🤗','😎','🤩','😋','😜','🤔','😏','😢','😭','😤','🤬'],
  ['👍','👎','👋','🤝','🙏','💪','✌️','🤞','👌','🤘','👏','🫶','❤️','🔥','💯','✨'],
  ['🎉','🎊','🎁','🎈','💐','🌹','🍕','☕','🍺','🎵','⚽','🏆','🚀','💎','👑','🌈'],
];

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
  const [showToolbar, setShowToolbar] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

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
    } catch (_) {}
    finally { setLoading(false); }
  }, [conversationId]);

  // ============ SEND FUNCTIONS ============

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
      Alert.alert('Error', e?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  const sendVoiceMessage = async (audioData: string, duration: number) => {
    if (!conversationId) return;
    setSending(true);
    try {
      const uploadRes = await api.uploadVoice(audioData, duration);
      await api.sendMessage(conversationId, 'Voice message', 'audio', uploadRes.file_url);
      setShowVoiceRecorder(false);
      await loadMessages();
    } catch (e) {
      Alert.alert('Error', 'Failed to send voice message');
    } finally { setSending(false); }
  };

  const sendGif = async (gif: any) => {
    if (!conversationId) return;
    setSending(true);
    try {
      const url = gif.original_url || gif.url;
      await api.sendMessage(conversationId, gif.title || 'GIF', 'gif', url);
      setShowGiphyPicker(false);
      await loadMessages();
    } catch (e) {
      Alert.alert('Error', 'Failed to send GIF');
    } finally { setSending(false); }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadAndSendFile(result.assets[0].uri, result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      await uploadAndSendFile(result.assets[0].uri, 'image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets?.[0]) {
        await uploadAndSendFile(result.assets[0].uri, 'file', result.assets[0].name);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const uploadAndSendFile = async (uri: string, type: string, fileName?: string) => {
    if (!conversationId) return;
    setSending(true);
    setShowToolbar(false);
    try {
      const uploadRes = await api.uploadFile(uri, fileName);
      await api.sendMessage(
        conversationId,
        fileName || (type === 'image' ? 'Photo' : 'File'),
        type,
        uploadRes.file_url
      );
      await loadMessages();
    } catch (e) {
      Alert.alert('Error', 'Failed to send file');
    } finally { setSending(false); }
  };

  // ============ LANGUAGE ============

  const selectLanguage = async (langCode: string) => {
    setTranslationLang(langCode);
    await AsyncStorage.setItem('mojichat_translation_lang', langCode);
    setShowLangModal(false);
  };

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await api.deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === messageId ? { ...m, deleted: true, content: '', emoji_content: '' } : m
        )
      );
    } catch (e) {
      Alert.alert('Error', 'Could not delete message');
    }
  }, []);

  // ============ RENDER ============

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        currentUser={user}
        conversation={conversationData}
        colors={colors}
        translationLanguage={translationLang}
        onDelete={handleDeleteMessage}
      />
    ),
    [user, conversationData, colors, translationLang, handleDeleteMessage]
  );

  const keyExtractor = useCallback(
    (item: Message, index: number) => item.message_id || `msg-${index}`,
    []
  );

  const currentLangData = LANGUAGES[translationLang] || LANGUAGES.bg;

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {conversationName}
        </Text>
        <TouchableOpacity
          style={[s.langBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => setShowLangModal(true)}
        >
          <Text style={{ fontSize: 16 }}>{currentLangData.flag}</Text>
          <Text style={[s.langBtnText, { color: colors.text }]}>{currentLangData.native}</Text>
          <Ionicons name="globe-outline" size={14} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* KeyboardAvoidingView wraps messages + input */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          inverted
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={s.messagesList}
          contentContainerStyle={[s.messagesContent, messages.length === 0 && { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={[s.emptyContainer, { transform: [{ scaleY: -1 }] }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>No messages yet</Text>
            </View>
          }
        />

        {/* Emoji Quick Picker */}
        {showEmojiPicker && (
          <View style={[s.emojiPicker, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <View style={s.emojiPickerHeader}>
              <Text style={[s.emojiPickerTitle, { color: colors.text }]}>Emojis</Text>
              <TouchableOpacity onPress={() => setShowEmojiPicker(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 160 }}>
              {EMOJI_ROWS.map((row, ri) => (
                <View key={ri} style={s.emojiRow}>
                  {row.map((emoji, ei) => (
                    <TouchableOpacity
                      key={ei}
                      onPress={() => setInputText(prev => prev + emoji)}
                      style={s.emojiBtn}
                    >
                      <Text style={{ fontSize: 26 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Toolbar Expanded (file, camera, gallery, giphy) */}
        {showToolbar && (
          <View style={[s.toolbar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity style={[s.toolbarBtn, { backgroundColor: '#FF6B35' }]} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={s.toolbarLabel}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toolbarBtn, { backgroundColor: '#7C3AED' }]} onPress={pickImage}>
              <Ionicons name="images" size={24} color="#fff" />
              <Text style={s.toolbarLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toolbarBtn, { backgroundColor: '#06B6D4' }]} onPress={pickDocument}>
              <Ionicons name="document" size={24} color="#fff" />
              <Text style={s.toolbarLabel}>File</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toolbarBtn, { backgroundColor: '#10B981' }]} onPress={() => { setShowToolbar(false); setShowGiphyPicker(true); }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff' }}>GIF</Text>
              <Text style={s.toolbarLabel}>Giphy</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input Area */}
        {showVoiceRecorder ? (
          <View style={[s.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <VoiceRecorder
              colors={colors}
              onSend={sendVoiceMessage}
              onCancel={() => setShowVoiceRecorder(false)}
            />
          </View>
        ) : (
          <View style={[s.inputContainer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            {/* Plus/attachment button */}
            <TouchableOpacity
              style={s.inputBtn}
              onPress={() => { setShowToolbar(!showToolbar); setShowEmojiPicker(false); }}
            >
              <Ionicons name={showToolbar ? 'close' : 'add-circle'} size={28} color={colors.primary} />
            </TouchableOpacity>

            {/* Emoji button */}
            <TouchableOpacity
              style={s.inputBtn}
              onPress={() => { setShowEmojiPicker(!showEmojiPicker); setShowToolbar(false); }}
            >
              <Ionicons name="happy-outline" size={24} color={colors.primary} />
            </TouchableOpacity>

            {/* Text input */}
            <TextInput
              style={[s.textInput, { backgroundColor: colors.background, color: colors.text }]}
              placeholder="Message..."
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              onFocus={() => { setShowToolbar(false); setShowEmojiPicker(false); }}
            />

            {/* Voice or Send */}
            {inputText.trim() ? (
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: colors.primary }]}
                onPress={sendMessage}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.inputBtn} onPress={() => setShowVoiceRecorder(true)}>
                <Ionicons name="mic" size={24} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Giphy Modal */}
      <Modal visible={showGiphyPicker} animationType="slide" onRequestClose={() => setShowGiphyPicker(false)}>
        <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
          <GiphyPicker
            colors={colors}
            onSelect={sendGif}
            onClose={() => setShowGiphyPicker(false)}
          />
        </SafeAreaView>
      </Modal>

      {/* Language Modal */}
      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowLangModal(false)}>
          <View style={[s.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Превод на съобщения</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.entries(LANGUAGES).map(([code, data]) => (
                <TouchableOpacity
                  key={code}
                  style={[
                    s.langOption,
                    { backgroundColor: translationLang === code ? colors.primary + '20' : colors.background },
                    translationLang === code && { borderWidth: 2, borderColor: colors.primary },
                  ]}
                  onPress={() => selectLanguage(code)}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>{data.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.langName, { color: colors.text }]}>{data.native}</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>{data.name}</Text>
                  </View>
                  {translationLang === code && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 0,  //
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', marginLeft: 8 },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  langBtnText: { fontSize: 13, fontWeight: '500' },
  messagesList: { flex: 1, paddingHorizontal: 12 },
  messagesContent: { paddingVertical: 12 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  // Input area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    gap: 4,
  },
  inputBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Toolbar
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  toolbarBtn: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarLabel: { color: '#fff', fontSize: 10, marginTop: 2, fontWeight: '600' },
  // Emoji picker
  emojiPicker: { borderTopWidth: 1, paddingHorizontal: 8, paddingBottom: 8 },
  emojiPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  emojiPickerTitle: { fontSize: 16, fontWeight: '600' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 4 },
  emojiBtn: { padding: 4 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', maxHeight: '70%', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  langOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4 },
  langName: { fontSize: 16, fontWeight: '500' },
});
