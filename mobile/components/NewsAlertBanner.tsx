import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { NewsAlert } from '../store/useAppStore';
import { COLORS, FONTS } from '../constants/theme';

interface NewsAlertBannerProps {
  alert: NewsAlert;
  onDismiss: () => void;
  onReadMore: () => void;
}

export default function NewsAlertBanner({ alert, onDismiss, onReadMore }: NewsAlertBannerProps) {
  const y = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    y.value = withSpring(0, { damping: 15, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 250 });

    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);

    return () => clearTimeout(timer);
  }, [onDismiss, opacity, y]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  const emergency = alert.urgency === 'emergency';

  return (
    <Animated.View style={[styles.wrap, style, emergency ? styles.emergency : styles.important]}>
      <Pressable style={styles.pressArea} onPress={onReadMore}>
        <Text style={styles.icon}>{emergency ? '🚨' : '📢'}</Text>
        <Text numberOfLines={2} style={styles.headline}>{alert.headline}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.closeBtn}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 72,
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  emergency: {
    borderLeftColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  important: {
    borderLeftColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  pressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  headline: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.medium,
    flex: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: FONTS.bold,
  },
});
