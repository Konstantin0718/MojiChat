import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message, User, Conversation } from '../types';
import { API_URL } from '../config';

interface Props {
  message: Message;
  currentUser: User | null;
  conversation: Conversation | null;
  colors: any;
}

export const MessageBubble: React.FC<Props> = ({
  message,
  currentUser,
  conversation,
  colors,
}) => {
  const isOwn = message.sender_id === currentUser?.user_id;

  // Image
  if (message.message_type === 'image' && message.file_url) {
    return (
      <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
        <Image
          source={{ uri: `${API_URL}${message.file_url}` }}
          style={styles.image}
          resizeMode="cover"
        />
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
    );
  }

  // GIF
  if (message.message_type === 'gif' && message.file_url) {
    const url = message.file_url.startsWith('http') ? message.file_url : `${API_URL}${message.file_url}`;
    return (
      <View style={[styles.container, isOwn ? styles.containerOwn : styles.containerOther]}>
        <Image source={{ uri: url }} style={styles.gif} resizeMode="contain" />
        <Text style={[styles.time, isOwn && styles.timeOwn]}>{formatTime(message.created_at)}</Text>
      </View>
    );
  }

  // Text - ВИНАГИ ВИДИМ, БЕЗ "TAP TO REVEAL"
  return (
    <View style={[
      styles.bubble,
      isOwn ? styles.bubbleOwn : styles.bubbleOther,
      { backgroundColor: isOwn ? '#007AFF' : '#E5E5EA' }
    ]}>
      {!isOwn && conversation?.is_group && (
        <Text style={styles.sender}>{message.sender_name}</Text>
      )}
      
      <Text style={[styles.text, { color: isOwn ? '#FFFFFF' : '#000000' }]}>
        {message.content}
      </Text>

      <View style={styles.footer}>
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {formatTime(message.created_at)}
        </Text>
        {isOwn && (
          <Ionicons
            name={message.read_by?.length > 1 ? 'checkmark-done' : 'checkmark'}
            size={14}
            color={message.read_by?.length > 1 ? '#34C759' : 'rgba(255,255,255,0.7)'}
          />
        )}
      </View>
    </View>
  );
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    color: '#007AFF',
    marginBottom: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: 'wrap',
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
    color: '#8E8E93',
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.7)',
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
