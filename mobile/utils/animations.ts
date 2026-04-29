import { Easing, SharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../constants/theme';

export const slideInFromRight = (delay = 0) => ({
  entering: withDelay(delay, withSpring(0, SPRING.gentle)),
  initial: { translateX: 60, opacity: 0 },
});

export const slideInFromBottom = (delay = 0) => ({
  entering: withDelay(delay, withSpring(0, SPRING.gentle)),
  initial: { translateY: 40, opacity: 0 },
});

export const scaleIn = (delay = 0) => ({
  entering: withDelay(delay, withSpring(1, SPRING.bouncy)),
  initial: { scale: 0 },
});

export const fadeIn = (delay = 0) =>
  withDelay(delay, withTiming(1, { duration: 400 }));

export const sonarRings = (onFinish?: () => void) => {
  return [0, 1, 2].map((i) => ({
    delay: i * 150,
    scale: withDelay(
      i * 150,
      withTiming(4, { duration: 500, easing: Easing.out(Easing.cubic) }, i === 2 ? onFinish : undefined)
    ),
    opacity: withDelay(
      i * 150,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    ),
  }));
};

export const counterAnimation = (
  sharedValue: SharedValue<number>,
  target: number,
  duration = 1200
) =>
  withTiming(target, {
    duration,
    easing: Easing.out(Easing.cubic),
  });
