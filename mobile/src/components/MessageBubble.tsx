import React, { useState } from 'react';
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

interface Props {
  message: Message;
  currentUser: User | null;
  conversation: Conversation | null;
  colors: any;
  userLanguage?: string;
}

export const MessageBubble: React.FC<Props> = ({
  message,
  currentUser,
  conversation,
  colors,
  userLanguage = 'en',
}) => {
  const isOwn = message.sender_id === currentUser?.user_id;
  const [isRevealed, setIsRevealed] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const hasEmoji = !!message.emoji_content;

  const handleTap = async () => {
    if (!hasEmoji) return;

    if (!isRevealed) {
      // Reveal: translate if not already done
      if (!translatedText) {
        setIsTranslating(true);
        try {
          // Use userLanguage or 'auto' for auto-detect
          const targetLang = userLanguage || 'auto';
          const result = await api.translate(message.content, targetLang);
          setTranslatedText(result.translated);
        } catch (_) {
          setTranslatedText(null);
        }
        setIsTranslating(false);
      }
    }
    setIsRevealed(!isRevealed);
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

  // Text message with emoji reveal
  return (
    <TouchableOpacity
      activeOpacity={hasEmoji ? 0.7 : 1}
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

      {isRevealed || !hasEmoji ? (
        // Revealed: show translated text + original
        <View>
          {isTranslating ? (
            <ActivityIndicator size="small" color={isOwn ? '#fff' : colors.primary} />
          ) : (
            <>
              <Text style={[styles.text, { color: isOwn ? '#fff' : colors.text }]}>
                {translatedText || message.content}
              </Text>
              {translatedText && translatedText !== message.content && (
                <Text
                  style={[
                    styles.originalText,
                    { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.textSecondary },
                  ]}
                >
                  {message.content}
                </Text>
              )}
            </>
          )}
          {hasEmoji && (
            <Text
              style={[
                styles.tapHint,
                { color: isOwn ? 'rgba(255,255,255,0.5)' : colors.textSecondary },
              ]}
            >
              tap for emoji
            </Text>
          )}
        </View>
      ) : (
        // Emoji mode
        <View>
          <Text style={styles.emojiText}>
            {message.emoji_content}
          </Text>
          <Text
            style={[
              styles.tapHint,
              { color: isOwn ? 'rgba(255,255,255,0.5)' : colors.textSecondary },
            ]}
          >
            tap to reveal
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text
          style={[
            styles.time,
            { color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
          ]}
        >
          {formatTime(message.created_at)}
        </Text>
        {isOwn && (
          <Ionicons
            name={message.read_by?.length > 1 ? 'checkmark-done' : 'checkmark'}
            size={14}
            color={
              message.read_by?.length > 1 ? '#34C759' : 'rgba(255,255,255,0.7)'
            }
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  containerOwn: {
    alignSelf: 'flex-end',
  },
  containerOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginVertical: 4,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  sender: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  originalText: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  emojiText: {
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 2,
  },
  tapHint: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: 11,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  gif: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
});
