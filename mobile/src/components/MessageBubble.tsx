import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, User, Conversation } from '../types';
import { API_URL } from '../config';
import { api } from '../services/api';

// Language detection heuristics
const detectLanguage = (text: string): string => {
  if (!text) return 'en';
  if (/[\u0400-\u04FF]/.test(text)) return /[\u0404\u0406\u0407\u0490\u0491]/.test(text) ? 'uk' : /[\u0451\u0449\u044A\u044B\u044D]/.test(text) ? 'ru' : 'bg';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[äöüßÄÖÜ]/.test(text)) return 'de';
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr';
  if (/[ñáéíóú¿¡]/i.test(text)) return 'es';
  if (/[ğışçöüĞİŞÇÖÜ]/.test(text)) return 'tr';
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'pl';
  return 'en';
};

const LANG_FLAGS: Record<string, string> = {
  bg: '🇧🇬', en: '🇬🇧', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', it: '🇮🇹',
  ru: '🇷🇺', tr: '🇹🇷', zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', ar: '🇸🇦',
  pt: '🇵🇹', nl: '🇳🇱', pl: '🇵🇱', uk: '🇺🇦',
};

interface Props {
  message: Message;
  currentUser: User | null;
  conversation: Conversation | null;
  colors: any;
  translationLanguage?: string;
}

export const MessageBubble: React.FC<Props> = ({
  message,
  currentUser,
  conversation,
  colors,
  translationLanguage = 'bg',
}) => {
  const isOwn = message.sender_id === currentUser?.user_id;
  const [isRevealed, setIsRevealed] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [lastTranslatedLang, setLastTranslatedLang] = useState<string | null>(null);

  const hasEmoji = !!message.emoji_content;
  const detectedLang = detectLanguage(message.content);
  const langFlag = LANG_FLAGS[detectedLang] || '🌐';
  const hasTranslation = !!translatedText && translatedText !== message.content;

  const doTranslate = useCallback(async () => {
    // Skip if already translated with same language
    if (translatedText && lastTranslatedLang === translationLanguage) return;
    setIsTranslating(true);
    try {
      const targetLang = translationLanguage === 'auto' ? 'bg' : (translationLanguage || 'bg');
      const result = await api.translate(message.content, targetLang);
      setTranslatedText(result.translated);
      setLastTranslatedLang(translationLanguage);
    } catch (_) {
      setTranslatedText(null);
    }
    setIsTranslating(false);
  }, [translatedText, lastTranslatedLang, translationLanguage, message.content]);

  const handleTap = async () => {
    if (!isRevealed) {
      setIsRevealed(true);
      // Only translate received messages, NOT own messages
      if (!isOwn) {
        await doTranslate();
      }
    } else {
      setIsRevealed(false);
    }
  };

  // Image
  if (message.message_type === 'image' && message.file_url) {
    return (
      <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
        <Image
          source={{ uri: `${API_URL}${message.file_url}` }}
          style={styles.image}
          resizeMode="cover"
        />
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
    );
  }

  // GIF
  if (message.message_type === 'gif' && message.file_url) {
    const url = message.file_url.startsWith('http')
      ? message.file_url
      : `${API_URL}${message.file_url}`;
    return (
      <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
        <Image source={{ uri: url }} style={styles.gif} resizeMode="contain" />
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
    );
  }

  // Text/Emoji message
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleTap}
      style={[
        styles.bubble,
        isOwn ? styles.bubbleOwn : styles.bubbleOther,
        { backgroundColor: isOwn ? colors.primary : colors.card },
      ]}
    >
      {!isOwn && conversation?.is_group && (
        <Text style={[styles.sender, { color: colors.primary }]}>
          {message.sender_name}
        </Text>
      )}

      {isRevealed ? (
        /* REVEALED STATE */
        <View>
          {isOwn ? (
            /* OWN MESSAGE: just show original text, no translation */
            <Text style={[styles.text, { color: '#fff' }]}>
              {message.content}
            </Text>
          ) : (
            /* RECEIVED MESSAGE: show translation + original */
            <>
              {isTranslating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Ionicons name="language" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    <Text style={[styles.text, { color: colors.text, flex: 1 }]}>
                      {translatedText || message.content}
                    </Text>
                  </View>
                  {hasTranslation && (
                    <View style={[styles.divider, { borderTopColor: 'rgba(128,128,128,0.2)' }]}>
                      <Text style={[styles.originalLabel, { color: colors.textSecondary }]}>
                        Original ({langFlag}):
                      </Text>
                      <Text style={[styles.originalText, { color: colors.textSecondary }]}>
                        {message.content}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
          <Text style={[styles.tapHint, { color: isOwn ? 'rgba(255,255,255,0.4)' : colors.textSecondary }]}>
            {hasEmoji ? 'tap for emoji' : 'tap to close'}
          </Text>
        </View>
      ) : hasEmoji ? (
        /* EMOJI MODE */
        <View>
          <Text style={styles.emojiText}>{message.emoji_content}</Text>
          <Text style={[styles.tapHint, { color: isOwn ? 'rgba(255,255,255,0.4)' : colors.textSecondary }]}>
            tap to reveal
          </Text>
        </View>
      ) : (
        /* PLAIN TEXT */
        <View>
          <Text style={[styles.text, { color: isOwn ? '#fff' : colors.text }]}>
            {message.content}
          </Text>
          {!isOwn && (
            <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
              tap to translate
            </Text>
          )}
        </View>
      )}

      {/* Footer: language badge + time + read status */}
      <View style={styles.footer}>
        <Text style={[styles.langBadge, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
          {langFlag}
        </Text>
        <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>
          {formatTime(message.created_at)}
        </Text>
        {isOwn && (
          <Ionicons
            name={message.read_by?.length > 1 ? 'checkmark-done' : 'checkmark'}
            size={14}
            color={message.read_by?.length > 1 ? '#34C759' : 'rgba(255,255,255,0.6)'}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  containerOwn: { alignSelf: 'flex-end' },
  containerOther: { alignSelf: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginVertical: 4,
  },
  bubbleOwn: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  sender: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  text: { fontSize: 16, lineHeight: 22 },
  emojiText: { fontSize: 28, lineHeight: 36, letterSpacing: 2 },
  divider: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  originalLabel: { fontSize: 11, marginBottom: 2 },
  originalText: { fontSize: 12, lineHeight: 16, fontStyle: 'italic' },
  tapHint: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  langBadge: { fontSize: 12 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: { fontSize: 11 },
  image: { width: 200, height: 200, borderRadius: 12 },
  gif: { width: 200, height: 150, borderRadius: 12 },
});
