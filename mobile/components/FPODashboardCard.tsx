import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const FPO_DATA = {
  name: 'FPO-KA-KOL-01',
  members: 142,
  activeFarmers: 87,
  totalLand: '320 ha',
  avgIncome: '₹1.8L/yr',
};

const ACTIVE_BUNDLES = [
  { id: 'B-001', crop: 'Tomato', farmers: 24, quantity: '48 qtl', price: '₹2,800/qtl', status: 'Negotiating', savings: '12%' },
  { id: 'B-002', crop: 'Onion', farmers: 18, quantity: '36 qtl', price: '₹2,200/qtl', status: 'Confirmed', savings: '8%' },
  { id: 'B-003', crop: 'Chilli', farmers: 12, quantity: '6 qtl', price: '₹16,500/qtl', status: 'Open', savings: '15%' },
];

const RESOURCES = [
  { name: 'Tractor Pool', available: 2, total: 5, cost: '₹800/hr' },
  { name: 'Sprayer Equipment', available: 4, total: 8, cost: '₹200/day' },
  { name: 'Storage Godown', available: '120 qtl', total: '500 qtl', cost: '₹5/qtl/month' },
  { name: 'Seed Bank', available: 'Tomato, Onion', total: '8 varieties', cost: 'Subsidized 30%' },
];

const WEEKLY_STATS = [
  { week: 'Week 1', revenue: 45000, bundles: 3 },
  { week: 'Week 2', revenue: 62000, bundles: 4 },
  { week: 'Week 3', revenue: 38000, bundles: 2 },
  { week: 'Week 4', revenue: 71000, bundles: 5 },
];

export default function FPODashboardCard() {
  const { t } = useT();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🤝 FPO Dashboard</Text>
      <Text style={styles.subtitle}>{FPO_DATA.name} · {FPO_DATA.members} members</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{FPO_DATA.activeFarmers}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{FPO_DATA.totalLand}</Text>
          <Text style={styles.statLabel}>Land</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{FPO_DATA.avgIncome}</Text>
          <Text style={styles.statLabel}>Avg Income</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Active Bundles</Text>
      {ACTIVE_BUNDLES.map((bundle) => (
        <View key={bundle.id} style={styles.bundleCard}>
          <View style={styles.bundleHeader}>
            <Text style={styles.bundleId}>{bundle.id}</Text>
            <View style={[styles.statusBadge, bundle.status === 'Confirmed' ? styles.statusConfirmed : bundle.status === 'Negotiating' ? styles.statusNegotiating : styles.statusOpen]}>
              <Text style={styles.statusText}>{bundle.status}</Text>
            </View>
          </View>
          <Text style={styles.bundleCrop}>{bundle.crop} · {bundle.quantity}</Text>
          <View style={styles.bundleDetails}>
            <Text style={styles.bundleDetail}>👥 {bundle.farmers} farmers</Text>
            <Text style={styles.bundleDetail}>💰 {bundle.price}</Text>
            <Text style={styles.savingsText}>↓ {bundle.savings} savings</Text>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Shared Resources</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resourceScroll}>
        {RESOURCES.map((res) => (
          <View key={res.name} style={styles.resourceCard}>
            <Text style={styles.resourceName}>{res.name}</Text>
            <Text style={styles.resourceAvail}>Available: {res.available} / {res.total}</Text>
            <Text style={styles.resourceCost}>{res.cost}</Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Weekly Revenue</Text>
      <View style={styles.chartRow}>
        {WEEKLY_STATS.map((w) => {
          const maxRev = Math.max(...WEEKLY_STATS.map((s) => s.revenue));
          const height = (w.revenue / maxRev) * 80;
          return (
            <View key={w.week} style={styles.chartBar}>
              <View style={[styles.bar, { height }]} />
              <Text style={styles.barLabel}>{w.week.replace('Week ', 'W')}</Text>
              <Text style={styles.barValue}>₹{(w.revenue / 1000).toFixed(0)}K</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10, alignItems: 'center' },
  statValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, marginTop: 2 },
  sectionTitle: { color: COLORS.harvest, fontFamily: FONTS.bold, fontSize: 13, marginTop: 4 },
  bundleCard: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 4 },
  bundleHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  bundleId: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 12 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusConfirmed: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusNegotiating: { backgroundColor: 'rgba(245,158,11,0.2)' },
  statusOpen: { backgroundColor: 'rgba(59,130,246,0.2)' },
  statusText: { color: '#fff', fontFamily: FONTS.medium, fontSize: 10 },
  bundleCrop: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 13 },
  bundleDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  bundleDetail: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  savingsText: { color: '#10B981', fontFamily: FONTS.medium, fontSize: 10 },
  resourceScroll: { marginTop: 2 },
  resourceCard: { width: 140, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, marginRight: 8, gap: 4 },
  resourceName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 12 },
  resourceAvail: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  resourceCost: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 10 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, gap: 8 },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '60%', backgroundColor: COLORS.canopy, borderRadius: 4, minHeight: 10 },
  barLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9 },
  barValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 10 },
});
