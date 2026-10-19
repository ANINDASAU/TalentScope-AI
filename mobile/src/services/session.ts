import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from './api';

const TOKEN_KEY = 'talentscope.auth.token';
const USER_KEY = 'talentscope.auth.user';

export interface StoredUser {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  [key: string]: any;
}

export const saveSession = async (token: string, user: StoredUser | null) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    setAuthToken(token);
  } catch (e) {
    console.warn('[Session] save failed', e);
  }
};

export const loadSessionToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const loadSessionUser = async (): Promise<StoredUser | null> => {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  } catch (e) {
    console.warn('[Session] clear failed', e);
  }
  setAuthToken(null);
};
