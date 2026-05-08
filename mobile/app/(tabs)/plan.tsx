import { View, ScrollView, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store';
import { COLORS, FONTS } from '../../constants/theme';

const SEASON_LABELS: Record<string, string> = {
  kharif: 'Kharif (Monsoon)',
  rabi: 'Rabi (Winter)',
  zaid: 'Zaid (Summer)',
};

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const seasonPlan = useAppStore((s) => s.seasonPlan);

  if (!seasonPlan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyTitle}>No Plan Yet</Text>
          <Text style={styles.emptySubtitle}>Set up your season plan to get started</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => { router.push('/plan-onboarding'); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          >
            <Text style={styles.buttonText}>Create Plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>📋</Text>
          <Text style={styles.title}>My Crop Plan</Text>
          <Text style={styles.seasonBadge}>{SEASON_LABELS[seasonPlan.season] || seasonPlan.season} {seasonPlan.year}</Text>
        </View>

        {seasonPlan.crops.map((cp, idx) => (
          <View key={idx} style={styles.cropCard}>
            <View style={styles.cropHeader}>
              <Text style={styles.cropName}>{cp.crop}</Text>
            </View>
            <View style={styles.cropDetailRow}>
              <View style={styles.cropDetail}>
                <Text style={styles.cropDetailLabel}>Area</Text>
                <Text style={styles.cropDetailValue}>{cp.area_hectares} ha</Text>
              </View>
              <View style={styles.cropDetail}>
                <Text style={styles.cropDetailLabel}>Harvest</Text>
                <Text style={styles.cropDetailValue}>{cp.expected_harvest_month}</Text>
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => { router.push('/plan-onboarding'); if (Platform.OS !== 'web') Haptics.selectionAsync(); }}
        >
          <Text style={styles.editButtonText}>Edit Plan</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24, marginBottom: 8 },
  emptySubtitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', marginBottom: 24 },
  button: {
    backgroundColor: COLORS.sprout, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  buttonText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 16 },
  header: { alignItems: 'center', paddingVertical: 32 },
  headerEmoji: { fontSize: 48, marginBottom: 8 },
  title: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24, marginBottom: 8 },
  seasonBadge: {
    backgroundColor: COLORS.canopy, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6,
    color: COLORS.sprout, fontFamily: FONTS.medium, fontSize: 13,
    overflow: 'hidden',
  },
  cropCard: {
    backgroundColor: COLORS.forest, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: COLORS.canopy, marginBottom: 12,
  },
  cropHeader: { marginBottom: 12 },
  cropName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 17 },
  cropDetailRow: { flexDirection: 'row', gap: 16 },
  cropDetail: { flex: 1 },
  cropDetailLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginBottom: 4 },
  cropDetailValue: { color: COLORS.sprout, fontFamily: FONTS.bold, fontSize: 16 },
  editButton: {
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.sprout,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  editButtonText: { color: COLORS.sprout, fontFamily: FONTS.bold, fontSize: 15 },
});
