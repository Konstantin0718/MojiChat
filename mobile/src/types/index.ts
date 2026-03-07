export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  is_online?: boolean;
  last_seen?: string;
  preferred_language?: string;
  country_code?: string;
}

export interface Message {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  emoji_content: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file';
  file_url?: string;
  file_name?: string;
  file_size?: number;
  duration?: number;
  translations?: Record<string, string>;
  reactions?: Record<string, string[]>;
  created_at: string;
  read_by: string[];
}

export interface Conversation {
  conversation_id: string;
  participant_ids: string[];
  participants?: User[];
  name?: string;
  is_group: boolean;
  created_at: string;
  last_message?: Message;
  unread_count?: number;
}

export interface Call {
  call_id: string;
  conversation_id: string;
  initiator_id: string;
  initiator_name: string;
  participants: string[];
  is_video: boolean;
  status: 'ringing' | 'active' | 'ended';
  created_at: string;
  ended_at?: string;
}

export interface AuthResponse {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  token: string;
}
