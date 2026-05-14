import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSpring,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { COLORS, FONTS } from '../constants/theme';
import { useIsOffline } from '../store/useAppStore';

const WHEAT = ['🌾', '🌾', '🌾'];

const QUOTES = [
  { text: 'Timely sale, right price', lang: 'English' },
  { text: 'समय पर बिक्री, सही कीमत', lang: 'हिंदी' },
  { text: 'சரியான நேரத்தில் விற்பனை, சரியான விலை', lang: 'தமிழ்' },
];

const QUOTE_INTERVAL = 1500;

function BouncingWheat({ index, delay }: { index: number; delay: number }) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    const timer = setTimeout(() => {
      translateY.value = withRepeat(
        withSequence(
          withSpring(-8, { damping: 3, stiffness: 150 }),
          withSpring(0, { damping: 3, stiffness: 150 }),
        ),
        -1,
        true,
      );
      scale.value = withRepeat(
        withSequence(
          withSpring(1.1, { damping: 3, stiffness: 150 }),
          withSpring(0.9, { damping: 3, stiffness: 150 }),
        ),
        -1,
        true,
      );
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.Text style={[styles.wheat, animatedStyle]}>
      {WHEAT[index]}
    </Animated.Text>
  );
}

function AnimatedQuote({ quote, index, currentIndex }: { quote: typeof QUOTES[0]; index: number; currentIndex: number }) {
  const opacity = useSharedValue(index === 0 ? 1 : 0);
  const translateY = useSharedValue(index === 0 ? 0 : 20);

  useEffect(() => {
    const isActive = index === currentIndex;
    if (isActive) {
      opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) });
    } else {
      opacity.value = withTiming(0, { duration: 300 });
      translateY.value = withTiming(-20, { duration: 300 });
    }
  }, [currentIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.quoteWrap, animatedStyle]}>
      <Text style={styles.quoteText}>{quote.text}</Text>
      <Text style={styles.quoteLang}>{quote.lang}</Text>
    </Animated.View>
  );
}

interface Props {
  onLoaded: () => void;
  minimumDuration?: number;
}

export default function AnimatedLoadingScreen({ onLoaded, minimumDuration }: Props) {
  const isOffline = useIsOffline();
  const duration = minimumDuration ?? (isOffline ? 2000 : 5000);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const titleOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    titleOpacity.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) });

    const subTimer = setTimeout(() => {
      subtitleOpacity.value = withTiming(1, { duration: 600 });
      subtitleTranslateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) });
    }, 400);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);
      if (pct >= 1) clearInterval(interval);
    }, 50);

    return () => { clearTimeout(subTimer); clearInterval(interval); };
  }, []);

  const advanceQuote = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % QUOTES.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(advanceQuote, QUOTE_INTERVAL);
    return () => clearInterval(timer);
  }, [advanceQuote]);

  useEffect(() => {
    const doneTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 400 }, () => {
        runOnJS(onLoaded)();
      });
    }, duration);

    return () => clearTimeout(doneTimer);
  }, [duration]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.wheatRow}>
        {WHEAT.map((_, i) => (
          <BouncingWheat key={i} index={i} delay={i * 200} />
        ))}
      </View>

      <Animated.Text style={[styles.title, titleAnimatedStyle]}>
        Mandi Agent
      </Animated.Text>

      <Animated.Text style={[styles.subtitle, subtitleAnimatedStyle]}>
        आपका खेत, आपकी कमाई
      </Animated.Text>

      <View style={styles.quoteContainer}>
        {QUOTES.map((q, i) => (
          <AnimatedQuote key={i} quote={q} index={i} currentIndex={currentIndex} />
        ))}
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <Text style={styles.loadingText}>Loading...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.night,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  wheatRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  wheat: {
    fontSize: 40,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.sprout,
    marginBottom: 48,
  },
  quoteContainer: {
    height: 72,
    width: '100%',
    marginBottom: 12,
  },
  quoteWrap: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
  },
  quoteText: {
    fontFamily: FONTS.body,
    fontSize: 18,
    color: COLORS.harvest,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 4,
  },
  quoteLang: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  progressBar: {
    width: 200,
    height: 4,
    backgroundColor: COLORS.forest,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.harvest,
    borderRadius: 2,
  },
  loadingText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.muted,
  },
});
