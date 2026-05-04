import { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const MARKET_DATA = [
  { crop: 'Tomato', demand: 85, trend: 'up', price: 2500, change: '+12%', recommendation: 'High demand — sell now' },
  { crop: 'Onion', demand: 62, trend: 'up', price: 2000, change: '+8%', recommendation: 'Good time to sell' },
  { crop: 'Potato', demand: 45, trend: 'stable', price: 1500, change: '-2%', recommendation: 'Wait for better prices' },
  { crop: 'Chilli', demand: 78, trend: 'up', price: 15000, change: '+18%', recommendation: 'Strong demand — sell' },
  { crop: 'Rice', demand: 55, trend: 'stable', price: 2200, change: '+3%', recommendation: 'Moderate demand' },
  { crop: 'Wheat', demand: 40, trend: 'down', price: 2100, change: '-5%', recommendation: 'Hold, wait for MSP' },
  { crop: 'Mango', demand: 90, trend: 'up', price: 3000, change: '+25%', recommendation: 'Peak season — sell!' },
];

const PLANTING_RECS = [
  { crop: 'Tomato', season: 'Oct-Nov', profit: 'High', reason: 'Winter demand surge' },
  { crop: 'Chilli', season: 'Jan-Feb', profit: 'Very High', reason: 'Export demand peak' },
  { crop: 'Onion', season: 'Aug-Sep', profit: 'Medium', reason: 'Stable year-round demand' },
  { crop: 'Watermelon', season: 'Feb-Mar', profit: 'High', reason: 'Summer shortage expected' },
];

export default function MarketDemandCard() {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<'demand' | 'planting'>('demand');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📈 Market Intelligence</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'demand' && styles.tabActive]}
          onPress={() => setActiveTab('demand')}
        >
          <Text style={[styles.tabText, activeTab === 'demand' && styles.tabTextActive]}>Demand</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'planting' && styles.tabActive]}
          onPress={() => setActiveTab('planting')}
        >
          <Text style={[styles.tabText, activeTab === 'planting' && styles.tabTextActive]}>Plant Next</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'demand' && (
        <View style={styles.content}>
          {MARKET_DATA.map((m) => (
            <View key={m.crop} style={styles.demandItem}>
              <View style={styles.demandHeader}>
                <Text style={styles.cropName}>{m.crop}</Text>
                <View style={[styles.trendBadge, m.trend === 'up' && styles.trendUp, m.trend === 'down' && styles.trendDown]}>
                  <Text style={styles.trendText}>{m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→'} {m.change}</Text>
                </View>
              </View>
              <View style={styles.demandRow}>
                <View>
                  <Text style={styles.priceLabel}>Price/qtl</Text>
                  <Text style={styles.priceValue}>₹{m.price.toLocaleString()}</Text>
                </View>
                <View style={styles.demandBar}>
                  <Text style={styles.demandLabel}>Demand: {m.demand}%</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${m.demand}%`, backgroundColor: m.demand > 70 ? '#10B981' : m.demand > 50 ? '#F59E0B' : '#EF4444' }]} />
                  </View>
                </View>
              </View>
              <Text style={styles.recommendation}>💡 {m.recommendation}</Text>
            </View>
          ))}
        </View>
      )}

      {activeTab === 'planting' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.content}>
          {PLANTING_RECS.map((rec) => (
            <View key={rec.crop} style={styles.plantingCard}>
              <Text style={styles.plantingCrop}>{rec.crop}</Text>
              <Text style={styles.plantingSeason}>Plant: {rec.season}</Text>
              <View style={[styles.profitBadge, rec.profit.includes('Very') && styles.profitVeryHigh]}>
                <Text style={styles.profitText}>{rec.profit} Profit</Text>
              </View>
              <Text style={styles.plantingReason}>{rec.reason}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
  tabActive: { backgroundColor: COLORS.harvest },
  tabText: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 12 },
  tabTextActive: { color: COLORS.night, fontFamily: FONTS.bold },
  content: { gap: 8 },
  demandItem: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 6 },
  demandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cropName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  trendBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' },
  trendUp: { backgroundColor: 'rgba(16,185,129,0.2)' },
  trendDown: { backgroundColor: 'rgba(239,68,68,0.2)' },
  trendText: { color: '#fff', fontFamily: FONTS.bold, fontSize: 11 },
  demandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  priceValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  demandBar: { flex: 1, marginLeft: 12 },
  demandLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 3 },
  barFill: { height: '100%', borderRadius: 3 },
  recommendation: { color: '#86EFAC', fontFamily: FONTS.body, fontSize: 11 },
  plantingCard: { width: 160, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginRight: 8, gap: 6 },
  plantingCrop: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 15 },
  plantingSeason: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  profitBadge: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  profitVeryHigh: { backgroundColor: 'rgba(239,68,68,0.15)' },
  profitText: { color: '#10B981', fontFamily: FONTS.medium, fontSize: 10 },
  plantingReason: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11, fontStyle: 'italic' },
});
