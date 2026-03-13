import React from 'react';
import {
  View,
  Text,
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
  const isOwn = msg.sender_id === user?.user_id;

  // Image message
  if (msg.message_type === 'image' && msg.file_url) {
    return (
      <View style={[styles.messageContainer, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
        <Image
          source={{ uri: `${API_URL}${msg.file_url}` }}
          style={styles.messageImage}
          resizeMode="cover"
        />
        <Text style={styles.timeText}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  // GIF message
  if (msg.message_type === 'gif' && msg.file_url) {
    const gifUrl = msg.file_url.startsWith('http') ? msg.file_url : `${API_URL}${msg.file_url}`;
    return (
      <View style={[styles.messageContainer, { alignSelf: isOwn ? 'flex-end' : 'flex-start' }]}>
        <Image
          source={{ uri: gifUrl }}
          style={styles.gifImage}
          resizeMode="contain"
        />
        <Text style={styles.timeText}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  // Text message - ALWAYS VISIBLE, no tap to reveal
  return (
    <View style={[
      styles.messageContainer,
      {
        maxWidth: '85%',
        padding: 12,
        borderRadius: 16,
        backgroundColor: isOwn ? '#007AFF' : '#E5E5EA',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: 8,
      }
    ]}>
      {!isOwn && conversation?.is_group && (
        <Text style={styles.senderName}>{msg.sender_name}</Text>
      )}
      
      <Text style={[
        styles.messageText,
        { color: isOwn ? '#FFFFFF' : '#000000' }
      ]}>
        {msg.content}
      </Text>

      <View style={styles.footer}>
        <Text style={[
          styles.timeText,
          { color: isOwn ? 'rgba(255,255,255,0.7)' : '#8E8E93' }
        ]}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {isOwn && (
          <Ionicons
            name={msg.read_by && msg.read_by.length > 1 ? 'checkmark-done' : 'checkmark'}
            size={16}
            color={msg.read_by && msg.read_by.length > 1 ? '#34C759' : 'rgba(255,255,255,0.7)'}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    marginBottom: 8,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'System',
    flexWrap: 'wrap',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  gifImage: {
    width: 220,
    height: 165,
    borderRadius: 12,
  },
});
