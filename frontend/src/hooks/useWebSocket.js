import { useEffect, useRef, useCallback } from 'react';

const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

/**
 * Manages a persistent WebSocket connection to the MojiChat backend.
 *
 * Usage:
 *   const { sendWsMessage } = useWebSocket(user, token, {
 *     onNewMessage:    (data) => { ... },
 *     onTyping:        (data) => { ... },
 *     onOnlineStatus:  (data) => { ... },
 *     onMessageRead:   (data) => { ... },
 *     onIncomingCall:  (data) => { ... },
 *   });
 */
export function useWebSocket(user, token, handlers = {}) {
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const handlersRef = useRef(handlers);

  // Keep handlers up to date without re-creating the WebSocket.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const connect = useCallback(() => {
    if (!user?.user_id || !token) return;
    if (!mountedRef.current) return;

    const API_URL = process.env.REACT_APP_BACKEND_URL || '';
    const wsBase = API_URL.replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'));
    const url = `${wsBase}/ws/${user.user_id}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const h = handlersRef.current;
        switch (data.type) {
          case 'new_message':
            h.onNewMessage?.(data);
            break;
          case 'typing':
            h.onTyping?.(data);
            break;
          case 'online_status':
            h.onOnlineStatus?.(data);
            break;
          case 'message_read':
            h.onMessageRead?.(data);
            break;
          case 'call_initiated':
          case 'incoming_call':
            h.onIncomingCall?.(data);
            break;
          case 'message_deleted':
            h.onMessageDeleted?.(data);
            break;
          case 'pong':
            break;
          default:
            break;
        }
      } catch (e) {
        // Ignore malformed frames
      }
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (!mountedRef.current) return;
      const attempt = reconnectAttemptRef.current;
      const delay = WS_RECONNECT_DELAYS[Math.min(attempt, WS_RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    // Keep connection alive with ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    ws._pingInterval = pingInterval;
  }, [user?.user_id, token]); // eslint-disable-line

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        clearInterval(wsRef.current._pingInterval);
        wsRef.current.onclose = null;
        wsRef.current.close(1000, 'component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendWsMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendWsMessage };
}
