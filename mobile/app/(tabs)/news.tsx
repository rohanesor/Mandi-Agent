import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';
import { getAgriNews, AgriNewsArticle, AgriNewsCategory } from '../../services/agriNewsService';

const CATEGORY_COLORS: Record<AgriNewsArticle['category'], string> = {
  price_alert: '#F59E0B',
  weather: '#3B82F6',
  scheme: '#10B981',
  market: '#8B5CF6',
  general: '#6B7280',
};

const CATEGORY_LABELS: Record<AgriNewsArticle['category'], string> = {
  price_alert: 'Price',
  weather: 'Weather',
  scheme: 'Scheme',
  market: 'Market',
  general: 'General',
};

const FILTER_OPTIONS: Array<{ key: AgriNewsCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'price_alert', label: 'Price' },
  { key: 'weather', label: 'Weather' },
  { key: 'scheme', label: 'Schemes' },
  { key: 'market', label: 'Market' },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function PulsingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 800 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.pulsingDot, style]} />;
}

function UrgentBanner({ article, onPress }: { article: AgriNewsArticle; onPress: () => void }) {
  return (
    <Pressable style={styles.urgentBanner} onPress={onPress}>
      <View style={styles.urgentHeader}>
        <PulsingDot />
        <View style={styles.urgentBadge}>
          <Text style={styles.urgentBadgeText}>URGENT</Text>
        </View>
      </View>
      <Text style={styles.urgentTitle} numberOfLines={2}>{article.title}</Text>
      <Text style={styles.urgentSummary} numberOfLines={2}>{article.summary}</Text>
      <Text style={styles.urgentTap}>Tap to read full article</Text>
    </Pressable>
  );
}

function CropPill({ crop }: { crop: string }) {
  return (
    <View style={styles.cropPill}>
      <Text style={styles.cropPillText}>{crop}</Text>
    </View>
  );
}

function NewsCard({ article, index }: { article: AgriNewsArticle; index: number }) {
  const stripeColor = CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general;
  const categoryLabel = CATEGORY_LABELS[article.category] || 'General';

  return (
    <Animated.View entering={FadeInRight.delay(index * 60).duration(300)}>
      <Pressable
        style={[styles.card, { borderLeftColor: stripeColor }]}
        onPress={() => Linking.openURL(article.url)}
      >
        <View style={styles.cardTop}>
          <View style={[styles.categoryBadge, { backgroundColor: stripeColor + '30' }]}>
            <Text style={[styles.categoryBadgeText, { color: stripeColor }]}>{categoryLabel}</Text>
          </View>
          {article.severity === 'important' && (
            <View style={styles.importantBadge}>
              <Text style={styles.importantBadgeText}>IMPORTANT</Text>
            </View>
          )}
        </View>

        <Text style={styles.headline} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.summary} numberOfLines={2}>{article.summary}</Text>

        <View style={styles.cardBottom}>
          <View style={styles.cardMeta}>
            <Text style={styles.meta}>{article.source}</Text>
            <Text style={styles.metaDot}>  </Text>
            <Text style={styles.meta}>{timeAgo(article.publishedAt)}</Text>
          </View>
          {article.affectedCrops.length > 0 && (
            <View style={styles.cropsRow}>
              {article.affectedCrops.slice(0, 3).map((crop) => (
                <CropPill key={crop} crop={crop} />
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function NewsSkeleton() {
  return (
    <View style={[styles.card, { borderLeftColor: '#374151' }]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

export default function NewsScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [selectedFilter, setSelectedFilter] = useState<AgriNewsCategory | 'all'>('all');
  const [articles, setArticles] = useState<AgriNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNews = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const data = await getAgriNews();
      setArticles(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const urgentArticles = useMemo(
    () => articles.filter((a) => a.severity === 'urgent'),
    [articles],
  );

  const filtered = useMemo(() => {
    const base = articles.filter((a) => a.severity !== 'urgent');
    if (selectedFilter === 'all') return base;
    return base.filter((a) => a.category === selectedFilter);
  }, [articles, selectedFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Agri News  {'\u00B7'}  {'\u0915\u0943\u0937\u093F'} {'\u0938\u092E\u093E\u091A\u093E\u0930'}</Text>
          <Text style={styles.subtitle}>Latest updates affecting your crops</Text>
        </View>
        <Pressable onPress={() => loadNews(true)} style={styles.refreshBtn}>
          <RefreshCw color={COLORS.white} size={16} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={styles.filtersRow}>
        {FILTER_OPTIONS.map((opt) => {
          const active = selectedFilter === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.filterPill, active ? styles.filterPillActive : styles.filterPillInactive]}
              onPress={() => setSelectedFilter(opt.key)}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : styles.filterTextInactive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>



      {loading ? (
        <View style={{ paddingHorizontal: 12 }}>
          <NewsSkeleton />
          <NewsSkeleton />
          <NewsSkeleton />
        </View>
      ) : articles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>{'\uD83C\uDF3E'}</Text>
          <Text style={styles.emptyTitle}>No news available</Text>
          <Text style={styles.emptySub}>Checking every 30 minutes</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadNews(true)}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNews(true)} tintColor="#F59E0B" />}
          ListHeaderComponent={
            urgentArticles.length > 0 ? (
              <View style={styles.urgentSection}>
                {urgentArticles.map((a) => (
                  <UrgentBanner key={a.id} article={a} onPress={() => Linking.openURL(a.url)} />
                ))}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => <NewsCard article={item} index={index} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 3 },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  filtersRow: { paddingHorizontal: 12, paddingBottom: 24 },
  filterPill: {
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  filterPillActive: { backgroundColor: COLORS.harvest },
  filterPillInactive: { backgroundColor: COLORS.canopy },
  filterText: { fontFamily: FONTS.medium, fontSize: 12 },
  filterTextActive: { color: '#111827' },
  filterTextInactive: { color: COLORS.white },

  // Urgent alerts
  urgentSection: { marginBottom: 12 },
  urgentBanner: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  urgentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  urgentBadge: {
    backgroundColor: 'rgba(239,68,68,0.3)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  urgentBadgeText: { color: '#FCA5A5', fontFamily: FONTS.bold, fontSize: 10 },
  urgentTitle: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 16, lineHeight: 22 },
  urgentSummary: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, marginTop: 6, lineHeight: 18 },
  urgentTap: { color: '#FCA5A5', fontFamily: FONTS.bodyMed, fontSize: 11, marginTop: 8 },

  // News cards
  card: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    backgroundColor: 'rgba(45,106,79,0.25)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  categoryBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  categoryBadgeText: { fontFamily: FONTS.medium, fontSize: 10 },
  importantBadge: {
    backgroundColor: 'rgba(245,158,11,0.25)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  importantBadgeText: { color: '#FCD34D', fontFamily: FONTS.bold, fontSize: 10 },
  headline: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 21 },
  summary: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardBottom: { marginTop: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  meta: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  metaDot: { color: COLORS.muted, fontSize: 11 },
  cropsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  cropPill: {
    backgroundColor: 'rgba(116,198,157,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cropPillText: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 10 },

  // Empty & loading
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyIcon: { fontSize: 42 },
  emptyTitle: { marginTop: 8, color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  emptySub: { marginTop: 4, color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.harvest,
  },
  retryText: { color: '#111827', fontFamily: FONTS.bold, fontSize: 12 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 8,
  },
  skeletonLineShort: {
    height: 12,
    width: '45%',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: 8,
  },
});
