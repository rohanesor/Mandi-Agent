import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, FONTS, SPRING } from '../constants/theme';
import { Deal } from '../hooks/useDeals';
import { hapticLight } from '../utils/haptics';

interface DealCardProps {
  deal: Deal;
  isJoined: boolean;
  onPress: (deal: Deal) => void;
}

function getTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

function getStatusColor(status: Deal['status']) {
  switch (status) {
    case 'confirmed':
    case 'truck_booked':
    case 'departed':
    case 'settled':
      return '#52B788';
    case 'filling':
      return COLORS.harvest;
    default:
      return COLORS.leaf;
  }
}

function getStatusLabel(status: Deal['status']) {
  switch (status) {
    case 'open': return 'Open';
    case 'filling': return 'Filling Fast';
    case 'confirmed': return '✅ Confirmed';
    case 'truck_booked': return '🚛 Truck Booked';
    case 'departed': return '🚚 Departed';
    case 'settled': return '💰 Settled';
  }
}

export default function DealCard({ deal, isJoined, onPress }: DealCardProps) {
  const fillPct = Math.min(deal.current_quantity / deal.target_quantity, 1);
  const isExpiringSoon =
    new Date(deal.expires_at).getTime() - Date.now() < 12 * 3600000;
  const isConfirmed = deal.status === 'confirmed' || deal.status === 'truck_booked';

  const barWidth = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  React.useEffect(() => {
    barWidth.value = withTiming(fillPct * 100, { duration: 900 });
    if (fillPct > 0.85) {
      glow.value = withRepeat(
        withSequence(withTiming(1, { duration: 900 }), withTiming(0.4, { duration: 900 })),
        -1,
        true
      );
    }
  }, [fillPct, barWidth, glow]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%`,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: fillPct > 0.85 ? glow.value : 1,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.97, SPRING.snappy);
    hapticLight();
  };
  const onPressOut = () => {
    scale.value = withSpring(1, SPRING.gentle);
  };

  // Urgency border color
  const borderColor = isConfirmed
    ? '#52B788'
    : isExpiringSoon
    ? '#EF4444'
    : COLORS.leaf;

  return (
    <Animated.View style={[styles.wrapper, cardStyle]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={() => onPress(deal)}
        style={[styles.card, { borderColor }]}
      >
        {/* Top Row — crop, mandi, status badge */}
        <View style={styles.topRow}>
          <View style={styles.cropRow}>
            <Text style={styles.cropEmoji}>{deal.crop_emoji}</Text>
            <View>
              <Text style={styles.cropName}>{deal.crop}</Text>
              <Text style={styles.mandiName}>→ {deal.target_mandi}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(deal.status) + '22', borderColor: getStatusColor(deal.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(deal.status) }]}>
              {getStatusLabel(deal.status)}
            </Text>
          </View>
        </View>

        {/* Price row */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{deal.mandi_price}/kg</Text>
          <Text style={[styles.priceChange, { color: deal.price_change_pct >= 0 ? '#52B788' : '#EF4444' }]}>
            {deal.price_change_pct >= 0 ? '↑' : '↓'} {Math.abs(deal.price_change_pct)}% today
          </Text>
          <Text style={styles.savingsBadge}>Save ₹{deal.savings_per_quintal}/qtl</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>
              {deal.current_quantity}q filled
            </Text>
            <Text style={styles.progressLabel}>
              Target: {deal.target_quantity}q
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                barStyle,
                { backgroundColor: isConfirmed ? '#52B788' : fillPct > 0.75 ? COLORS.harvest : COLORS.leaf },
              ]}
            />
          </View>
        </View>

        {/* Farmer avatars + meta */}
        <View style={styles.bottomRow}>
          <View style={styles.avatarRow}>
            {deal.members.slice(0, 4).map((m, idx) => (
              <Animated.View
                key={m.farmer_id}
                style={[styles.avatarBubble, { marginLeft: idx === 0 ? 0 : -8, zIndex: 10 - idx }, glowStyle]}
              >
                <Text style={styles.avatarEmoji}>{m.avatar}</Text>
              </Animated.View>
            ))}
            {deal.members.length > 4 && (
              <View style={[styles.avatarBubble, styles.avatarExtra, { marginLeft: -8 }]}>
                <Text style={styles.avatarExtraText}>+{deal.members.length - 4}</Text>
              </View>
            )}
          </View>

          <View style={styles.metaRight}>
            <Text style={styles.metaText}>📍 {deal.distance_km} km</Text>
            <Text style={[styles.metaText, isExpiringSoon && { color: '#EF4444' }]}>
              ⏱ {getTimeLeft(deal.expires_at)}
            </Text>
          </View>
        </View>

        {/* CTA */}
        <View style={[styles.ctaRow]}>
          <Animated.View style={[styles.ctaBtn, isJoined && styles.ctaBtnJoined, { opacity: isConfirmed ? 1 : 1 }]}>
            <Text style={[styles.ctaText, isJoined && styles.ctaTextJoined]}>
              {isJoined ? '✅ You\'re In — View Deal' : isConfirmed ? '✅ Deal Confirmed' : 'View Deal →'}
            </Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 16, marginBottom: 12 },
  card: {
    backgroundColor: COLORS.forest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cropRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cropEmoji: { fontSize: 32 },
  cropName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 17 },
  mandiName: { color: COLORS.sprout, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusText: { fontFamily: FONTS.bodyMed, fontSize: 11 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  price: { color: COLORS.harvest, fontFamily: FONTS.mono, fontSize: 20 },
  priceChange: { fontFamily: FONTS.bodyMed, fontSize: 12 },
  savingsBadge: {
    marginLeft: 'auto',
    backgroundColor: '#166534',
    color: '#DCFCE7',
    fontFamily: FONTS.bodyMed,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  progressSection: { marginBottom: 12 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  progressTrack: { height: 8, backgroundColor: COLORS.night, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.canopy,
    borderWidth: 2,
    borderColor: COLORS.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 18 },
  avatarExtra: { backgroundColor: COLORS.night },
  avatarExtraText: { color: COLORS.muted, fontFamily: FONTS.bodyMed, fontSize: 10 },
  metaRight: { alignItems: 'flex-end', gap: 2 },
  metaText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  ctaRow: {},
  ctaBtn: {
    backgroundColor: COLORS.harvest,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaBtnJoined: { backgroundColor: '#166534' },
  ctaText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 14 },
  ctaTextJoined: { color: '#DCFCE7' },
});
