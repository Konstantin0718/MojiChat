import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
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

const Stack = createNativeStackNavigator();

// Auth Stack (Login/Register)
const AuthStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
    </Stack.Navigator>
  );
};

// Main App Stack (Authenticated)
const AppStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="NewChat" component={NewChatScreen} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} />
    </Stack.Navigator>
  );
};

// Root Navigator
const RootNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();
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
      
      // Navigate based on notification type
      if (data?.type === 'message' && data?.conversation_id) {
        // Navigation will be handled by the navigation ref
      }
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
    <NavigationContainer theme={navTheme}>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

// Main App Component
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
