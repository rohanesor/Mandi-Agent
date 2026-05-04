import {
  View,
  StyleSheet,
  Text,
} from 'react-native';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const SOIL_DATA = {
  ph: { value: 6.8, label: 'pH Level', status: 'good', rec: 'Optimal for most crops' },
  nitrogen: { value: 285, label: 'Nitrogen (kg/ha)', status: 'medium', rec: 'Add urea (40 kg/ha) for next season' },
  phosphorus: { value: 42, label: 'Phosphorus (kg/ha)', status: 'low', rec: 'Apply DAP (50 kg/ha) before sowing' },
  potassium: { value: 180, label: 'Potassium (kg/ha)', status: 'good', rec: 'Adequate levels maintained' },
  organic: { value: 0.8, label: 'Organic Carbon (%)', status: 'low', rec: 'Add farmyard manure (10 tonnes/ha)' },
  zinc: { value: 0.4, label: 'Zinc (ppm)', status: 'medium', rec: 'Apply zinc sulphate (25 kg/ha) every 2 years' },
};

const NUTRIENTS = [
  { key: 'ph', min: 0, low: 5.5, optimal: [6.0, 7.5], high: 8.5, max: 14, unit: '' },
  { key: 'nitrogen', min: 0, low: 200, optimal: [250, 400], high: 500, max: 600, unit: ' kg/ha' },
  { key: 'phosphorus', min: 0, low: 20, optimal: [30, 50], high: 80, max: 100, unit: ' kg/ha' },
  { key: 'potassium', min: 0, low: 100, optimal: [150, 250], high: 300, max: 400, unit: ' kg/ha' },
  { key: 'organic', min: 0, low: 0.5, optimal: [0.7, 1.5], high: 2.0, max: 3.0, unit: '%' },
  { key: 'zinc', min: 0, low: 0.3, optimal: [0.5, 1.5], high: 2.0, max: 3.0, unit: ' ppm' },
];

const FERTILIZER_RECS = [
  { crop: 'Tomato', fertilizer: 'NPK 19:19:19', dosage: '50 kg/ha', timing: 'At flowering' },
  { crop: 'Onion', fertilizer: 'Urea + DAP', dosage: '40 + 30 kg/ha', timing: 'Before planting' },
  { crop: 'Rice', fertilizer: 'NPK 120:60:40', dosage: 'Split in 3 doses', timing: 'Basal, tillering, panicle' },
  { crop: 'Wheat', fertilizer: 'DAP + Urea', dosage: '50 + 60 kg/ha', timing: 'At sowing + irrigation' },
];

export default function SoilHealthCard() {
  const { t } = useT();

  const getBarColor = (key: string, value: number) => {
    const spec = NUTRIENTS.find((n) => n.key === key);
    if (!spec) return COLORS.muted;
    if (value >= spec.optimal[0] && value <= spec.optimal[1]) return '#10B981';
    if (value < spec.low || value > spec.high) return '#EF4444';
    return '#F59E0B';
  };

  const getBarPercent = (key: string, value: number) => {
    const spec = NUTRIENTS.find((n) => n.key === key);
    if (!spec) return 50;
    return Math.min(100, Math.max(0, ((value - spec.min) / (spec.max - spec.min)) * 100));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🧪 Soil Health Card</Text>
      <Text style={styles.subtitle}>Based on your soil test results</Text>

      {NUTRIENTS.map((n) => {
        const data = SOIL_DATA[n.key as keyof typeof SOIL_DATA];
        return (
          <View key={n.key} style={styles.nutrientRow}>
            <View style={styles.nutrientInfo}>
              <Text style={styles.nutrientName}>{data.label}</Text>
              <Text style={styles.nutrientValue}>
                {n.key === 'ph' || n.key === 'organic' || n.key === 'zinc'
                  ? data.value
                  : Math.round(data.value)}
                {n.unit}
              </Text>
            </View>
            <View style={styles.barContainer}>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${getBarPercent(n.key, data.value)}%`,
                      backgroundColor: getBarColor(n.key, data.value),
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}

      <View style={styles.recsSection}>
        <Text style={styles.recsTitle}>💊 Fertilizer Recommendations</Text>
        {FERTILIZER_RECS.map((rec, i) => (
          <View key={i} style={styles.recItem}>
            <Text style={styles.recCrop}>{rec.crop}</Text>
            <Text style={styles.recDetail}>{rec.fertilizer} — {rec.dosage}</Text>
            <Text style={styles.recTiming}>🕐 {rec.timing}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  nutrientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nutrientInfo: { width: 130 },
  nutrientName: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  nutrientValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  barContainer: { flex: 1 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' },
  barFill: { height: '100%', borderRadius: 4 },
  recsSection: { marginTop: 6, borderTopWidth: 1, borderTopColor: COLORS.canopy, paddingTop: 10, gap: 8 },
  recsTitle: { color: COLORS.harvest, fontFamily: FONTS.bold, fontSize: 13 },
  recItem: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8 },
  recCrop: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 12 },
  recDetail: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 11 },
  recTiming: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
});
