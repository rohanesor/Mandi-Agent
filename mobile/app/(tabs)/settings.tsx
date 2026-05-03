import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
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

const ALL_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

type OAuthProvider = 'google';

type OAuthUser = {
  provider: OAuthProvider;
  name: string;
  email: string;
  photo: string | null;
};

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

type ProfileState = {
  farmerName: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  landholding: string;
  fpoName: string;
};

const defaultProfile: ProfileState = {
  farmerName: '',
  phone: '',
  village: '',
  district: '',
  state: 'Karnataka',
  landholding: '',
  fpoName: '',
};

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[styles.cardContainer]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={[styles.card, style]}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function SettingsScreen() {
  const { t, code, setCode } = useT();
  const [oauthUsers, setOAuthUsers] = useState<OAuthUser[]>([]);
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [showLanguageGrid, setShowLanguageGrid] = useState(false);
  const [notifications, setNotifications] = useState<NotificationState>(defaultNotifications);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GOOGLE_USER_KEY).then((raw) => {
      if (raw) {
        const user = JSON.parse(raw);
        setOAuthUsers([{ provider: 'google', ...user }]);
      }
    });
    AsyncStorage.getItem(NOTIF_KEY).then((raw) => raw && setNotifications(JSON.parse(raw)));
    AsyncStorage.getItem(PROFILE_KEY).then((raw) => raw && setProfile({ ...defaultProfile, ...JSON.parse(raw) }));
  }, []);

  const currentLangLabel = useMemo(
    () => LANGUAGES.find((l) => l.code === code)?.nativeName || '',
    [code],
  );

  const setNotif = (key: keyof NotificationState, value: boolean) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    setHasChanges(true);
  };

  const updateProfile = (field: keyof ProfileState, value: string) => {
    setProfile((p) => ({ ...p, [field]: value }));
    setHasChanges(true);
  };

  const saveAll = async () => {
    setSaving(true);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
    setSaving(false);
    setHasChanges(false);
    Alert.alert('', t('changesSaved'));
  };

  const connectOAuth = async (provider: OAuthProvider) => {
    setConnecting(provider);
    await new Promise((r) => setTimeout(r, 1500));
    const user: OAuthUser = {
      provider,
      name: 'Raju Naik',
      email: 'raju.naik@gmail.com',
      photo: null,
    };
    const next = [...oauthUsers, user];
    setOAuthUsers(next);
    await AsyncStorage.setItem(GOOGLE_USER_KEY, JSON.stringify({ name: user.name, email: user.email, photo: user.photo }));
    setConnecting(null);
  };

  const disconnectOAuth = async (provider: OAuthProvider) => {
    const next = oauthUsers.filter((u) => u.provider !== provider);
    setOAuthUsers(next);
    await AsyncStorage.removeItem(GOOGLE_USER_KEY);
  };

  const providerIcon = (provider: OAuthProvider) => {
    return 'G';
  };

  const providerColor = (provider: OAuthProvider) => {
    return '#EA4335';
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>{t('settingsTitle')}</Text>

        {/* ACCOUNT CARD */}
        <Card title={t('account').toUpperCase()}>
          {/* Connected Accounts */}
          <Text style={styles.subLabel}>{t('connectedAccounts')}</Text>
          {oauthUsers.map((user) => (
            <View key={user.provider} style={styles.oauthRow}>
              <View style={[styles.oauthIcon, { backgroundColor: providerColor(user.provider) }]}>
                <Text style={styles.oauthIconText}>
                  {providerIcon(user.provider)}
                </Text>
              </View>
              <View style={styles.oauthInfo}>
                <Text style={styles.oauthName}>{user.name}</Text>
                <Text style={styles.oauthEmail}>{user.email}</Text>
              </View>
              <TouchableOpacity onPress={() => disconnectOAuth(user.provider)}>
                <Text style={styles.disconnectText}>{t('disconnect')}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add Account button for future OAuth providers */}
          {oauthUsers.length === 0 && (
            <View style={styles.addAccountSection}>
              <Text style={styles.addAccountLabel}>{t('addAccount')}</Text>
              <TouchableOpacity
                style={[styles.addAccountBtn, { borderColor: '#EA4335' }]}
                onPress={() => connectOAuth('google')}
                disabled={connecting !== null}
              >
                {connecting === 'google' ? (
                  <ActivityIndicator size="small" color="#EA4335" />
                ) : (
                  <>
                    <View style={[styles.addAccountIcon, { backgroundColor: '#EA4335' }]}>
                      <Text style={styles.addAccountIconText}>G</Text>
                    </View>
                    <Text style={styles.addAccountBtnText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <Divider />

          {/* Personal Details */}
          <TextInput
            style={styles.input}
            value={profile.farmerName}
            onChangeText={(v) => updateProfile('farmerName', v)}
            placeholder={t('farmerName')}
            placeholderTextColor={COLORS.muted}
          />
          <TextInput
            style={styles.input}
            value={profile.phone}
            onChangeText={(v) => updateProfile('phone', v)}
            placeholder={t('phoneNumber')}
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
          />
          {profile.phone.length >= 4 && (
            <Text style={styles.maskedText}>{'*'.repeat(profile.phone.length - 4) + profile.phone.slice(-4)}</Text>
          )}
        </Card>

        {/* FARM DETAILS CARD */}
        <Card title={t('farmDetails').toUpperCase()}>
          <TextInput
            style={styles.input}
            value={profile.village}
            onChangeText={(v) => updateProfile('village', v)}
            placeholder={t('village')}
            placeholderTextColor={COLORS.muted}
          />
          <TextInput
            style={styles.input}
            value={profile.district}
            onChangeText={(v) => updateProfile('district', v)}
            placeholder={t('district')}
            placeholderTextColor={COLORS.muted}
          />

          {/* State Dropdown */}
          <Text style={styles.inputLabel}>{t('selectState')}</Text>
          <TouchableOpacity style={styles.stateSelect} onPress={() => setStateDropdownOpen((s) => !s)}>
            <Text style={[styles.stateSelectText, profile.state ? { color: COLORS.white } : { color: COLORS.muted }]}>
              {profile.state || t('selectState')}
            </Text>
            <Text style={styles.stateSelectArrow}>{stateDropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {stateDropdownOpen && (
            <View style={styles.stateDropdownList}>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 180 }}>
                {ALL_STATES.map((stateOption) => {
                  const active = profile.state === stateOption;
                  return (
                    <TouchableOpacity
                      key={stateOption}
                      style={[styles.stateOption, active && styles.stateOptionActive]}
                      onPress={() => {
                        updateProfile('state', stateOption);
                        setStateDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.stateOptionText, active && styles.stateOptionTextActive]}>
                        {stateOption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <TextInput
            style={styles.input}
            value={profile.landholding}
            onChangeText={(v) => updateProfile('landholding', v)}
            placeholder={t('landholding')}
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            value={profile.fpoName}
            onChangeText={(v) => updateProfile('fpoName', v)}
            placeholder={t('fpoName')}
            placeholderTextColor={COLORS.muted}
          />
        </Card>

        {/* NOTIFICATIONS CARD */}
        <Card title={t('notifications').toUpperCase()}>
          <NotifRow
            label={t('morningHarvest')}
            desc={t('morningHarvestDesc')}
            value={notifications.morningHarvest}
            onValueChange={(v) => setNotif('morningHarvest', v)}
          />
          <NotifRow
            label={t('priceAlert')}
            desc={t('priceAlertDesc')}
            value={notifications.priceAlert}
            onValueChange={(v) => setNotif('priceAlert', v)}
          />
          <NotifRow
            label={t('bundleAlert')}
            desc={t('bundleAlertDesc')}
            value={notifications.bundleAlert}
            onValueChange={(v) => setNotif('bundleAlert', v)}
          />
          <NotifRow
            label={t('spoilageWarning')}
            desc={t('spoilageWarningDesc')}
            value={notifications.spoilageWarning}
            onValueChange={(v) => setNotif('spoilageWarning', v)}
          />
          <NotifRow
            label={t('weeklyDigest')}
            desc={t('weeklyDigestDesc')}
            value={notifications.weeklyDigest}
            onValueChange={(v) => setNotif('weeklyDigest', v)}
          />
        </Card>

        {/* LANGUAGE CARD */}
        <Card title={t('language').toUpperCase()}>
          <View style={styles.langHeaderRow}>
            <View style={styles.langCurrentRow}>
              <Text style={styles.langLabel}>{t('currentLanguage')}</Text>
              <Text style={styles.langValue}>{currentLangLabel}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowLanguageGrid((s) => !s)}>
              <Text style={styles.changeLink}>{showLanguageGrid ? '▲' : t('changeLanguage')}</Text>
            </TouchableOpacity>
          </View>
          {showLanguageGrid && (
            <View style={styles.langGrid}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langChip, code === lang.code && styles.langChipActive]}
                  onPress={() => {
                    setCode(lang.code);
                    setHasChanges(true);
                  }}
                >
                  <Text style={[styles.langChipText, code === lang.code && { color: COLORS.night }]}>
                    {lang.nativeName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>

        {/* SUPPORT & INFO CARD */}
        <Card title={t('supportInfo').toUpperCase()}>
          <View style={styles.versionRow}>
            <Text style={styles.infoLabel}>{t('appVersion')}</Text>
            <Text style={styles.infoValue}>1.0.0 (Beta)</Text>
          </View>
          <Text style={styles.moreOptions}>{t('moreOptions')}</Text>

          <Divider />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://mandiagent.in/privacy')}
          >
            <Text style={styles.linkText}>{t('privacyPolicy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://mandiagent.in/terms')}
          >
            <Text style={styles.linkText}>{t('termsOfService')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('mailto:help@mandiagent.in')}
          >
            <Text style={styles.linkText}>{t('helpSupport')}</Text>
          </TouchableOpacity>
        </Card>

        {/* Bottom spacer for floating button */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FLOATING SAVE BUTTON */}
      {hasChanges && (
        <View style={styles.floatingSaveContainer}>
          <TouchableOpacity
            style={styles.floatingSaveBtn}
            onPress={saveAll}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.night} />
            ) : (
              <Text style={styles.floatingSaveText}>{t('saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
      <View style={styles.notifText}>
        <Text style={styles.notifLabel}>{label}</Text>
        <Text style={styles.notifDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#374151', true: COLORS.harvest }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.night },
  content: { padding: 16, paddingBottom: 16 },
  pageTitle: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 26, marginBottom: 16 },

  // Card
  cardContainer: { marginBottom: 16 },
  cardTitle: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 11, letterSpacing: 1.2, marginBottom: 6 },
  card: { backgroundColor: COLORS.forest, borderRadius: 14, padding: 14 },

  // Divider
  divider: { height: 1, backgroundColor: COLORS.canopy, marginVertical: 12 },

  // OAuth
  oauthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  oauthIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  oauthIconText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 },
  oauthInfo: { flex: 1, marginLeft: 10 },
  oauthName: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },
  oauthEmail: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  disconnectText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 12, textDecorationLine: 'underline' },

  // Add Account
  addAccountSection: { marginTop: 6 },
  addAccountLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginBottom: 8 },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderColor: COLORS.canopy,
  },
  addAccountIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  addAccountIconText: { color: '#FFF', fontFamily: FONTS.bold, fontSize: 12 },
  addAccountBtnText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },

  // Inputs
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.canopy,
    color: COLORS.white,
    fontFamily: FONTS.body,
    paddingHorizontal: 12,
    marginTop: 8,
    fontSize: 14,
  },
  inputLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 12, marginBottom: 0 },
  maskedText: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, marginTop: 4 },

  // State Dropdown
  stateSelect: {
    height: 44,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.canopy,
    backgroundColor: 'rgba(45, 106, 79, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  stateSelectText: { fontFamily: FONTS.body, fontSize: 14 },
  stateSelectArrow: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  stateDropdownList: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.canopy,
    overflow: 'hidden',
    backgroundColor: COLORS.forest,
    maxHeight: 180,
  },
  stateOption: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(45, 106, 79, 0.5)' },
  stateOptionActive: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  stateOptionText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 13 },
  stateOptionTextActive: { color: COLORS.harvest, fontFamily: FONTS.medium },

  // Sub-label
  subLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginBottom: 8 },

  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(45, 106, 79, 0.5)' },
  notifText: { flex: 1, paddingRight: 10 },
  notifLabel: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 13 },
  notifDesc: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },

  // Language
  langHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  langCurrentRow: { flex: 1 },
  langLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  langValue: { color: COLORS.white, fontFamily: FONTS.bodyMed, fontSize: 15, marginTop: 2 },
  changeLink: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 13 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  langChip: { borderRadius: 16, backgroundColor: COLORS.canopy, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  langChipActive: { backgroundColor: COLORS.harvest },
  langChipText: { color: COLORS.white, fontFamily: FONTS.body, fontSize: 12 },

  // Support
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  infoLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  infoValue: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 12 },
  moreOptions: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic' },
  linkRow: { paddingVertical: 8 },
  linkText: { color: COLORS.harvest, fontFamily: FONTS.medium, fontSize: 13 },

  // Floating Save Button
  floatingSaveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(6, 78, 59, 0.95)',
    borderTopWidth: 1,
    borderTopColor: COLORS.canopy,
  },
  floatingSaveBtn: {
    backgroundColor: COLORS.harvest,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  floatingSaveText: { color: COLORS.night, fontFamily: FONTS.bold, fontSize: 15 },
});
