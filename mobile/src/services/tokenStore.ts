import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'auth_token';

let memory: string | null | undefined;

export async function getAuthToken(): Promise<string | null> {
  if (memory !== undefined) return memory;
  try {
    const secure = await SecureStore.getItemAsync(KEY);
    if (secure) {
      memory = secure;
      await AsyncStorage.removeItem(KEY);
      return secure;
    }
  } catch {
    // Secure storage can be unavailable in an old install. Fall through to the legacy copy.
  }
  const legacy = await AsyncStorage.getItem(KEY);
  if (!legacy) {
    memory = null;
    return null;
  }
  try {
    await SecureStore.setItemAsync(KEY, legacy);
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Keep the legacy copy until secure storage accepts it.
  }
  memory = legacy;
  return legacy;
}

export async function setAuthToken(token: string): Promise<void> {
  memory = token;
  await SecureStore.setItemAsync(KEY, token);
  await AsyncStorage.removeItem(KEY);
}

export async function clearAuthToken(): Promise<void> {
  memory = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // The legacy key is removed below either way.
  }
  await AsyncStorage.removeItem(KEY);
}
