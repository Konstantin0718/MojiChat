import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { notificationService } from './src/services/notifications';

// Screens
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { NewGroupScreen } from './src/screens/NewGroupScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { PhoneAuthScreen } from './src/screens/PhoneAuthScreen';
import { VideoCallScreen } from './src/screens/VideoCallScreen';
import { BlockedUsersScreen } from './src/screens/BlockedUsersScreen';
import { NotificationSettingsScreen } from './src/screens/NotificationSettingsScreen';
import { StatusScreen } from './src/screens/StatusScreen';

const Stack = createNativeStackNavigator();

// https://<FRONTEND_URL>/forgot-password?token=... and mojichat://forgot-password?token=...
const linking = {
  prefixes: [
    'mojichat://',
    'https://moji-chat-gamma.vercel.app',
    'http://localhost:3000',
  ],
  config: {
    screens: {
      ForgotPassword: 'forgot-password',
    },
  },
};

// Root Navigator
const RootNavigator = () => {
  const { isAuthenticated, isLoading, offline, retryAuth } = useAuth();
  const { colors, isDark } = useTheme();

  // Register for push notifications when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('🚀 User authenticated - registering for push notifications...');
      notificationService.registerForPushNotifications();
    }
  }, [isAuthenticated]);

  // Handle notification received while app is open
  useEffect(() => {
    const receivedSubscription = notificationService.addNotificationReceivedListener((notification) => {
      console.log('📬 Notification received:', notification.request.content);
    });

    return () => receivedSubscription.remove();
  }, []);

  // Handle notification responses (tapped)
  useEffect(() => {
    const subscription = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      console.log('👆 Notification tapped:', data);
    });

    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (offline && !isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>
          Can't reach MojiChat. You are still signed in.
        </Text>
        <TouchableOpacity onPress={retryAuth}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const navTheme = isDark ? {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: colors.background,
      card: colors.card,
      primary: colors.primary,
      text: colors.text,
      border: colors.border,
    },
  } : {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.card,
      primary: colors.primary,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Conversations" component={ConversationsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="NewChat" component={NewChatScreen} />
            <Stack.Screen name="NewGroup" component={NewGroupScreen} />
            <Stack.Screen name="VideoCall" component={VideoCallScreen} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
            <Stack.Screen name="Status" component={StatusScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Main App Component
class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Something went wrong.</Text>
          <TouchableOpacity onPress={() => this.setState({ error: null })}>
            <Text style={{ color: '#8B5CF6', fontSize: 16 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <RootNavigator />
              <StatusBar style="auto" />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
