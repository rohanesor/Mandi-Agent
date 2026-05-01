import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticHeavy, hapticSuccess, hapticLight } from '../../utils/haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  SharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

// Lazy load Skia to prevent web crashes
const getSkia = () => {
  if (Platform.OS === 'web') return null;
  try {
    return require('@shopify/react-native-skia');
  } catch (e) {
    return null;
  }
};
import { useRouter } from 'expo-router';
import { useAnimatedPrices } from '../../hooks';
import { COLORS, FONTS, SPRING } from '../../constants/theme';
import { useT } from '../../utils/useT';
import { DEMO_MODE } from '../../constants/demoConfig';
import NotificationBell from '../../components/NotificationBell';
import NewsAlertBanner from '../../components/NewsAlertBanner';
import { DemoShowcaseButton } from '../../components/DemoShowcaseButton';
import { useAppStore, NewsAlert, selectSessionHistory } from '../../store/useAppStore';

const HEADER_HEIGHT = 280;
const TICKER_ITEM_WIDTH = 130;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

const tabs = [
  { key: 'home', label: 'Home · होम' },
  { key: 'prices', label: 'Prices · भाव' },
  { key: 'voice', label: 'Voice · आवाज' },
  { key: 'coop', label: 'Co-op · सहकारी' },
  { key: 'profile', label: 'Profile · प्रोफाइल' },
];

interface TickerPrice {
  crop: string;
  cropHindi: string;
  price: number;
  yesterday: number;
}

function HeaderScene({ width, scrollY }: { width: number; scrollY: SharedValue<number> }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => ({
        x: 24 + i * ((width - 50) / 8),
        y: 18 + (i % 3) * 14,
      })),
    [width]
  );

  const farHill = `M0 220 C ${width * 0.2} 176 ${width * 0.42} 200 ${width * 0.62} 184 C ${
    width * 0.8
  } 170 ${width} 208 ${width} 220 L ${width} 280 L 0 280 Z`;
  const midHill = `M0 232 C ${width * 0.2} 200 ${width * 0.48} 230 ${width * 0.7} 208 C ${
    width * 0.88
  } 192 ${width} 220 ${width} 232 L ${width} 280 L 0 280 Z`;
  const nearHill = `M0 248 C ${width * 0.28} 228 ${width * 0.52} 260 ${width * 0.74} 234 C ${
    width * 0.9
  } 220 ${width} 248 ${width} 248 L ${width} 280 L 0 280 Z`;

  const skia = getSkia();
  const isWeb = Platform.OS === 'web';
  if (!skia || isWeb) {
    return <View style={{ width, height: HEADER_HEIGHT, backgroundColor: COLORS.night }} />;
  }
  const { Canvas, Circle, Rect, Path } = skia;

  return (
    <Canvas style={{ width, height: HEADER_HEIGHT }}>
      <Rect x={0} y={0} width={width} height={HEADER_HEIGHT} color="#0D2B1F" />
      <Rect x={0} y={120} width={width} height={HEADER_HEIGHT - 120} color={COLORS.forest} opacity={0.7} />
      {stars.map((star, idx) => (
        <Circle key={`star-${idx}`} cx={star.x} cy={star.y} r={1.5} color="#FFFFFF" opacity={0.6} />
      ))}
      <Circle cx={width - 62} cy={50} r={22} color="#FFFFFF" />
      <Circle cx={width - 52} cy={44} r={21} color="#0D2B1F" />
      <Circle cx={width - 46} cy={66} r={25} color={COLORS.grain} />
      <Path path={farHill} color="#0F3D27" />
      <Path path={midHill} color={COLORS.forest} />
      <Path path={nearHill} color={COLORS.canopy} />
    </Canvas>
  );
}

