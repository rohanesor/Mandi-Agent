import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
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
  interpolate,
} from 'react-native-reanimated';
import { COLORS, FONTS } from '../constants/theme';
import { LANGUAGES } from '../constants/languages';

const { width: W } = Dimensions.get('window');
const WHEAT = ['🌾', '🌾', '🌾'];
const SLIDE_DURATION = 1800;
const INTERVAL_MS = 2800;

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

function LanguageSlide({ lang, index, currentIndex }: { lang: typeof LANGUAGES[0]; index: number; currentIndex: number }) {
  const translateX = useSharedValue(index === 0 ? 0 : W);
  const opacity = useSharedValue(index === 0 ? 1 : 0);

  useEffect(() => {
    const isActive = index === currentIndex;
    const isPrev = index === (currentIndex - 1 + LANGUAGES.length) % LANGUAGES.length;

    if (isActive) {
      translateX.value = withTiming(0, { duration: SLIDE_DURATION, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: SLIDE_DURATION });
    } else if (isPrev) {
      translateX.value = withTiming(-W * 0.3, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 });
    } else {
      translateX.value = W;
      opacity.value = 0;
    }
  }, [currentIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.slide, animatedStyle]}>
      <Text style={styles.slideNativeName}>{lang.nativeName}</Text>
      <Text style={styles.slideGreeting}>{lang.greeting}</Text>
      <Text style={styles.slideEnglish}>{lang.englishName}</Text>
      <Text style={styles.slideStates}>{lang.states}</Text>
    </Animated.View>
  );
}

interface Props {
  onLoaded: () => void;
  minimumDuration?: number;
}

export default function AnimatedLoadingScreen({ onLoaded, minimumDuration = 2500 }: Props) {
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / minimumDuration, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [minimumDuration]);

  const advanceSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % LANGUAGES.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(advanceSlide, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [advanceSlide]);

  useEffect(() => {
    const doneTimer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 400 }, () => {
        runOnJS(onLoaded)();
      });
    }, minimumDuration);

    return () => clearTimeout(doneTimer);
  }, [minimumDuration]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.wheatRow}>
        {WHEAT.map((_, i) => (
          <BouncingWheat key={i} index={i} delay={i * 200} />
        ))}
      </View>

      <Text style={styles.title}>Mandi Agent</Text>

      <View style={styles.carousel}>
        {LANGUAGES.map((lang, i) => (
          <LanguageSlide key={lang.code} lang={lang} index={i} currentIndex={currentIndex} />
        ))}
      </View>

      <View style={styles.dots}>
        {LANGUAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
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
    padding: 32,
  },
  wheatRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 80,
    marginBottom: 16,
  },
  wheat: {
    fontSize: 36,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 28,
    color: COLORS.white,
    marginBottom: 40,
    letterSpacing: 1,
  },
  carousel: {
    height: 180,
    width: W - 64,
    overflow: 'hidden',
    marginBottom: 16,
  },
  slide: {
    position: 'absolute',
    width: W - 64,
    alignItems: 'center',
    paddingTop: 20,
  },
  slideNativeName: {
    fontFamily: FONTS.display,
    fontSize: 42,
    color: COLORS.harvest,
    marginBottom: 8,
    includeFontPadding: false,
  },
  slideGreeting: {
    fontFamily: FONTS.body,
    fontSize: 20,
    color: COLORS.sprout,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  slideEnglish: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  slideStates: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: 'rgba(156,163,175,0.6)',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 32,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: COLORS.harvest,
    width: 18,
  },
  progressBar: {
    width: 200,
    height: 3,
    backgroundColor: COLORS.forest,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
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
