import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, X, Check } from 'lucide-react';
import { Button } from '../ui/button';

export const NotificationManager = ({ api, user }) => {
  const [permission, setPermission] = useState(Notification.permission);
  const [showPrompt, setShowPrompt] = useState(false);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    // Check if notifications are supported
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    // Check current permission
    setPermission(Notification.permission);

    // Show prompt if not decided and user is logged in
    if (Notification.permission === 'default' && user) {
      const dismissed = localStorage.getItem('notification-prompt-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 5000);
      }
    }

    // Check existing subscription
    checkSubscription();
  }, [user]);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const requestPermission = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        await subscribeUser();
      }

      setShowPrompt(false);
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  };

  const subscribeUser = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Demo VAPID key - in production, use your own
      const vapidPublicKey = 'BLBx-hf5h3N9VQXVQ8pGZBBBwEsmVqQwvqCVFdhBBWJCVgBg1XK9qHhHRxqBxqCxqQwqCVFdhBBWJCVgBg1XK9qHh';
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to server
      await api.post('/notifications/subscribe', {
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey('p256dh')),
          auth: arrayBufferToBase64(sub.getKey('auth'))
        }
      });

      setSubscription(sub);
      
      // Show test notification
      showLocalNotification('Notifications enabled!', 'You will now receive message notifications.');
    } catch (error) {
      console.error('Error subscribing:', error);
      // Show local notification as fallback
      showLocalNotification('Demo Mode', 'Push notifications are in demo mode.');
    }
  };

  const unsubscribeUser = async () => {
    try {
      if (subscription) {
        await subscription.unsubscribe();
        await api.delete('/notifications/unsubscribe', {
          data: { endpoint: subscription.endpoint }
        });
        setSubscription(null);
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
    }
  };

  const showLocalNotification = (title, body) => {
    if (permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png'
      });
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('notification-prompt-dismissed', 'true');
  };

  // Helper functions
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function arrayBufferToBase64(buffer) {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -100 }}
        className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50"
        data-testid="notification-prompt"
      >
        <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium mb-1">Enable Notifications</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Get notified when you receive new messages and calls
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={requestPermission}
                  size="sm"
                  className="rounded-full"
                >
                  Enable
                </Button>
                <Button 
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                >
                  Not now
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mt-1 -mr-1"
              onClick={handleDismiss}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// Notification settings component for settings page
export const NotificationSettings = ({ api }) => {
  const [permission, setPermission] = useState(Notification.permission);
  const [loading, setLoading] = useState(false);

  const toggleNotifications = async () => {
    setLoading(true);
    try {
      if (permission !== 'granted') {
        const result = await Notification.requestPermission();
        setPermission(result);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
      <div className="flex items-center gap-3">
        {permission === 'granted' ? (
          <Bell className="w-5 h-5 text-primary" />
        ) : (
          <BellOff className="w-5 h-5 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">Push Notifications</p>
          <p className="text-sm text-muted-foreground">
            {permission === 'granted' ? 'Enabled' : 
             permission === 'denied' ? 'Blocked in browser settings' : 
             'Not enabled'}
          </p>
        </div>
      </div>
      {permission !== 'denied' && (
        <Button
          variant={permission === 'granted' ? 'outline' : 'default'}
          size="sm"
          onClick={toggleNotifications}
          disabled={loading}
          className="rounded-full"
        >
          {permission === 'granted' ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              Enabled
            </>
          ) : (
            'Enable'
          )}
        </Button>
      )}
    </div>
  );
};