function VoiceRings({
  rotate,
  pulse,
  burst,
}: {
  rotate: SharedValue<number>;
  pulse: SharedValue<number>;
  burst: SharedValue<number>;
}) {
  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const skia = getSkia();
  const midStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  if (!skia || Platform.OS === 'web') {
    return (
      <View style={styles.voiceWrap}>
        <AnimatedView style={[styles.ringOuter, outerStyle]}>
          <View style={[styles.ringOuter, { borderRadius: 60, borderWidth: 2, borderColor: COLORS.harvest, opacity: 0.3 }]} />
        </AnimatedView>
        <AnimatedView style={[styles.ringOuter, midStyle]}>
          <View style={[styles.ringOuter, { borderRadius: 60, borderWidth: 2, borderColor: COLORS.harvest, opacity: 0.5, borderStyle: 'dashed' }]} />
        </AnimatedView>
        {[0, 1, 2].map((i) => (
          <SonarRing key={`sonar-${i}`} ringIndex={i} burst={burst} />
        ))}
      </View>
    );
  }

  const { Canvas, Circle, Path, DashPathEffect } = skia;

  return (
    <View style={styles.voiceWrap}>
      <AnimatedView style={[styles.ringOuter, outerStyle]}>
        <Canvas style={styles.ringCanvas}>
          <Circle cx={60} cy={60} r={52} color={COLORS.harvest} style="stroke" strokeWidth={2} opacity={0.3} />
        </Canvas>
      </AnimatedView>
      <AnimatedView style={[styles.ringOuter, midStyle]}>
        <Canvas style={styles.ringCanvas}>
          <Path path="M60 16 A44 44 0 1 1 59.9 16" color={COLORS.harvest} style="stroke" strokeWidth={2} opacity={0.5}>
            <DashPathEffect intervals={[8, 6]} />
          </Path>
        </Canvas>
      </AnimatedView>
      {[0, 1, 2].map((i) => (
        <SonarRing key={`sonar-${i}`} ringIndex={i} burst={burst} />
      ))}
    </View>
  );
}

function SonarRing({ ringIndex, burst }: { ringIndex: number; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: burst.value > 0 ? 1 - burst.value : 0,
    transform: [{ scale: 1 + burst.value * (2 + ringIndex) }],
  }));
  return <AnimatedView style={[styles.sonarRing, style]} />;
}

function TickerItem({ item }: { item: TickerPrice }) {
  const up = item.price >= item.yesterday;
  const delta = item.price - item.yesterday;
  const pct = ((Math.abs(delta) / item.yesterday) * 100).toFixed(1);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    wiggle.value = withSequence(
      withSpring(-6, SPRING.bouncy),
      withSpring(6, SPRING.bouncy),
      withSpring(0, SPRING.gentle)
    );
  }, [wiggle, item.price]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: wiggle.value }],
  }));

  return (
    <View style={styles.tickerItem}>
      <Text style={styles.tickerCrop}>
        {item.crop} · {item.cropHindi}
      </Text>
      <View style={styles.rowBetween}>
        <Text style={[styles.tickerPrice, { color: up ? '#52B788' : '#EF4444' }]}>₹{item.price}/kg</Text>
        <AnimatedText style={[styles.tickerArrow, { color: up ? '#52B788' : '#EF4444' }, arrowStyle]}>
          {up ? '↑' : '↓'}
        </AnimatedText>
      </View>
      <Text style={[styles.tickerChange, { color: up ? '#52B788' : '#EF4444' }]}>
        {up ? '+' : '-'}
        {pct}% · कल से
      </Text>
    </View>
  );
}

function AdvisoryVisual({ type }: { type: 'harvest_now' | 'hold' | 'redirect' }) {
  const skia = getSkia();
  if (!skia || Platform.OS === 'web') {
    return <View style={{ width: 80, height: 80, backgroundColor: type === 'harvest_now' ? '#EF4444' : type === 'hold' ? '#F59E0B' : '#3B82F6', borderRadius: 40 }} />;
  }
  const { Canvas, Circle, Path, Rect, RoundedRect } = skia;

  if (type === 'harvest_now') {
    return (
      <Canvas style={{ width: 80, height: 80 }}>
        <RoundedRect x={18} y={58} width={44} height={8} r={4} color="#111827" opacity={0.25} />
        <Circle cx={40} cy={30} r={16} color="#EF4444" />
        <Circle cx={34} cy={24} r={3} color="#FCA5A5" />
      </Canvas>
    );
  }
  if (type === 'hold') {
    return (
      <Canvas style={{ width: 80, height: 80 }}>
        <Path path="M20 12 L60 12 L46 32 L34 32 Z" color="#FCD34D" />
        <Path path="M20 68 L60 68 L46 48 L34 48 Z" color="#F59E0B" />
      </Canvas>
    );
  }
  return (
    <Canvas style={{ width: 80, height: 80 }}>
      <Rect x={0} y={34} width={28} height={16} color="#60A5FA" />
      <Rect x={20} y={30} width={14} height={20} color="#3B82F6" />
      <Circle cx={8} cy={54} r={4} color="#1F2937" />
      <Circle cx={24} cy={54} r={4} color="#1F2937" />
    </Canvas>
  );
}

