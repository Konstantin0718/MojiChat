import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api } from './api';

const PUSH_DEVICE_KEY = 'push_device_id';

async function pushDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(PUSH_DEVICE_KEY);
  if (existing) return existing;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(PUSH_DEVICE_KEY, created);
  return created;
}

// Configure notification handling - this runs when notification is received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private expoPushToken: string | null = null;
  private fcmToken: string | null = null;
  private deviceId: string | null = null;
  private registered = false;
  private registration: Promise<string | null> | null = null;
  private pushListener: Notifications.Subscription | null = null;

  /**
   * Register this device once after login. A later token change updates the same device.
   */
  async registerForPushNotifications(force = false): Promise<string | null> {
    if (!force && this.registered && this.expoPushToken) {
      return this.expoPushToken;
    }
    if (!force && this.registration) {
      return this.registration;
    }
    const run = this.registerOnce();
    this.registration = run;
    try {
      return await run;
    } finally {
      if (this.registration === run) this.registration = null;
    }
  }

  private ensureRotationListener() {
    if (this.pushListener) return;
    this.pushListener = Notifications.addPushTokenListener((deviceToken) => {
      const native = typeof deviceToken.data === 'string' ? deviceToken.data : null;
      if (!native) return;
      void this.onNativeTokenRotated(native);
    });
  }

  private async onNativeTokenRotated(native: string) {
    const auth = await AsyncStorage.getItem('auth_token');
    if (!auth) return;
    const deviceId = this.deviceId || await pushDeviceId();
    this.deviceId = deviceId;
    if (native !== this.fcmToken) {
      this.fcmToken = native;
      try {
        await api.subscribeFcm(native, deviceId);
      } catch {
        // The next login registers again.
      }
    }
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || '84867f60-7222-42a4-b8b6-32d381c81e14';
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      if (tokenData.data && tokenData.data !== this.expoPushToken) {
        this.expoPushToken = tokenData.data;
        await api.subscribePush(tokenData.data, deviceId);
      }
    } catch {
      // Ignore rotation refresh failures.
    }
  }

  /** Endpoints stored for this device. Logout sends them before the auth token is cleared. */
  currentEndpoints(): string[] {
    return [this.expoPushToken, this.fcmToken].filter((value): value is string => !!value);
  }

  clearLocalTokens() {
    this.expoPushToken = null;
    this.fcmToken = null;
    this.registered = false;
  }

  private async registerOnce(): Promise<string | null> {
    this.ensureRotationListener();
    if (!Device.isDevice) {
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
          android: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        return null;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B5CF6',
          sound: 'default',
          enableVibrate: true,
          enableLights: true,
        });
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          description: 'New message notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B5CF6',
          sound: 'default',
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync('calls', {
          name: 'Calls',
          description: 'Incoming call notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 500, 500],
          lightColor: '#22C55E',
          sound: 'default',
          enableVibrate: true,
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId || '84867f60-7222-42a4-b8b6-32d381c81e14';
      const deviceId = await pushDeviceId();
      this.deviceId = deviceId;

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        this.expoPushToken = tokenData.data;
      } catch {
        this.expoPushToken = null;
      }

      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        this.fcmToken = typeof deviceToken.data === 'string' ? deviceToken.data : null;
      } catch {
        this.fcmToken = null;
      }

      if (this.expoPushToken) {
        try {
          await api.subscribePush(this.expoPushToken, deviceId);
        } catch {
          // Login still succeeds when push registration fails.
        }
      }
      if (this.fcmToken) {
        try {
          await api.subscribeFcm(this.fcmToken, deviceId);
        } catch {
          // The Expo token is enough for delivery.
        }
      }

      this.registered = !!this.expoPushToken;
      return this.expoPushToken;
    } catch {
      return null;
    }
  }

  /**
   * Get the current Expo Push Token
   */
  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Get the native FCM/APNs token
   */
  getFCMToken(): string | null {
    return this.fcmToken;
  }

  // Listen for notification received while app is foregrounded
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener((notification) => {
      console.log('📬 Notification received in foreground:', notification);
      callback(notification);
    });
  }

  // Listen for notification tapped
  addNotificationResponseListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response);
      callback(response);
    });
  }

  // Schedule local notification (for testing)
  async scheduleLocalNotification(title: string, body: string, data?: any) {
    console.log('📤 Scheduling local notification:', { title, body, data });
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Immediate
    });
  }

  // Test notification (useful for debugging)
  async sendTestNotification() {
    console.log('🧪 Sending test notification...');
    await this.scheduleLocalNotification(
      '🔔 Test Notification',
      'Push notifications are working!',
      { test: true }
    );
  }

  // Show incoming call notification
  async showIncomingCallNotification(callerName: string, isVideo: boolean, callId: string) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${isVideo ? '📹 Video' : '📞 Voice'} Call`,
        body: `${callerName} is calling...`,
        data: { type: 'incoming_call', call_id: callId },
        sound: true,
        categoryIdentifier: 'call',
      },
      trigger: null,
    });
  }

  // Show new message notification
  async showMessageNotification(senderName: string, emojiContent: string, conversationId: string) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: senderName,
        body: emojiContent,
        data: { type: 'message', conversation_id: conversationId },
        sound: true,
      },
      trigger: null,
    });
  }

  // Clear all notifications
  async clearAllNotifications() {
    await Notifications.dismissAllNotificationsAsync();
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  // Set badge count
  async setBadgeCount(count: number) {
    await Notifications.setBadgeCountAsync(count);
  }
}

export const notificationService = new NotificationService();
