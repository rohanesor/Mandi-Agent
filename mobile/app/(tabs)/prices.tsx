import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';
import { ALL_CROP_PRICES } from '../../constants/demoData';

type CropKey = keyof typeof ALL_CROP_PRICES;

const CROPS: { crop: CropKey; emoji: string; key: 'cropTomato' | 'cropOnion' | 'cropPotato' | 'cropChilli' | 'cropMango' | 'cropWheat' }[] = [
  { crop: 'Tomato', emoji: '🍅', key: 'cropTomato' },
  { crop: 'Onion', emoji: '🧅', key: 'cropOnion' },
  { crop: 'Potato', emoji: '🥔', key: 'cropPotato' },
  { crop: 'Chilli', emoji: '🌶️', key: 'cropChilli' },
  { crop: 'Mango', emoji: '🥭', key: 'cropMango' },
  { crop: 'Wheat', emoji: '🌾', key: 'cropWheat' },
];

const STATE_FILTERS = ['All States', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Andhra Pradesh', 'Telangana'] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

function PriceBar({ value, max }: { value: number; max: number }) {
  const h = useSharedValue(12);
  h.value = withTiming(Math.max(16, (value / Math.max(1, max)) * 100), { duration: 350 });
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View style={styles.barContainer}>
      <Animated.View style={[styles.bar, style]} />
    </View>
  );
}

export default function PricesScreen() {
  const { t } = useT();
  const [selectedCrop, setSelectedCrop] = useState<CropKey>('Tomato');
  const [selectedState, setSelectedState] = useState<StateFilter>('All States');

  const currentPrices = useMemo(
    () => ALL_CROP_PRICES[selectedCrop] || ALL_CROP_PRICES.Tomato,
    [selectedCrop],
  );
  const filteredPrices = useMemo(
    () =>
      selectedState === 'All States'
        ? currentPrices
        : currentPrices.filter((p) => p.state === selectedState),
    [currentPrices, selectedState],
  );
  const maxModal = Math.max(...filteredPrices.map((p) => p.modal), 1);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mandi Prices</Text>
          <Text style={styles.headerSubtitle}>{t('searchMandi')}</Text>
        </View>
        <Text style={styles.headerIcon}>📊</Text>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>Select Crop</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
          {CROPS.map((item) => {
            const active = selectedCrop === item.crop;
            return (
              <TouchableOpacity
                key={item.crop}
                style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                onPress={() => setSelectedCrop(item.crop)}
              >
                <Text style={styles.pillEmoji}>{item.emoji}</Text>
                <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{t(item.key)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>Filter by State</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statePillsRow}>
          {STATE_FILTERS.map((state) => {
            const active = selectedState === state;
            return (
              <TouchableOpacity
                key={state}
                style={[styles.statePill, active ? styles.statePillActive : styles.statePillInactive]}
                onPress={() => setSelectedState(state)}
              >
                <Text style={[styles.statePillText, active ? styles.statePillTextActive : styles.statePillTextInactive]}>{state}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.tickerSection}>
        <Text style={styles.tickerTitle}>Price Distribution</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartRow}>
          {filteredPrices.map((item) => (
            <View key={`${selectedCrop}-${item.mandi}`} style={styles.chartItem}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartValue}>₹{item.modal}</Text>
              </View>
              <PriceBar value={item.modal} max={maxModal} />
              <Text style={styles.chartLabel} numberOfLines={1}>{item.mandi}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.cardsWrap}>
        {filteredPrices.map((item) => (
          <Pressable key={`${selectedCrop}-card-${item.mandi}`} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mandi}>{item.mandi}</Text>
              <Text style={styles.state}>{item.state}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
              <Text style={styles.price}>₹{item.modal}</Text>
              <Text style={[styles.change, item.change >= 0 ? styles.up : styles.down]}>
                {item.change >= 0 ? '+' : ''}{item.change} ({item.trend})
              </Text>
              <Text style={styles.forecast}>7d: ₹{item.forecast_7d}</Text>
            </View>
            <View style={styles.detailsButton}>
              <Text style={styles.detailsButtonText}>→</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 28, marginBottom: 6 },
  headerSubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  headerIcon: { fontSize: 40, marginTop: 4 },
  filterSection: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  filterTitle: {
    color: COLORS.muted,
    fontFamily: FONTS.medium,
    fontSize: 12,
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pillsRow: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 8 },
  pill: {
    height: 38,
    minWidth: 90,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  pillActive: { backgroundColor: COLORS.harvest, borderColor: COLORS.harvest },
  pillInactive: { backgroundColor: '#1F3A34', borderColor: '#2D6A4F' },
  pillEmoji: { fontSize: 16, marginRight: 6 },
  pillText: { fontFamily: FONTS.bold, fontSize: 12 },
  pillTextActive: { color: '#111827' },
  pillTextInactive: { color: COLORS.white },
  statePillsRow: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 8 },
  statePill: {
    height: 34,
    minWidth: 75,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  statePillActive: { backgroundColor: COLORS.harvest, borderColor: COLORS.harvest },
  statePillInactive: { backgroundColor: '#1F3A34', borderColor: '#2D6A4F' },
  statePillText: { fontFamily: FONTS.bold, fontSize: 11 },
  statePillTextActive: { color: '#111827' },
  statePillTextInactive: { color: COLORS.white },
  tickerSection: {
    marginHorizontal: 16,
    marginVertical: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tickerTitle: {
    color: COLORS.muted,
    fontFamily: FONTS.medium,
    fontSize: 12,
    marginBottom: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chartRow: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 12,
  },
  chartItem: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#1F3A34',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D6A4F',
  },
  chartHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartValue: {
    color: COLORS.harvest,
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  barContainer: {
    width: 24,
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginVertical: 6,
  },
  bar: {
    width: 24,
    borderRadius: 6,
    backgroundColor: COLORS.harvest,
  },
  chartLabel: {
    marginTop: 8,
    color: COLORS.muted,
    fontFamily: FONTS.body,
    fontSize: 9,
    textAlign: 'center',
    width: '100%',
  },
  cardsWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 30 },
  card: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.canopy,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
  },
  mandi: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 15 },
  state: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  price: { color: COLORS.white, fontFamily: FONTS.mono, fontSize: 18 },
  change: { fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  up: { color: '#74C69D' },
  down: { color: '#EF4444' },
  forecast: { color: COLORS.grain, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  detailsButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsButtonText: { color: COLORS.harvest, fontFamily: FONTS.bold, fontSize: 18 },
});