function TabIcon({ tabKey, color }: { tabKey: string; color: string }) {
  const skia = getSkia();
  if (!skia || Platform.OS === 'web') {
    return <View style={{ width: 20, height: 20, backgroundColor: color, borderRadius: 10 }} />;
  }
  const { Canvas, Circle, Path, Rect, Line, RoundedRect } = skia;

  return (
    <Canvas style={{ width: 28, height: 28 }}>
      {tabKey === 'home' && (
        <>
          <Path path="M4 14 L14 5 L24 14 L24 24 L4 24 Z" color={color} style="stroke" strokeWidth={2} />
          <Rect x={11} y={17} width={6} height={7} color={color} />
        </>
      )}
      {tabKey === 'prices' && (
        <>
          <Rect x={5} y={14} width={4} height={10} color={color} />
          <Rect x={12} y={10} width={4} height={14} color={color} />
          <Rect x={19} y={6} width={4} height={18} color={color} />
        </>
      )}
      {tabKey === 'voice' && (
        <>
          <RoundedRect x={10} y={6} width={8} height={12} r={4} color={color} />
          <Line p1={{ x: 14, y: 18 }} p2={{ x: 14, y: 24 }} color={color} strokeWidth={2} />
          <Line p1={{ x: 9, y: 24 }} p2={{ x: 19, y: 24 }} color={color} strokeWidth={2} />
        </>
      )}
      {tabKey === 'coop' && (
        <>
          <Circle cx={7} cy={8} r={3} color={color} />
          <Circle cx={21} cy={8} r={3} color={color} />
          <Circle cx={14} cy={21} r={3} color={color} />
        </>
      )}
      {tabKey === 'profile' && (
        <>
          <Circle cx={14} cy={10} r={5} color={color} />
          <Path path="M4 24 C6 18 22 18 24 24" color={color} style="stroke" strokeWidth={2} />
        </>
      )}
    </Canvas>
  );
}

// Removed unused components

