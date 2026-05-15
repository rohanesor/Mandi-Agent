import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function webStorage() {
  if (Platform.OS !== 'web') return null;
  try { return localStorage; } catch { return null; }
}

export async function getItem(key: string): Promise<string | null> {
  const ws = webStorage();
  if (ws) return ws.getItem(key);
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  const ws = webStorage();
  if (ws) { ws.setItem(key, value); return; }
  try { await SecureStore.setItemAsync(key, value); } catch { }
}

export async function removeItem(key: string): Promise<void> {
  const ws = webStorage();
  if (ws) { ws.removeItem(key); return; }
  try { await SecureStore.deleteItemAsync(key); } catch { }
}
