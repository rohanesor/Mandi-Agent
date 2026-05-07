import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vqsgzgiacmzlkvujugay.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxc2d6Z2lhY216bGt2dWp1Z2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU2NzE3MDcsImV4cCI6MjA1MTI0NzcwN30.3JXU7JOJrbPnQtA5Oc9OwFDmg6flYIlV5FV8b9Dx5cs';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      }
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      }
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      }
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export const SUPABASE_KEYS = {
  ANON: SUPABASE_ANON_KEY,
  URL: SUPABASE_URL,
};
