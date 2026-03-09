import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

type MessageHandler = (data: any) => void;

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private userId: string | null = null;
  private isConnecting = false;

  async connect(userId: string): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.userId = userId;

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      this.isConnecting = false;
      console.error('No auth token for WebSocket');
      return;
    }

    // Convert HTTP URL to WebSocket URL
    const wsUrl = API_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const fullUrl = `${wsUrl}/ws/${userId}?token=${token}`;

    try {
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit('connected', { userId });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.isConnecting = false;
        this.stopPing();
        this.emit('disconnected', { code: event.code });
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => {
            if (this.userId) {
              this.connect(this.userId);
            }
          }, delay);
        }
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    this.userId = null;
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(data: WebSocketMessage): void {
    const { type, ...rest } = data;
    
    // Emit to specific handlers
    this.emit(type, rest);
    
    // Also emit to 'all' handlers
    this.emit('all', data);
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Send typing indicator
  sendTyping(conversationId: string, isTyping: boolean): void {
    this.send({
      type: 'typing',
      conversation_id: conversationId,
      is_typing: isTyping,
    });
  }

  // Send message read receipt
  sendMessageRead(conversationId: string, messageId: string): void {
    this.send({
      type: 'message_read',
      conversation_id: conversationId,
      message_id: messageId,
    });
  }

  // Subscribe to conversation updates
  subscribeToConversation(conversationId: string): void {
    this.send({
      type: 'subscribe_conversation',
      conversation_id: conversationId,
    });
  }

  // Unsubscribe from conversation
  unsubscribeFromConversation(conversationId: string): void {
    this.send({
      type: 'unsubscribe_conversation',
      conversation_id: conversationId,
    });
  }

  // Event handlers
  on(event: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler?: MessageHandler): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }

  private emit(event: string, data: any): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`WebSocket handler error for ${event}:`, e);
      }
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
