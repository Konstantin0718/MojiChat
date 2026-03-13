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
import { AudioPlayer } from './AudioPlayer';

interface MessageBubbleProps {
  message: Message;
  currentUser: User | null;
  conversation: Conversation | null;
  colors: any;
  emojiModeEnabled?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message: msg,
  currentUser: user,
  conversation,
  colors,
  emojiModeEnabled = true,
}) => {
  const [revealed, setRevealed] = useState(true); // Always revealed by default
  const isOwn = msg.sender_id === user?.user_id;
  const styles = createStyles(colors, isOwn);

  // Get content - always show original, no auto-translate
  const getDisplayContent = () => {
    return msg.content;
  };

  // Render media messages
  if (msg.message_type === 'image' && msg.file_url) {
    return (
      <View style={styles.messageRow}>
        <TouchableOpacity
          style={[styles.imageBubble, isOwn && styles.messageOwn]}
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

  // Render GIF messages
  if (msg.message_type === 'gif' && msg.file_url) {
    const gifUrl = msg.file_url.startsWith('http') ? msg.file_url : `${API_URL}${msg.file_url}`;
    return (
      <View style={styles.messageRow}>
        <TouchableOpacity
          style={[styles.gifMessage, isOwn && styles.messageOwn]}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: gifUrl }}
            style={styles.gifImage}
            resizeMode="contain"
          />
          <View style={styles.gifFooter}>
            <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isOwn && (
              <Ionicons
                name={msg.read_by.length > 1 ? 'checkmark-done' : 'checkmark'}
                size={16}
                color={msg.read_by.length > 1 ? colors.accent : 'rgba(255,255,255,0.7)'}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  if (msg.message_type === 'audio' && msg.file_url) {
    return (
      <View style={styles.messageRow}>
        <View style={[styles.messageBubble, styles.audioBubble, isOwn ? styles.messageOwn : styles.messageOther]}>
          <AudioPlayer
            uri={`${API_URL}${msg.file_url}`}
            duration={msg.duration}
            isOwn={isOwn}
            colors={colors}
          />
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isOwn && (
              <Ionicons
                name={msg.read_by.length > 1 ? 'checkmark-done' : 'checkmark'}
                size={16}
                color={msg.read_by.length > 1 ? colors.accent : 'rgba(255,255,255,0.7)'}
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  // Simple text message - always visible, no tap to reveal
  return (
    <View style={styles.messageRow}>
      <View style={[styles.messageBubble, isOwn ? styles.messageOwn : styles.messageOther]}>
        {!isOwn && conversation?.is_group && (
          <Text style={styles.senderName}>{msg.sender_name}</Text>
        )}
        
        <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
          {getDisplayContent()}
        </Text>

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
      </View>
    </View>
  );
};

const createStyles = (colors: any, isOwn: boolean) =>
  StyleSheet.create({
    messageRow: {
      marginBottom: 8,
      alignItems: isOwn ? 'flex-end' : 'flex-start',
    },
    messageBubble: {
      maxWidth: '85%',
      padding: 12,
      borderRadius: 20,
      alignSelf: isOwn ? 'flex-end' : 'flex-start',
    },
    audioBubble: {
      minWidth: 240,
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
      fontFamily: 'System',
    },
    messageText: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
      flexWrap: 'wrap',
      fontFamily: 'System',
    },
    messageTextOwn: {
      color: '#fff',
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
    imageBubble: {
      borderRadius: 16,
      overflow: 'hidden',
      alignSelf: isOwn ? 'flex-end' : 'flex-start',
    },
    messageImage: {
      width: 200,
      height: 200,
      borderRadius: 12,
    },
    gifMessage: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: 'transparent',
      padding: 4,
    },
    gifImage: {
      width: 220,
      height: 165,
      borderRadius: 12,
    },
    gifFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingTop: 4,
      paddingHorizontal: 4,
      gap: 4,
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
