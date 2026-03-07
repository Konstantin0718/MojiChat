import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, User, Conversation } from '../types';
import { API_URL } from '../config';

interface MessageBubbleProps {
  message: Message;
  currentUser: User | null;
  conversation: Conversation | null;
  colors: any;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message: msg,
  currentUser: user,
  conversation,
  colors,
}) => {
  const [revealed, setRevealed] = useState(false);
  const isOwn = msg.sender_id === user?.user_id;
  const styles = createStyles(colors);

  // Get translated content
  const getDisplayContent = () => {
    if (msg.translations && user?.preferred_language && msg.translations[user.preferred_language]) {
      return msg.translations[user.preferred_language];
    }
    return msg.content;
  };

  // Render media messages
  if (msg.message_type === 'image' && msg.file_url) {
    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        <TouchableOpacity
          style={[styles.imageMessage, isOwn && styles.messageOwn]}
          onPress={() => {/* Open full image */}}
        >
          <Image
            source={{ uri: `${API_URL}${msg.file_url}` }}
            style={styles.messageImage}
            resizeMode="cover"
          />
          <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (msg.message_type === 'audio' && msg.file_url) {
    return (
      <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
        <View style={[styles.messageBubble, isOwn ? styles.messageOwn : styles.messageOther]}>
          <View style={styles.audioMessage}>
            <Ionicons name="mic" size={20} color={isOwn ? '#fff' : colors.text} />
            <View style={styles.audioWaveform}>
              {[...Array(15)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.audioBar,
                    { height: Math.random() * 16 + 8, backgroundColor: isOwn ? '#fff' : colors.primary }
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.audioDuration, { color: isOwn ? '#fff' : colors.textSecondary }]}>
              {msg.duration ? `${Math.floor(msg.duration / 60)}:${(msg.duration % 60).toString().padStart(2, '0')}` : '0:00'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Text message with emoji reveal
  return (
    <View style={[styles.messageRow, isOwn && styles.messageRowOwn]}>
      <TouchableOpacity
        style={[styles.messageBubble, isOwn ? styles.messageOwn : styles.messageOther]}
        onPress={() => setRevealed(!revealed)}
        activeOpacity={0.8}
      >
        {!isOwn && conversation?.is_group && (
          <Text style={styles.senderName}>{msg.sender_name}</Text>
        )}
        
        {revealed ? (
          <View>
            <View style={styles.revealedContent}>
              <Ionicons name="eye" size={14} color={isOwn ? '#fff' : colors.textSecondary} />
              <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
                {getDisplayContent()}
              </Text>
            </View>
            {msg.translations && user?.preferred_language && msg.translations[user.preferred_language] && (
              <Text style={[styles.originalText, isOwn && styles.originalTextOwn]}>
                Original: {msg.content}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.emojiContent}>{msg.emoji_content || '🔮'}</Text>
        )}

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <View style={styles.reactionsContainer}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <View key={emoji} style={styles.reactionBadge}>
                <Text>{emoji}</Text>
                <Text style={styles.reactionCount}>{(users as string[]).length}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.messageFooter}>
          <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isOwn && (
            <Ionicons
              name={msg.read_by.length > 1 ? 'checkmark-done' : 'checkmark'}
              size={16}
              color={msg.read_by.length > 1 ? colors.accent : (isOwn ? '#fff' : colors.textSecondary)}
            />
          )}
        </View>
        
        {!revealed && (
          <Text style={[styles.tapHint, isOwn && styles.tapHintOwn]}>tap to reveal</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    messageRow: {
      marginBottom: 8,
      alignItems: 'flex-start',
    },
    messageRowOwn: {
      alignItems: 'flex-end',
    },
    messageBubble: {
      maxWidth: '80%',
      padding: 12,
      borderRadius: 20,
    },
    messageOwn: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    messageOther: {
      backgroundColor: colors.card,
      borderBottomLeftRadius: 4,
    },
    senderName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: 4,
    },
    revealedContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    messageText: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
      flex: 1,
    },
    messageTextOwn: {
      color: '#fff',
    },
    emojiContent: {
      fontSize: 24,
      letterSpacing: 2,
    },
    originalText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    originalTextOwn: {
      color: 'rgba(255,255,255,0.7)',
      borderTopColor: 'rgba(255,255,255,0.2)',
    },
    messageFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 4,
      gap: 4,
    },
    messageTime: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    messageTimeOwn: {
      color: 'rgba(255,255,255,0.7)',
    },
    tapHint: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 4,
      opacity: 0.6,
    },
    tapHintOwn: {
      color: 'rgba(255,255,255,0.5)',
    },
    imageMessage: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    messageImage: {
      width: 200,
      height: 200,
      borderRadius: 12,
    },
    audioMessage: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    audioWaveform: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      flex: 1,
    },
    audioBar: {
      width: 3,
      borderRadius: 2,
    },
    audioDuration: {
      fontSize: 12,
    },
    reactionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
      gap: 4,
    },
    reactionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
    },
    reactionCount: {
      fontSize: 12,
      color: colors.textSecondary,
    },
  });
