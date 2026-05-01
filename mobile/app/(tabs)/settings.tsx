import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGES } from '../../constants/languages';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

const GOOGLE_USER_KEY = '@mandiagent:googleUser';
const NOTIF_KEY = '@mandiagent:notifications';
const PROFILE_KEY = '@mandiagent:profile';

const STATE_OPTIONS = [
  'Karnataka',
  'Tamil Nadu',
  'Telangana',
  'Maharashtra',
  'Gujarat',
  'West Bengal',
  'Bihar',
  'Uttar Pradesh',
];

type GoogleUser = { name: string; email: string; photo: string | null } | null;

type NotificationState = {
  morningHarvest: boolean;
  priceAlert: boolean;
  bundleAlert: boolean;
  spoilageWarning: boolean;
  weeklyDigest: boolean;
};

const defaultNotifications: NotificationState = {
  morningHarvest: true,
  priceAlert: true,
  bundleAlert: true,
  spoilageWarning: true,
  weeklyDigest: true,
};

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const { t, code, setCode } = useT();
  const [googleUser, setGoogleUser] = useState<GoogleUser>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [showLanguageGrid, setShowLanguageGrid] = useState(false);
  const [notifications, setNotifications] = useState<NotificationState>(defaultNotifications);
  const [profile, setProfile] = useState({
    farmerName: 'Raju Naik',
    phone: '+919876543210',
    village: 'Mulbagal',
    district: 'Kolar',
    state: 'Karnataka',
    landholding: '2.5',
    fpoName: '',
  });

  useEffect(() => {
    AsyncStorage.getItem(GOOGLE_USER_KEY).then((raw) => raw && setGoogleUser(JSON.parse(raw)));
    AsyncStorage.getItem(NOTIF_KEY).then((raw) => raw && setNotifications(JSON.parse(raw)));
    AsyncStorage.getItem(PROFILE_KEY).then((raw) => raw && setProfile(JSON.parse(raw)));
  }, []);

  const currentLangLabel = useMemo(
    () => LANGUAGES.find((l) => l.code === code)?.englishName || 'English',
    [code],
  );

  const setNotif = async (key: keyof NotificationState, value: boolean) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  };

  const saveProfile = async () => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  };

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    await new Promise((r) => setTimeout(r, 1500));
    const user = { name: 'Raju Naik', email: 'raju.naik@gmail.com', photo: null };
    setGoogleUser(user);
    await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
    setConnectingGoogle(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>{t('settingsTitle')}</Text>

        <SectionHeader title={t('profile').toUpperCase()} />
        <View style={styles.card}>
          {googleUser ? (
            <View style={styles.profileRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>RN</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nameText}>{googleUser.name}</Text>
                <Text style={styles.emailText}>{googleUser.email}</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  setGoogleUser(null);
                  await AsyncStorage.removeItem(GOOGLE_USER_KEY);
                }}
              >
                <Text style={styles.signOut}>Sign out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.connectBtn} onPress={connectGoogle} disabled={connectingGoogle}>
              {connectingGoogle ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.connectText}>Connect Google Account</Text>
              )}
            </TouchableOpacity>
          )}

          <TextInput style={styles.input} value={profile.farmerName} onChangeText={(v) => setProfile((p) => ({ ...p, farmerName: v }))} placeholder="Farmer Name" placeholderTextColor={COLORS.muted} />
          <TextInput style={styles.input} value={profile.phone} onChangeText={(v) => setProfile((p) => ({ ...p, phone: v }))} placeholder="Phone" placeholderTextColor={COLORS.muted} />
          <Text style={styles.maskedText}>Masked: ******{profile.phone.slice(-4)}</Text>
          <TextInput style={styles.input} value={profile.village} onChangeText={(v) => setProfile((p) => ({ ...p, village: v }))} placeholder="Village" placeholderTextColor={COLORS.muted} />
          <TextInput style={styles.input} value={profile.district} onChangeText={(v) => setProfile((p) => ({ ...p, district: v }))} placeholder="District" placeholderTextColor={COLORS.muted} />
          <Text style={styles.inputLabel}>State</Text>
          <TouchableOpacity style={styles.stateSelect} onPress={() => setStateDropdownOpen((s) => !s)}>
            <Text style={styles.stateSelectText}>{profile.state}</Text>
            <Text style={styles.stateSelectArrow}>{stateDropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {stateDropdownOpen && (
            <View style={styles.stateDropdownList}>
              {STATE_OPTIONS.map((stateOption) => {
                const active = profile.state === stateOption;
                return (
                  <TouchableOpacity
                    key={stateOption}
                    style={[styles.stateOption, active && styles.stateOptionActive]}
                    onPress={() => {
                      setProfile((p) => ({ ...p, state: stateOption }));
                      setStateDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.stateOptionText, active && styles.stateOptionTextActive]}>{stateOption}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <TextInput style={styles.input} value={profile.landholding} onChangeText={(v) => setProfile((p) => ({ ...p, landholding: v }))} placeholder="Landholding (acres)" placeholderTextColor={COLORS.muted} keyboardType="numeric" />
          <TextInput style={styles.input} value={profile.fpoName} onChangeText={(v) => setProfile((p) => ({ ...p, fpoName: v }))} placeholder="FPO Name (optional)" placeholderTextColor={COLORS.muted} />

          <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
            <Text style={styles.saveText}>Save Profile</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title={t('notifications').toUpperCase()} />
        <View style={styles.card}>
          <NotifRow label="🌅 Morning Harvest Alert (6:00 AM daily)" desc="Get advisory reminders every morning" value={notifications.morningHarvest} onValueChange={(v) => setNotif('morningHarvest', v)} />
          <NotifRow label="📈 Price Alert" desc="Notify when mandi prices change significantly" value={notifications.priceAlert} onValueChange={(v) => setNotif('priceAlert', v)} />
          <NotifRow label="🤝 Bundle Alert" desc="Notify when cooperative bundle is forming" value={notifications.bundleAlert} onValueChange={(v) => setNotif('bundleAlert', v)} />
          <NotifRow label="⚠️ Spoilage Warning" desc="Alert when produce spoilage risk is high" value={notifications.spoilageWarning} onValueChange={(v) => setNotif('spoilageWarning', v)} />
          <NotifRow label="📋 Weekly FPO Digest" desc="Monday morning summary for FPO coordinators" value={notifications.weeklyDigest} onValueChange={(v) => setNotif('weeklyDigest', v)} />
        </View>

        <SectionHeader title="BROWSER NOTIFICATIONS" />
        <View style={styles.card}>
          <NotifRow 
            label="Enable Web Push" 
            desc="Get real-time browser alerts even when app is closed" 
            value={notifications.bundleAlert} // Reuse or add new key
            onValueChange={() => {
              Alert.alert(
                "Browser Permissions",
                "Allow mandiagent.in to show notifications in your browser settings to receive alerts.",
                [{ text: "OK" }]
              );
            }} 
          />
          <TouchableOpacity 
            style={[styles.saveBtn, { backgroundColor: COLORS.canopy, marginTop: 12 }]} 
            onPress={() => {
              Alert.alert("Success", "Browser notifications are now synced with your profile.");
            }}
          >
            <Text style={[styles.saveText, { color: COLORS.white }]}>Request Browser Permissions</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title={t('language').toUpperCase()} />
        <View style={styles.card}>
          <View style={styles.langHeaderRow}>
            <Text style={styles.langCurrent}>Current: {currentLangLabel}</Text>
            <TouchableOpacity onPress={() => setShowLanguageGrid((s) => !s)}>
              <Text style={styles.changeLink}>{showLanguageGrid ? 'Hide ↑' : 'Change →'}</Text>
            </TouchableOpacity>
          </View>
          {showLanguageGrid && (
            <View style={styles.langGrid}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity key={lang.code} style={[styles.langChip, code === lang.code && styles.langChipActive]} onPress={() => setCode(lang.code)}>
                  <Text style={[styles.langChipText, code === lang.code && { color: COLORS.night }]}>{lang.nativeName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <SectionHeader title="APP INFO" />
        <View style={styles.card}>
          <Text style={styles.info}>Version: 1.0.0 (Beta)</Text>
          <Text style={styles.info}>SDG 2 · SDG 12 · SDG 10</Text>
          <Text style={styles.info}>Built for India's 120M farmers</Text>

          <TouchableOpacity onPress={() => Linking.openURL('https://mandiagent.in/privacy')}><Text style={styles.link}>Privacy Policy</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('https://mandiagent.in/terms')}><Text style={styles.link}>Terms of Service</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:help@mandiagent.in')}><Text style={styles.link}>Help & Support</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function NotifRow({
  label,
  desc,
  value,
  onValueChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.notifRow}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.notifLabel}>{label}</Text>
        <Text style={styles.notifDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#374151', true: '#F59E0B' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  content: { padding: 16, paddingBottom: 30 },
  pageTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 24, marginBottom: 4 },
  sectionHeader: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, letterSpacing: 1.1, marginTop: 24, marginBottom: 8 },
  card: { backgroundColor: COLORS.forest, borderRadius: 12, borderWidth: 0.5, borderColor: '#2D6A4F', padding: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.harvest },
  avatarText: { color: COLORS.night, fontFamily: FONTS.bold },
  nameText: { color: COLORS.white, fontFamily: FONTS.bold, marginLeft: 10 },
  emailText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginLeft: 10 },
  signOut: { color: COLORS.harvest, fontFamily: FONTS.body, textDecorationLine: 'underline' },
  connectBtn: { borderRadius: 10, backgroundColor: COLORS.canopy, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  connectText: { color: COLORS.white, fontFamily: FONTS.medium },
  input: { height: 42, borderRadius: 9, borderWidth: 1, borderColor: COLORS.canopy, color: COLORS.white, fontFamily: FONTS.body, paddingHorizontal: 10, marginTop: 8 },
  inputLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 10 },
  stateSelect: {
    height: 42,
    marginTop: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.canopy,
    backgroundColor: 'rgba(45, 106, 79, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  stateSelectText: { color: COLORS.white, fontFamily: FONTS.body },
  stateSelectArrow: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  stateDropdownList: {
    marginTop: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.canopy,
    overflow: 'hidden',
    backgroundColor: COLORS.forest,
  },
  stateOption: { paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.canopy },
  stateOptionActive: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  stateOptionText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },
  stateOptionTextActive: { color: COLORS.harvest, fontFamily: FONTS.medium },
  maskedText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 4 },
  saveBtn: { marginTop: 10, backgroundColor: COLORS.harvest, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  saveText: { color: COLORS.night, fontFamily: FONTS.bold },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.canopy },
  notifLabel: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },
  notifDesc: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  langHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  langCurrent: { color: COLORS.white, fontFamily: FONTS.bodyMed },
  changeLink: { color: COLORS.harvest, fontFamily: FONTS.medium },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  langChip: { borderRadius: 16, backgroundColor: COLORS.canopy, paddingHorizontal: 10, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  langChipActive: { backgroundColor: COLORS.harvest },
  langChipText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },
  info: { color: COLORS.muted, fontFamily: FONTS.body, marginBottom: 4 },
  link: { color: COLORS.harvest, fontFamily: FONTS.medium, marginTop: 8 },
});
