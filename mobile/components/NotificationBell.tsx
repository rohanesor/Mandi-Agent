import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { COLORS, FONTS } from '../constants/theme';

interface NotificationBellProps {
  unreadCount?: number;
}

export default function NotificationBell({ unreadCount }: NotificationBellProps) {
  const router = useRouter();
  const storeUnread = useAppStore((s) => s.unreadNewsCount);
  const markAllNewsRead = useAppStore((s) => s.markAllNewsRead);
  const count = unreadCount ?? storeUnread;

  return (
    <Pressable
      onPress={() => {
        markAllNewsRead();
        router.push('/(tabs)/news');
      }}
      style={styles.wrap}
      hitSlop={10}
    >
      <Text style={styles.bell}>🔔</Text>
      {count > 0 && (
        <View style={[styles.badge, count >= 10 && styles.badgeWide]}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: {
    fontSize: 18,
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeWide: {
    minWidth: 20,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    lineHeight: 11,
    fontFamily: FONTS.bold,
  },
});
