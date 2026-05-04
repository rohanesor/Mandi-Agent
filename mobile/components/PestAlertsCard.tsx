import {
  View,
  StyleSheet,
  Text,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import { useT } from '../utils/useT';

const PEST_ALERTS = [
  {
    id: '1',
    crop: 'Tomato',
    pest: 'Late Blight (Phytophthora)',
    severity: 'high',
    message: 'High humidity forecasted — apply preventive fungicide within 48 hours',
    date: '2026-05-04',
    region: 'Kolar',
  },
  {
    id: '2',
    crop: 'Onion',
    pest: 'Thrips Attack',
    severity: 'medium',
    message: 'Thrips activity rising in your area. Monitor leaf tips for silver streaks',
    date: '2026-05-03',
    region: 'Bangalore Rural',
  },
  {
    id: '3',
    crop: 'Chilli',
    pest: 'Fruit Borer',
    severity: 'high',
    message: 'Fruit borer larvae detected nearby. Set pheromone traps immediately',
    date: '2026-05-02',
    region: 'Kolar',
  },
  {
    id: '4',
    crop: 'Rice',
    pest: 'Brown Plant Hopper',
    severity: 'low',
    message: 'Low risk this week. Keep fields well-drained to prevent breeding',
    date: '2026-05-01',
    region: 'Mandya',
  },
];

export default function PestAlertsCard() {
  const { t } = useT();

  const severityColor = (sev: string) => {
    if (sev === 'high') return '#EF4444';
    if (sev === 'medium') return '#F59E0B';
    return '#10B981';
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🐛 Pest Alerts</Text>
      <Text style={styles.subtitle}>Location-based warnings for your area</Text>

      {PEST_ALERTS.map((alert) => (
        <View key={alert.id} style={styles.alertItem}>
          <View style={styles.alertHeader}>
            <Text style={styles.alertCrop}>{alert.crop}</Text>
            <View style={[styles.severityDot, { backgroundColor: severityColor(alert.severity) }]} />
          </View>
          <Text style={styles.alertPest}>{alert.pest}</Text>
          <Text style={styles.alertMessage}>{alert.message}</Text>
          <Text style={styles.alertDate}>{alert.region} · {alert.date}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14, gap: 10 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  subtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  alertItem: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10, gap: 4 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertCrop: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 13 },
  severityDot: { width: 10, height: 10, borderRadius: 5 },
  alertPest: { color: '#FCA5A5', fontFamily: FONTS.medium, fontSize: 12 },
  alertMessage: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },
  alertDate: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
});
