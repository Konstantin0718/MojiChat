import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';

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

  /**
   * Register for push notifications and get tokens
   * Call this on app startup after user login
   */
  async registerForPushNotifications(): Promise<string | null> {
    console.log('========================================');
    console.log('🔔 PUSH NOTIFICATION REGISTRATION START');
    console.log('========================================');
    
    // Check if physical device
    if (!Device.isDevice) {
      console.log('❌ Push notifications require a physical device');
      console.log('   Running on:', Device.modelName || 'Simulator/Emulator');
      Alert.alert(
        'Push Notifications',
        'Push notifications only work on physical devices. You are running on a simulator/emulator.'
      );
      return null;
    }

    console.log('✅ Running on physical device:', Device.modelName);
    console.log('   Brand:', Device.brand);
    console.log('   OS:', Platform.OS, Platform.Version);

    try {
      // Step 1: Check current permission status
      console.log('\n📋 Step 1: Checking notification permissions...');
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('   Current permission status:', existingStatus);

      let finalStatus = existingStatus;

      // Step 2: Request permission if not granted (required for Android 13+)
      if (existingStatus !== 'granted') {
        console.log('\n📋 Step 2: Requesting notification permissions...');
        console.log('   (Android 13+ requires explicit user permission)');
        
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
          android: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        
        finalStatus = status;
        console.log('   New permission status:', finalStatus);
      }

      if (finalStatus !== 'granted') {
        console.log('\n❌ PERMISSION DENIED');
        console.log('   User did not grant notification permissions');
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in Settings to receive messages when the app is closed.',
          [{ text: 'OK' }]
        );
        return null;
      }

      console.log('\n✅ Notification permissions granted!');

      // Step 3: Create Android notification channels (Android 8+)
      if (Platform.OS === 'android') {
        console.log('\n📋 Step 3: Creating Android notification channels...');
        
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B5CF6',
          sound: 'default',
          enableVibrate: true,
          enableLights: true,
        });
        console.log('   ✅ Created "default" channel');

        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          description: 'New message notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B5CF6',
          sound: 'default',
          enableVibrate: true,
        });
        console.log('   ✅ Created "messages" channel');

        await Notifications.setNotificationChannelAsync('calls', {
          name: 'Calls',
          description: 'Incoming call notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 500, 500],
          lightColor: '#22C55E',
          sound: 'default',
          enableVibrate: true,
        });
        console.log('   ✅ Created "calls" channel');
      }

      // Step 4: Get Expo Push Token
      console.log('\n📋 Step 4: Getting Expo Push Token...');
      
      // Use the EAS projectId from app.json
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || '84867f60-7222-42a4-b8b6-32d381c81e14';
      const firebaseProjectId = Constants.expoConfig?.extra?.firebaseProjectId || 'mijichat-7d13c';
      console.log('   EAS Project ID:', projectId);
      console.log('   Firebase Project ID:', firebaseProjectId);
      
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        });
        
        this.expoPushToken = tokenData.data;
        
        console.log('\n========================================');
        console.log('🎉 EXPO PUSH TOKEN OBTAINED!');
        console.log('========================================');
        console.log('TOKEN:', this.expoPushToken);
        console.log('========================================');
        console.log('\n📌 Copy this token to test via:');
        console.log('   - Expo Push Tool: https://expo.dev/notifications');
        console.log('========================================\n');

      } catch (tokenError: any) {
        console.log('\n❌ Error getting Expo Push Token:', tokenError.message);
        console.log('   Full error:', tokenError);
      }

      // Step 5: Get native FCM/APNs token (for Firebase Console testing)
      console.log('\n📋 Step 5: Getting native device token (FCM/APNs)...');
      
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        this.fcmToken = deviceToken.data;
        
        console.log('\n========================================');
        console.log('🔥 FCM/DEVICE TOKEN OBTAINED!');
        console.log('========================================');
        console.log('TYPE:', deviceToken.type);
        console.log('TOKEN:', this.fcmToken);
        console.log('========================================');
        console.log('\n📌 Use this token in Firebase Console:');
        console.log('   1. Go to Firebase Console > Cloud Messaging');
        console.log('   2. Click "Send test message"');
        console.log('   3. Paste this token in "FCM registration token"');
        console.log('   4. Send test notification');
        console.log('========================================\n');
        
      } catch (fcmError: any) {
        console.log('\n⚠️ Could not get FCM token:', fcmError.message);
        console.log('   This is normal in Expo Go - FCM needs a native build');
      }

      // Step 6: Register with backend
      if (this.expoPushToken) {
        console.log('\n📋 Step 6: Registering Expo token with backend...');
        try {
          await api.subscribePush(this.expoPushToken);
          console.log('   ✅ Expo token registered with backend');
        } catch (backendError) {
          console.log('   ⚠️ Failed to register Expo token with backend:', backendError);
        }
      }

      // Step 7: Register FCM token with backend (for Firebase Cloud Messaging)
      if (this.fcmToken) {
        console.log('\n📋 Step 7: Registering FCM token with backend...');
        try {
          await api.subscribeFcm(this.fcmToken);
          console.log('   ✅ FCM token registered with backend');
        } catch (fcmBackendError) {
          console.log('   ⚠️ Failed to register FCM token with backend:', fcmBackendError);
        }
      }

      console.log('\n========================================');
      console.log('✅ PUSH NOTIFICATION SETUP COMPLETE');
      console.log('========================================\n');

      return this.expoPushToken;

    } catch (error: any) {
      console.log('\n❌ REGISTRATION ERROR:', error.message);
      console.log('   Full error:', error);
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

  /**
   * Show tokens in an alert (useful for testing)
   */
  showTokensAlert() {
    const message = [
      'Expo Token:',
      this.expoPushToken || 'Not available',
      '',
      'FCM Token:',
      this.fcmToken || 'Not available (need native build)',
    ].join('\n');

    Alert.alert('Push Notification Tokens', message, [{ text: 'OK' }]);
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
