import { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';
import NotificationBell from '../../components/NotificationBell';
import DiseaseDetectionCard from '../../components/DiseaseDetectionCard';
import ExpenseTrackerCard from '../../components/ExpenseTrackerCard';
import SellDirectCard from '../../components/SellDirectCard';
import YieldEstimatorCard from '../../components/YieldEstimatorCard';
import MarketDemandCard from '../../components/MarketDemandCard';
import PestAlertsCard from '../../components/PestAlertsCard';
import SoilHealthCard from '../../components/SoilHealthCard';
import FPODashboardCard from '../../components/FPODashboardCard';

const FARM_PROFILE_KEY = '@mandiagent:farmProfile';

const SOIL_TYPES = [
  { key: 'alluvial', emoji: '🌊' },
  { key: 'black', emoji: '⬛' },
  { key: 'red', emoji: '🔴' },
  { key: 'laterite', emoji: '🟤' },
];

const IRRIGATION_TYPES = [
  { key: 'rainfed', emoji: '🌧️' },
  { key: 'irrigated', emoji: '💧' },
  { key: 'mixed', emoji: '🔄' },
];

type FarmProfile = {
  farmerName: string;
  village: string;
  district: string;
  state: string;
  landholding: string;
  soilType: string;
  irrigationType: string;
};

const defaultProfile: FarmProfile = {
  farmerName: '',
  village: '',
  district: '',
  state: 'Karnataka',
  landholding: '',
  soilType: 'red',
  irrigationType: 'rainfed',
};

export default function FarmScreen() {
  const { t } = useT();
  const [profile, setProfile] = useState<FarmProfile>(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FARM_PROFILE_KEY).then((raw) => {
      if (raw) setProfile({ ...defaultProfile, ...JSON.parse(raw) });
    });
  }, []);

  const updateField = (field: keyof FarmProfile, value: string) => {
    setProfile((p) => ({ ...p, [field]: value }));
    setHasChanges(true);
  };

  const saveProfile = async () => {
    await AsyncStorage.setItem(FARM_PROFILE_KEY, JSON.stringify(profile));
    setEditing(false);
    setHasChanges(false);
    Alert.alert('', t('profileSaved'));
  };

  const soilLabel = (key: string) => {
    const map: Record<string, string> = {
      alluvial: t('soilAlluvial'),
      black: t('soilBlack'),
      red: t('soilRed'),
      laterite: t('soilLaterite'),
    };
    return map[key] || key;
  };

  const irrigationLabel = (key: string) => {
    const map: Record<string, string> = {
      rainfed: t('rainfed'),
      irrigated: t('irrigated'),
      mixed: t('mixed'),
    };
    return map[key] || key;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>{t('farmProfile')}</Text>
          <View style={styles.headerRight}>
            {hasChanges && <Text style={styles.unsavedBadge}>{t('unsaved')}</Text>}
            <NotificationBell />
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile.farmerName ? profile.farmerName.slice(0, 2).toUpperCase() : '🌾'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile.farmerName || t('tapToEdit')}
              </Text>
              <Text style={styles.profileLocation}>
                {[profile.village, profile.district, profile.state].filter(Boolean).join(', ') || t('tapToEdit')}
              </Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => editing ? saveProfile() : setEditing(true)}>
              <Text style={styles.editBtnText}>{editing ? t('saveProfile') : t('edit')}</Text>
            </TouchableOpacity>
          </View>

          {!editing && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.landholding || '—'}</Text>
                <Text style={styles.statLabel}>{t('landholding')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{soilLabel(profile.soilType)}</Text>
                <Text style={styles.statLabel}>{t('soilType')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{irrigationLabel(profile.irrigationType)}</Text>
                <Text style={styles.statLabel}>{t('irrigationType')}</Text>
              </View>
            </View>
          )}
        </View>

        {editing && (
          <View style={styles.editCard}>
            <Text style={styles.sectionTitle}>{t('editProfile')}</Text>

            <Text style={styles.label}>{t('farmerName')}</Text>
            <TextInput
              style={styles.input}
              value={profile.farmerName}
              onChangeText={(v) => updateField('farmerName', v)}
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>{t('village')}</Text>
            <TextInput
              style={styles.input}
              value={profile.village}
              onChangeText={(v) => updateField('village', v)}
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>{t('district')}</Text>
            <TextInput
              style={styles.input}
              value={profile.district}
              onChangeText={(v) => updateField('district', v)}
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>{t('state')}</Text>
            <TextInput
              style={styles.input}
              value={profile.state}
              onChangeText={(v) => updateField('state', v)}
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>{t('landholding')} ({t('hectare')})</Text>
            <TextInput
              style={styles.input}
              value={profile.landholding}
              onChangeText={(v) => updateField('landholding', v)}
              keyboardType="numeric"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>{t('soilType')}</Text>
            <View style={styles.pillRow}>
              {SOIL_TYPES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.pill, profile.soilType === s.key && styles.pillActive]}
                  onPress={() => updateField('soilType', s.key)}
                >
                  <Text style={[styles.pillText, profile.soilType === s.key && styles.pillTextActive]}>
                    {s.emoji} {soilLabel(s.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t('irrigationType')}</Text>
            <View style={styles.pillRow}>
              {IRRIGATION_TYPES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.pill, profile.irrigationType === s.key && styles.pillActive]}
                  onPress={() => updateField('irrigationType', s.key)}
                >
                  <Text style={[styles.pillText, profile.irrigationType === s.key && styles.pillTextActive]}>
                    {s.emoji} {irrigationLabel(s.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <PestAlertsCard />
        <DiseaseDetectionCard />
        <YieldEstimatorCard />
        <ExpenseTrackerCard />
        <SellDirectCard />
        <MarketDemandCard />
        <SoilHealthCard />
        <FPODashboardCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unsavedBadge: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 11 },
  profileCard: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.canopy, padding: 14 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.canopy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 18 },
  profileInfo: { flex: 1 },
  profileName: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16 },
  profileLocation: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  editBtn: { backgroundColor: COLORS.canopy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.canopy },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 14 },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, marginTop: 2 },
  editCard: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 1, borderColor: COLORS.harvest, padding: 14, gap: 10 },
  sectionTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 16, marginBottom: 4 },
  label: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 6 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.white, fontFamily: FONTS.body, fontSize: 14 },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  pill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' },
  pillActive: { borderColor: COLORS.harvest, backgroundColor: 'rgba(239,68,68,0.15)' },
  pillText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },
  pillTextActive: { color: COLORS.harvest, fontFamily: FONTS.medium },
});
