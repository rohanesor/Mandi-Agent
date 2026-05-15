import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as storage from './storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vqsgzgiacmzlkvujugay.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxc2d6Z2lhY216bGt2dWp1Z2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjM5MDEsImV4cCI6MjA4OTU5OTkwMX0.kx9NXQXoriZZK9HkOziH4YWvO_8cZzHTAVKXPa7Uj8E';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => storage.getItem(key),
  setItem: async (key: string, value: string) => storage.setItem(key, value),
  removeItem: async (key: string) => storage.removeItem(key),
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
