import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

type ParticleType = 'coin' | 'grain' | 'leaf' | 'sparkle';
type Particle = {
  id: number;
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  spin: number;
  size: number;
  lifetime: number;
  color: string;
};

export default function SuccessParticles({
  trigger,
  origin,
}: {
  trigger: boolean;
  origin: { x: number; y: number };
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const startTime = useRef<number | null>(null);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger) {
      setParticles([]);
      startTime.current = null;
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      return;
    }

    const newParticles: Particle[] = Array.from({ length: 40 }).map((_, i) => {
      const r = Math.random();
      const type: ParticleType = r < 0.25 ? 'coin' : r < 0.5 ? 'grain' : r < 0.75 ? 'leaf' : 'sparkle';
      const colors = {
        coin: '#FCD34D',
        grain: '#F59E0B',
        leaf: '#52B788',
        sparkle: '#FCD34D',
      };
      return {
        id: i,
        type,
        x: origin.x,
        y: origin.y,
        vx: -300 + Math.random() * 600,
        vy: -1000 + Math.random() * 400,
        gravity: 400,
        spin: -6 + Math.random() * 12,
        size: type === 'sparkle' ? 4 + Math.random() * 2 : 5 + Math.random() * 3,
        lifetime: 1500 + Math.random() * 1000,
        color: colors[type],
      };
    });

    setParticles(newParticles);
    startTime.current = Date.now();

    const animate = () => {
      if (!startTime.current) return;
      const elapsed = Date.now() - startTime.current;
      if (elapsed > 2800) {
        setParticles([]);
        return;
      }
      animationFrame.current = requestAnimationFrame(animate);
    };
    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [trigger, origin.x, origin.y]);

  if (particles.length === 0) return null;

  return (
    <Animated.View style={styles.container} pointerEvents="none">
      {particles.map((p) => (
        <ParticleView key={p.id} particle={p} startTime={startTime.current || 0} />
      ))}
    </Animated.View>
  );
}

function ParticleView({ particle, startTime }: { particle: Particle; startTime: number }) {
  const style = useAnimatedStyle(() => {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / 1000, particle.lifetime / 1000);
    const x = particle.x + particle.vx * t;
    const y = particle.y + particle.vy * t + 0.5 * particle.gravity * t * t;
    const remaining = particle.lifetime - elapsed;
    const opacity = remaining > 600 ? 1 : Math.max(0, remaining / 600);
    return {
      position: 'absolute' as const,
      left: x,
      top: y,
      opacity,
    };
  });

  if (particle.type === 'coin') {
    return <Animated.View style={[style, styles.coin, { backgroundColor: particle.color }]} />;
  }
  if (particle.type === 'grain') {
    return <Animated.View style={[style, styles.grain, { backgroundColor: particle.color }]} />;
  }
  if (particle.type === 'leaf') {
    return (
      <Animated.View style={[style, styles.leafContainer]}>
        <Animated.Text style={[styles.leafText, { color: particle.color }]}>🍃</Animated.Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[style, styles.sparkle]}>
      <Animated.Text style={styles.sparkleText}>✨</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  coin: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  grain: {
    width: 5,
    height: 8,
    borderRadius: 2,
  },
  leafContainer: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafText: {
    fontSize: 12,
  },
  sparkle: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleText: {
    fontSize: 12,
  },
});
