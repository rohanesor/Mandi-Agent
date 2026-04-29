import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export function useNewsNotifications() {
  const addNewsAlert = useAppStore((s) => s.addNewsAlert);
  const router = useRouter();

  const registerForPushNotifications = async (): Promise<string | null> => {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'web') return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, any>;
      if (data?.type === 'news_alert') {
        addNewsAlert({
          id: String(data.article_id || Date.now()),
          headline: String(notification.request.content.title || ''),
          urgency: (data.urgency_level || 'digest') as 'emergency' | 'important' | 'digest',
          receivedAt: new Date().toISOString(),
          isRead: false,
        });
      }
    });

    return () => subscription.remove();
  }, [addNewsAlert]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.type === 'news_alert') {
        router.push('/(tabs)/news');
      }
    });

    return () => subscription.remove();
  }, [router]);

  return { registerForPushNotifications };
}