export default function HomeScreen() {
  const { t } = useT();
  const router = useRouter();
  const addNewsAlert = useAppStore((s) => s.addNewsAlert);
  const newsAlerts = useAppStore((s) => s.newsAlerts);
  const markAllNewsRead = useAppStore((s) => s.markAllNewsRead);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tickerRef = useRef<FlatList<TickerPrice>>(null);
  const scrollX = useRef(0);
  const touchingTicker = useRef(false);
  const [tickerData, setTickerData] = useState<TickerPrice[]>([
    { crop: 'Tomato', cropHindi: 'टमाटर', price: 34, yesterday: 28 },
    { crop: 'Onion', cropHindi: 'प्याज', price: 26, yesterday: 27 },
    { crop: 'Potato', cropHindi: 'आलू', price: 22, yesterday: 20 },
    { crop: 'Chilli', cropHindi: 'मिर्च', price: 48, yesterday: 44 },
    { crop: 'Mango', cropHindi: 'आम', price: 62, yesterday: 59 },
  ]);
  const [activeBanner, setActiveBanner] = useState<NewsAlert | null>(null);

  const { prices, isLoading, lastUpdated } = useAnimatedPrices('Tomato', 'Karnataka');

  const sessionHistory = useAppStore(selectSessionHistory);
  const lastAdvisory = (sessionHistory[0] as any)?.advisory ?? null;

  const displayAdvisory = lastAdvisory ? {
    hasData: true,
    advisoryType: (lastAdvisory.decision === 'harvest_now' ? 'harvest_now'
       : lastAdvisory.decision?.startsWith('hold') ? 'hold' : 'redirect') as 'harvest_now' | 'hold' | 'redirect',
    decision: lastAdvisory.decision as string,
    forecastPrice: Math.round(lastAdvisory.forecast_price),
    currentPrice: Math.round((lastAdvisory.forecast_price ?? 0) - 6),
    spoilageRisk: Math.round(lastAdvisory.spoilage_risk_pct),
    crop: lastAdvisory.crop as string | undefined,
  } : { hasData: false, advisoryType: 'harvest_now' as const, decision: '', forecastPrice: 0, currentPrice: 0, spoilageRisk: 0, crop: undefined };

  const BADGE_LABELS: Record<string, string> = {
    harvest_now: '🌾 ' + t('harvestNow'),
    redirect: '🗺️ ' + t('redirect'),
    hold_3_days: '⏳ Wait 3 days',
    hold_5_days: '⏳ Wait 5 days',
    hold_7_days: '⏳ Wait 7 days',
  };
  const BADGE_COLORS: Record<string, string> = {
    harvest_now: '#EF4444', redirect: '#3B82F6', hold: '#F59E0B',
  };
  const badgeLabel = BADGE_LABELS[displayAdvisory.decision] || BADGE_LABELS[displayAdvisory.advisoryType] || '🌾 Advisory';
  const badgeColor = BADGE_COLORS[displayAdvisory.advisoryType] || '#166534';

  useEffect(() => {
    if (!DEMO_MODE || newsAlerts.length > 0) return;

    addNewsAlert({
      id: 'demo-alert-1',
      headline: 'Tomato prices down 40% in Nashik — sell this week',
      urgency: 'emergency',
      receivedAt: new Date().toISOString(),
      isRead: false,
    });
    addNewsAlert({
      id: 'demo-alert-2',
      headline: 'Onion prices rising in TN — Dindigul mandi up 25%',
      urgency: 'important',
      receivedAt: new Date().toISOString(),
      isRead: false,
    });

    const timer = setTimeout(() => {
      addNewsAlert({
        id: `demo-alert-3-${Date.now()}`,
        headline: 'Heavy rain warning for Kolar — harvest mature crops now',
        urgency: 'emergency',
        receivedAt: new Date().toISOString(),
        isRead: false,
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [addNewsAlert, newsAlerts.length]);

  useEffect(() => {
    const latestUnread = newsAlerts.find((a) => !a.isRead);
    if (!latestUnread) {
      setActiveBanner(null);
      return;
    }

    const ageMs = Date.now() - new Date(latestUnread.receivedAt).getTime();
    if (ageMs <= 5 * 60 * 1000 && (latestUnread.urgency === 'emergency' || latestUnread.urgency === 'important')) {
      setActiveBanner(latestUnread);
    }
  }, [newsAlerts]);

  useEffect(() => {
    if (prices.length > 0) {
      const updatedTicker = tickerData.map((item, index) => {
        if (prices[index]) {
          return { ...item, price: Math.round(prices[index].modal_price) };
        }
        return item;
      });
      setTickerData(updatedTicker);
    }
  }, [prices]);

  const scrollY = useSharedValue(0);
  const voiceScale = useSharedValue(1);
  const ringRotate = useSharedValue(0);
  const ringPulse = useSharedValue(1);
  const burst = useSharedValue(0);
  const advisoryY = useSharedValue(60);
  const advisoryOpacity = useSharedValue(0);
  const coopScale = useSharedValue(0.8);
  const hintArrow = useSharedValue(0);
  const progress = useSharedValue(0);
  const joinScale = useSharedValue(1);
  const c1 = useSharedValue(0);
  const c2 = useSharedValue(0);
  const c3 = useSharedValue(0);

  useEffect(() => {
    ringPulse.value = withRepeat(
      withSequence(withSpring(1.2, SPRING.slow), withSpring(1, SPRING.slow)),
      -1,
      false
    );
    ringRotate.value = withRepeat(withTiming(360, { duration: 10000, easing: Easing.linear }), -1, false);
    advisoryY.value = withDelay(600, withSpring(0, SPRING.gentle));
    advisoryOpacity.value = withDelay(600, withSpring(1, SPRING.gentle));
    coopScale.value = withDelay(800, withSpring(1, SPRING.bouncy));
    hintArrow.value = withRepeat(
      withSequence(withSpring(4, SPRING.gentle), withSpring(0, SPRING.gentle)),
      -1,
      false
    );
    progress.value = withTiming(displayAdvisory.spoilageRisk, { duration: 1200 });
    c1.value = withSpring(47, SPRING.slow);
    c2.value = withSpring(94, SPRING.slow);
    c3.value = withSpring(180, SPRING.slow);
  }, [advisoryOpacity, advisoryY, c1, c2, c3, coopScale, hintArrow, progress, ringPulse, ringRotate]);

  useEffect(() => {
    const auto = setInterval(() => {
      if (touchingTicker.current) return;
      scrollX.current += 1;
      if (scrollX.current > tickerData.length * TICKER_ITEM_WIDTH) {
        scrollX.current = 0;
      }
      tickerRef.current?.scrollToOffset({ offset: scrollX.current, animated: false });
    }, 50);
    return () => clearInterval(auto);
  }, [tickerData.length]);

  useEffect(() => {
    if (lastAdvisory) {
      progress.value = withTiming(Math.round(lastAdvisory.spoilage_risk_pct), { duration: 800 });
    }
  }, [lastAdvisory, progress]);

  const onVoiceIn = () => {
    voiceScale.value = withSpring(0.92, SPRING.snappy);
    burst.value = 0;
    burst.value = withSpring(1, SPRING.bouncy);
    hapticHeavy();
  };
  const onVoiceOut = () => {
    voiceScale.value = withSpring(1, SPRING.snappy);
  };

  const voiceStyle = useAnimatedStyle(() => ({ transform: [{ scale: voiceScale.value }] }));
  const advisoryStyle = useAnimatedStyle(() => ({
    opacity: advisoryOpacity.value,
    transform: [{ translateY: advisoryY.value }],
  }));
  const coopStyle = useAnimatedStyle(() => ({ transform: [{ scale: coopScale.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: hintArrow.value }] }));
  const joinStyle = useAnimatedStyle(() => ({ transform: [{ scale: joinScale.value }] }));
  const spoilFill = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const counter1 = useAnimatedStyle(() => ({ opacity: c1.value > 0 ? 1 : 0.5 }));
  const counter2 = useAnimatedStyle(() => ({ opacity: c2.value > 0 ? 1 : 0.5 }));
  const counter3 = useAnimatedStyle(() => ({ opacity: c3.value > 0 ? 1 : 0.5 }));

  const advisoryType = displayAdvisory.advisoryType;

  const onJoin = async () => {
    joinScale.value = withSequence(withSpring(0.94, SPRING.snappy), withSpring(1, SPRING.bouncy));
    burst.value = 0;
    burst.value = withSpring(1, SPRING.bouncy);
    hapticSuccess();
  };

  const onVoicePress = () => {
    router.push('/advisory');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <HeaderScene width={width} scrollY={scrollY} />
          <View style={styles.bellWrap}>
            <NotificationBell />
          </View>
          <View style={styles.greetingOverlay}>
            <Text style={styles.greeting}>{t('hi')}, Raju 🌾</Text>
            <Text style={styles.greetingSub}>{t('decideToday')}</Text>
            {lastUpdated && <Text style={styles.lastUpdated}>{t('updated')}: {lastUpdated.toLocaleTimeString()}</Text>}
          </View>
        </View>

        {activeBanner && (
          <NewsAlertBanner
            alert={activeBanner}
            onDismiss={() => {
              setActiveBanner(null);
              markAllNewsRead();
            }}
            onReadMore={() => {
              setActiveBanner(null);
              router.push('/(tabs)/news');
            }}
          />
        )}

        <View style={styles.voiceSection}>
          <VoiceRings rotate={ringRotate} pulse={ringPulse} burst={burst} />
          <AnimatedPressable
            onPressIn={onVoiceIn}
            onPressOut={() => {
              onVoiceOut();
              onVoicePress();
            }}
            style={[styles.voiceButton, voiceStyle]}
          >
            <LinearGradient colors={[COLORS.harvest, '#D97706']} style={styles.voiceInner}>
              <Text style={{ fontSize: 24, color: '#FFFFFF' }}>🎤</Text>
            </LinearGradient>
          </AnimatedPressable>
          <Text style={styles.voiceLabel}>{t('speakBtn')}</Text>
        </View>

        <View style={styles.tickerWrap}>
          <FlatList
            ref={tickerRef}
            data={[...tickerData, ...tickerData, ...tickerData]}
            horizontal
            keyExtractor={(_, idx) => `ticker-${idx}`}
            renderItem={({ item }) => <TickerItem item={item} />}
            showsHorizontalScrollIndicator={false}
            onTouchStart={() => {
              touchingTicker.current = true;
            }}
            onTouchEnd={() => {
              touchingTicker.current = false;
            }}
          />
        </View>

        <AnimatedView style={[styles.advisoryCard, advisoryStyle]}>
          {!displayAdvisory.hasData ? (
            /* ── No advisory yet — prompt to speak ── */
            <Pressable style={styles.noAdvisoryWrap} onPress={() => { hapticLight(); router.push('/advisory'); }}>
              <Text style={styles.noAdvisoryEmoji}>🎤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.noAdvisoryTitle}>Get harvest advice</Text>
                <Text style={styles.noAdvisoryHindi}>फसल की सलाह पाएं</Text>
                <Text style={styles.noAdvisoryHint}>Tap mic · बोलिए →</Text>
              </View>
            </Pressable>
          ) : (
            /* ── Real advisory data ── */
            <>
              <View style={styles.advisoryLeft}>
                <AdvisoryVisual type={advisoryType} />
              </View>
              <View style={styles.advisoryRight}>
                <View style={[styles.badgeGreen, { backgroundColor: badgeColor + '22', borderColor: badgeColor, borderWidth: 1 }]}>
                  <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel.toUpperCase()}</Text>
                </View>
                {displayAdvisory.crop && (
                  <Text style={styles.cropLabel}>{displayAdvisory.crop}</Text>
                )}
                <View style={styles.row}>
                  <Text style={styles.oldPrice}>₹{displayAdvisory.currentPrice}/kg</Text>
                  <Text style={styles.newPrice}>₹{displayAdvisory.forecastPrice}/kg</Text>
                </View>
                <Text style={styles.gain}>+₹{displayAdvisory.forecastPrice - displayAdvisory.currentPrice} in 5 days ↑ · लाभ</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.spoilLabel}>{t('spoilageRisk')}</Text>
                  <Text style={styles.spoilLabel}>{displayAdvisory.spoilageRisk}%</Text>
                </View>
                <View style={styles.spoilBar}>
                  <AnimatedView style={[styles.spoilFill, spoilFill]} />
                </View>
                <Pressable onPress={() => { hapticLight(); router.push('/advisory'); }}>
                  <AnimatedText style={[styles.hint, arrowStyle]}>{t('viewFarm')} →</AnimatedText>
                </Pressable>
              </View>
            </>
          )}
        </AnimatedView>

        <AnimatedView style={[styles.bundleCardWrap, coopStyle]}>
          <LinearGradient colors={[COLORS.harvest, '#D97706']} style={styles.bundleCard}>
            <Text style={styles.bundleTitle}>{t('cooperative')} 🤝</Text>
          <View style={styles.bundleVisual}>
            <Text style={{ fontSize: 32 }}>🤝</Text>
          </View>
            <View style={styles.statsRow}>
              <AnimatedView style={counter1}>
                <Text style={styles.statValue}>47</Text>
                <Text style={styles.statLabel}>{t('farmers')}</Text>
              </AnimatedView>
              <AnimatedView style={counter2}>
                <Text style={styles.statValue}>94 qtl</Text>
                <Text style={styles.statLabel}>produce · उपज</Text>
              </AnimatedView>
              <AnimatedView style={counter3}>
                <Text style={styles.statValue}>₹180</Text>
                <Text style={styles.statLabel}>{t('savings')}</Text>
              </AnimatedView>
            </View>
            <AnimatedPressable style={[styles.joinBtn, joinStyle]} onPress={onJoin}>
              <Text style={styles.joinText}>{t('joinBundle')} →</Text>
            </AnimatedPressable>
          </LinearGradient>
        </AnimatedView>
      </ScrollView>
      <DemoShowcaseButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  content: { paddingBottom: 110 },
  header: { height: HEADER_HEIGHT, backgroundColor: '#0D2B1F' },
  bellWrap: { position: 'absolute', top: 14, right: 14 },
  greetingOverlay: { position: 'absolute', left: 16, bottom: 16 },
  greeting: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 20 },
  greetingSub: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 13, marginTop: 4 },
  lastUpdated: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 4 },
  voiceSection: { alignItems: 'center', marginTop: -14, marginBottom: 14 },
  voiceWrap: { position: 'absolute', top: -6, width: 120, height: 120 },
  ringOuter: { position: 'absolute', width: 120, height: 120 },
  ringCanvas: { width: 120, height: 120 },
  sonarRing: {
    position: 'absolute',
    left: 24,
    top: 24,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: COLORS.harvest,
  },
  voiceButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    shadowColor: COLORS.harvest,
    shadowRadius: 20,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  voiceInner: { flex: 1, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  voiceLabel: { marginTop: 10, color: COLORS.muted, fontSize: 12, fontFamily: FONTS.body },
  tickerWrap: { marginTop: 14 },
  tickerItem: { width: 130, backgroundColor: COLORS.forest, borderRadius: 10, padding: 10, marginLeft: 10 },
  tickerCrop: { fontFamily: FONTS.medium, color: '#FFFFFF', fontSize: 13 },
  tickerPrice: { fontFamily: FONTS.mono, fontSize: 20, marginTop: 6 },
  tickerArrow: { fontSize: 18, fontFamily: FONTS.bold, marginTop: 6 },
  tickerChange: { fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  advisoryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: COLORS.forest,
    borderWidth: 1,
    borderColor: COLORS.leaf,
    flexDirection: 'row',
  },
  advisoryLeft: { width: 80, marginRight: 12 },
  advisoryRight: { flex: 1 },
  badgeGreen: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { fontFamily: FONTS.display, fontSize: 11 },
  cropLabel: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 11, marginTop: 3 },
  noAdvisoryWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 4 },
  noAdvisoryEmoji: { fontSize: 44 },
  noAdvisoryTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  noAdvisoryHindi: { color: '#9CA3AF', fontFamily: FONTS.body, fontSize: 13, marginTop: 2 },
  noAdvisoryHint: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 13, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  oldPrice: { color: '#9CA3AF', fontSize: 14, textDecorationLine: 'line-through', fontFamily: FONTS.body },
  newPrice: { color: COLORS.harvest, fontSize: 22, fontFamily: FONTS.bold },
  gain: { marginTop: 4, color: '#52B788', fontSize: 12, fontFamily: FONTS.body },
  spoilLabel: { marginTop: 12, color: '#9CA3AF', fontSize: 11, fontFamily: FONTS.body },
  spoilBar: { marginTop: 6, height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden' },
  spoilFill: { height: 6, backgroundColor: '#22C55E' },
  hint: { marginTop: 12, color: COLORS.sprout, fontSize: 12, fontFamily: FONTS.bodyMed, textAlign: 'right' },
  bundleCardWrap: { margin: 16, marginTop: 14, borderRadius: 20, overflow: 'hidden' },
  bundleCard: { borderRadius: 20, padding: 16 },
  bundleVisual: { height: 60, justifyContent: 'center', alignItems: 'center' },
  bundleTitle: { color: COLORS.night, fontSize: 15, fontFamily: FONTS.bold },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  statValue: { color: COLORS.night, fontFamily: FONTS.mono, fontSize: 18 },
  statLabel: { color: COLORS.forest, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  joinBtn: { marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  joinText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 14 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor: COLORS.night,
    borderTopWidth: 1,
    borderTopColor: COLORS.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 8,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center' },
  tabLabel: { marginTop: 4, color: COLORS.harvest, fontSize: 12, fontFamily: FONTS.bodyMed },
});
