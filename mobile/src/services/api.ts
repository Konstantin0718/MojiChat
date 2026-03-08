import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: `${API_URL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add token
    this.api.interceptors.request.use(
      async (config) => {
        if (!this.token) {
          this.token = await AsyncStorage.getItem('auth_token');
        }
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.logout();
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
    AsyncStorage.setItem('auth_token', token);
  }

  async logout() {
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  // Auth
  async register(email: string, password: string, name: string) {
    const response = await this.api.post('/auth/register', { email, password, name });
    if (response.data.token) {
      this.setToken(response.data.token);
    }
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await this.api.post('/auth/login', { email, password });
    if (response.data.token) {
      this.setToken(response.data.token);
    }
    return response.data;
  }

  async getMe() {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  async logoutApi() {
    try {
      await this.api.post('/auth/logout');
    } catch (e) {}
    await this.logout();
  }

  // Users
  async searchUsers(query: string) {
    const response = await this.api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  async updateLanguage(language: string) {
    const response = await this.api.put('/users/language', { preferred_language: language });
    return response.data;
  }

  async heartbeat() {
    try {
      await this.api.post('/users/heartbeat');
    } catch (e) {}
  }

  // Conversations
  async getConversations() {
    const response = await this.api.get('/conversations');
    return response.data;
  }

  async getConversation(id: string) {
    const response = await this.api.get(`/conversations/${id}`);
    return response.data;
  }

  async createConversation(participantIds: string[], name?: string, isGroup: boolean = false) {
    const response = await this.api.post('/conversations', {
      participant_ids: participantIds,
      name,
      is_group: isGroup,
    });
    return response.data;
  }

  // Messages
  async getMessages(conversationId: string, limit: number = 50) {
    const response = await this.api.get(`/conversations/${conversationId}/messages?limit=${limit}`);
    return response.data;
  }

  async sendMessage(conversationId: string, content: string, messageType: string = 'text', fileData?: any) {
    const response = await this.api.post(`/conversations/${conversationId}/messages`, {
      content,
      message_type: messageType,
      ...fileData,
    });
    return response.data;
  }

  async setTyping(conversationId: string, isTyping: boolean) {
    await this.api.post(`/conversations/${conversationId}/typing`, { is_typing: isTyping });
  }

  async getTyping(conversationId: string) {
    const response = await this.api.get(`/conversations/${conversationId}/typing`);
    return response.data;
  }

  // Files
  async uploadFile(uri: string, fileName: string, mimeType: string) {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    } as any);

    const response = await this.api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadVoice(base64Data: string, duration: number) {
    const response = await this.api.post('/voice/upload', {
      audio_data: base64Data,
      duration,
    });
    return response.data;
  }

  // Reactions
  async addReaction(messageId: string, emoji: string) {
    const response = await this.api.post(`/messages/${messageId}/reactions`, { emoji });
    return response.data;
  }

  // Calls
  async initiateCall(conversationId: string, isVideo: boolean) {
    const response = await this.api.post('/calls/initiate', {
      conversation_id: conversationId,
      is_video: isVideo,
    });
    return response.data;
  }

  async joinCall(callId: string) {
    const response = await this.api.post(`/calls/${callId}/join`);
    return response.data;
  }

  async endCall(callId: string) {
    const response = await this.api.post(`/calls/${callId}/end`);
    return response.data;
  }

  async getActiveCalls() {
    const response = await this.api.get('/calls/active');
    return response.data;
  }

  async sendSignal(callId: string, type: string, data: any, targetUserId?: string) {
    const response = await this.api.post(`/calls/${callId}/signal`, {
      type,
      data,
      target_user_id: targetUserId,
    });
    return response.data;
  }

  async getSignals(callId: string) {
    const response = await this.api.get(`/calls/${callId}/signals`);
    return response.data;
  }

  // Search
  async searchMessages(query: string, conversationId?: string) {
    let url = `/search/messages?q=${encodeURIComponent(query)}`;
    if (conversationId) {
      url += `&conversation_id=${conversationId}`;
    }
    const response = await this.api.get(url);
    return response.data;
  }

  async searchConversations(query: string) {
    const response = await this.api.get(`/search/conversations?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  // Notifications
  async subscribePush(token: string) {
    const response = await this.api.post('/notifications/subscribe', {
      endpoint: token,
      keys: { expo: true },
    });
    return response.data;
  }

  async getNotifications() {
    const response = await this.api.get('/notifications');
    return response.data;
  }

  // Password Reset
  async forgotPassword(email: string) {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, newPassword: string) {
    const response = await this.api.post('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  }

  // Email Verification
  async sendVerificationEmail(email: string) {
    const response = await this.api.post('/auth/send-verification', { email });
    return response.data;
  }

  async verifyEmail(token: string) {
    const response = await this.api.get(`/auth/verify-email/${token}`);
    return response.data;
  }

  // Phone Authentication
  async sendPhoneCode(phoneNumber: string) {
    const response = await this.api.post('/auth/phone/send-code', {
      phone_number: phoneNumber,
    });
    return response.data;
  }

  async verifyPhoneCode(phoneNumber: string, code: string, name?: string) {
    const response = await this.api.post('/auth/phone/verify', {
      phone_number: phoneNumber,
      verification_code: code,
      name,
    });
    if (response.data.token) {
      this.setToken(response.data.token);
    }
    return response.data;
  }

  // Utilities
  async getLanguages() {
    const response = await this.api.get('/languages');
    return response.data;
  }

  async getStickers() {
    const response = await this.api.get('/stickers');
    return response.data;
  }
}

export const api = new ApiService();
