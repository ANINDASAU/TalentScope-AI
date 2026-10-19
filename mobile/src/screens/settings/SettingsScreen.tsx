import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Switch,
  ScrollView,
  TextInput,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { DesktopSideNav } from '../dashboard/AthleteDashboardScreen';
import { getProfile, updateAthleteProfile } from '../../services/api';
import { clearSession } from '../../services/session';

interface ProfileForm {
  name: string;
  phone: string;
  age: string;
  weight: string;
  height: string;
  primarySport: string;
}

const LANGUAGES = ['English (United States)', 'German (Germany)', 'French (France)', 'Spanish (Spain)'];
const TIMEZONES = ['GMT -5:00 (Eastern Time)', 'GMT +0:00 (London)', 'GMT +1:00 (Berlin)'];

export default function SettingsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const [darkMode, setDarkMode] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [emailReports, setEmailReports] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [aiAlerts, setAiAlerts] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    name: '',
    phone: '',
    age: '',
    weight: '',
    height: '',
    primarySport: ''
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getProfile();
        if (mounted) setProfile(res?.user || res?.data || null);
      } catch {
        if (mounted) setProfile(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fullName = profile?.name ? String(profile.name) : '--';
  const email = profile?.email ? String(profile.email) : '--';
  const phone = profile?.phone ? String(profile.phone) : '--';
  const specialization = profile?.specialization ? String(profile.specialization) : '--';
  const affiliation = profile?.affiliation ? String(profile.affiliation) : '--';
  const plan = profile?.tier ? String(profile.tier) : '--';
  // Subscription renewal is not served by the backend — show the next
  // occurrence of the annual renewal date so the label never goes stale.
  const renewalLabel = (() => {
    const now = new Date();
    let renewal = new Date(now.getFullYear(), 9, 24);
    if (renewal <= now) renewal = new Date(now.getFullYear() + 1, 9, 24);
    return renewal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();
  const ageValue = profile?.age != null ? String(profile.age) : '--';
  const weightValue = profile?.weight != null ? `${profile.weight} kg` : '--';
  const heightValue = profile?.height != null ? `${profile.height} cm` : '--';
  const primarySportValue = profile?.primarySport ? String(profile.primarySport) : '--';
  const avatarUri: string | null = profile?.avatar || null;

  const startEdit = () => {
    setForm({
      name: profile?.name ? String(profile.name) : '',
      phone: profile?.phone ? String(profile.phone) : '',
      age: profile?.age != null ? String(profile.age) : '',
      weight: profile?.weight != null ? String(profile.weight) : '',
      height: profile?.height != null ? String(profile.height) : '',
      primarySport: profile?.primarySport ? String(profile.primarySport) : ''
    });
    setSuccessMsg(null);
    setErrorMsg(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const saveProfile = async () => {
    const payload: Record<string, unknown> = {};
    const name = form.name.trim();
    if (name && name !== fullName) payload.name = name;
    const age = parseInt(form.age, 10);
    if (!Number.isNaN(age) && age !== profile?.age) payload.age = age;
    const weight = parseFloat(form.weight);
    if (!Number.isNaN(weight) && weight !== profile?.weight) payload.weight = weight;
    const height = parseFloat(form.height);
    if (!Number.isNaN(height) && height !== profile?.height) payload.height = height;
    const sport = form.primarySport.trim();
    if (sport && sport !== primarySportValue) payload.primarySport = sport;

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setSuccessMsg('No changes to save');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await updateAthleteProfile(payload);
      const updatedUser = res?.user || res?.data || null;
      if (updatedUser) {
        setProfile(updatedUser);
      } else {
        setProfile((prev: any) => ({ ...prev, ...payload }));
      }
      setEditing(false);
      setSuccessMsg('Profile updated');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await clearSession();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const EDITABLE_KEYS = ['name', 'age', 'weight', 'height', 'primarySport'];
  const NUMERIC_KEYS = ['age', 'weight', 'height'];

  const PROFILE_FIELDS = [
    { key: 'name', label: 'FULL NAME', value: fullName },
    { key: 'email', label: 'EMAIL ADDRESS', value: email },
    { key: 'phone', label: 'PHONE NUMBER', value: phone },
    { key: 'age', label: 'AGE', value: ageValue },
    { key: 'weight', label: 'WEIGHT (KG)', value: weightValue },
    { key: 'height', label: 'HEIGHT (CM)', value: heightValue },
    { key: 'primarySport', label: 'PRIMARY SPORT', value: primarySportValue },
    { key: 'specialization', label: 'SPECIALIZATION', value: specialization },
    { key: 'affiliation', label: 'AFFILIATION', value: affiliation }
  ];

  const renderField = (field: { key: string; label: string; value: string }) => {
    if (!editing || !EDITABLE_KEYS.includes(field.key)) {
      return <ProfileField label={field.label} value={field.value} />;
    }
    const formKey = field.key as keyof ProfileForm;
    return (
      <View>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TextInput
          style={[styles.input, saving && { opacity: 0.6 }]}
          value={form[formKey]}
          onChangeText={(text) => setForm((prev) => ({ ...prev, [formKey]: text }))}
          placeholder={field.value === '--' ? '' : field.value}
          placeholderTextColor={Colors.outline}
          keyboardType={NUMERIC_KEYS.includes(field.key) ? 'numeric' : 'default'}
          editable={!saving}
        />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {isLg && (
        <View style={styles.desktopHeader}>
          <Text style={styles.desktopBrand}>TalentScope AI</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <TouchableOpacity style={styles.desktopBell}>
              <Icon name="notifications" size={22} color={Colors.onSurface} />
            </TouchableOpacity>
            <Avatar uri={avatarUri} size={32} />
          </View>
        </View>
      )}
      {!isLg && (
        <View style={styles.header}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }} onPress={() => navigation.goBack()}>
            <Icon name="notifications" size={22} color={Colors.onSurface} />
            <Avatar uri={avatarUri} size={32} />
          </TouchableOpacity>
        </View>
      )}

      {isLg && <DesktopSideNav navigation={navigation} activeKey="settings" showBack />}

      <ScrollView contentContainerStyle={{ paddingBottom: isLg ? Spacing.xl : 120, marginLeft: isLg ? 256 : 0 }} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.pageHeader,
            isMd && { paddingHorizontal: Spacing.marginDesktop },
            isLg && { paddingTop: 96 }
          ]}
        >
          <Text
            style={[
              isMd ? Typography.headlineLg : Typography.headlineLgMobile,
              { color: Colors.primary, marginBottom: Spacing.xs }
            ]}
          >
            Settings
          </Text>
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant }]}>
            Manage your elite performance profile and account preferences.
          </Text>
        </View>

        <View
          style={[
            { gap: Spacing.gutter },
            isMd ? { paddingHorizontal: Spacing.marginDesktop } : { paddingHorizontal: Spacing.marginMobile },
            isLg ? { alignSelf: 'center', width: '100%', maxWidth: 1024 } : undefined
          ]}
        >
          {/* Profile Settings + Appearance */}
          <View style={isMd ? { flexDirection: 'row', gap: Spacing.gutter } : undefined}>
            <View style={isMd ? { flex: 2 } : undefined}>
              <SettingsCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Icon name="person" size={20} color={Colors.secondary} />
                <Text style={styles.cardTitle}>PROFILE SETTINGS</Text>
              </View>
              {editing ? (
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity onPress={cancelEdit} disabled={saving}>
                    <Text style={[styles.editLink, { color: Colors.onSurfaceVariant }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveProfile} disabled={saving}>
                    <Text style={[styles.editLink, saving && { opacity: 0.5 }]}>
                      {saving ? 'Saving…' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={startEdit}>
                  <Text style={styles.editLink}>Edit Profile</Text>
                </TouchableOpacity>
              )}
            </View>
            {!editing && successMsg && (
              <View style={styles.feedbackRow}>
                <Icon name="check-circle" size={16} color={Colors.onTertiaryContainer} />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            )}
            {editing && errorMsg && (
              <View style={styles.feedbackRow}>
                <Icon name="error-outline" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: Spacing.lg, flexWrap: 'wrap' }}>
              <View>
                <View style={styles.profilePhotoRing}>
                  <Avatar uri={avatarUri} size={88} />
                  <View style={styles.cameraBtn}>
                    <Icon name="photo-camera" size={13} color="#ffffff" />
                  </View>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: isMd ? 0 : '60%', gap: isMd ? Spacing.md : Spacing.md }}>
                {isMd ? (
                  <>
                    {[0, 2, 4, 6].map(start => (
                      <View key={start} style={{ flexDirection: 'row', gap: Spacing.md }}>
                        <View style={{ flex: 1 }}>{renderField(PROFILE_FIELDS[start])}</View>
                        <View style={{ flex: 1 }}>
                          {PROFILE_FIELDS[start + 1] ? renderField(PROFILE_FIELDS[start + 1]) : null}
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  PROFILE_FIELDS.map(f => <React.Fragment key={f.label}>{renderField(f)}</React.Fragment>)
                )}
              </View>
            </View>
            </SettingsCard>
            </View>

            <View style={isMd ? { flex: 1 } : undefined}>
            {/* Appearance */}
            <SettingsCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Icon name="palette" size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>APPEARANCE</Text>
            </View>
            <ToggleRow
              icon="dark-mode"
              title="Dark Mode"
              subtitle="Reduce eye strain at night"
              value={darkMode}
              onChange={setDarkMode}
              divider
            />
            <ToggleRow
              icon="view-comfy"
              title="Compact View"
              subtitle="Maximize data density"
              value={compactView}
              onChange={setCompactView}
            />
            </SettingsCard>
            </View>
          </View>

          {/* Notifications + Subscription */}
          <View style={isMd ? { flexDirection: 'row', gap: Spacing.gutter } : undefined}>
            <View style={isMd ? { flex: 1 } : undefined}>
            {/* Notifications */}
            <SettingsCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Icon name="notifications-active" size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>NOTIFICATIONS</Text>
            </View>
            <CheckRow icon="mail" label="Email Reports" checked={emailReports} onToggle={() => setEmailReports(v => !v)} divider />
            <CheckRow icon="vibration" label="Push Alerts" checked={pushAlerts} onToggle={() => setPushAlerts(v => !v)} divider />
            <CheckRow icon="query-stats" label="AI Insight Alerts" checked={aiAlerts} onToggle={() => setAiAlerts(v => !v)} />
            </SettingsCard>
            </View>

            <View style={isMd ? { flex: 1 } : undefined}>
            {/* Subscription */}
            <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionBlob} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <Icon name="workspace-premium" size={20} color={Colors.secondaryFixed} />
              <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.onPrimaryContainer }]}>SUBSCRIPTION</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={styles.subscriptionTitle}>{plan}</Text>
                <Text style={[Typography.bodyMd, { color: Colors.onPrimaryContainer }]}>Renewal: {renewalLabel}</Text>
              </View>
              <TouchableOpacity style={styles.managePlanBtn} activeOpacity={0.85}>
                <Text style={styles.managePlanText}>Manage Plan</Text>
              </TouchableOpacity>
            </View>
            </View>
            </View>
          </View>

          {/* Privacy Controls + Language & Region */}
          <View style={isMd ? { flexDirection: 'row', gap: Spacing.gutter } : undefined}>
            <View style={isMd ? { flex: 7 } : undefined}>
            {/* Privacy Controls */}
            <SettingsCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Icon name="security" size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>PRIVACY CONTROLS</Text>
            </View>
            <LinkRow
              icon="privacy-tip"
              title="Data Sharing"
              subtitle="Control how AI models use your training data."
              trailing={<Icon name="chevron-right" size={22} color={Colors.outline} />}
              divider
            />
            <LinkRow
              icon="fingerprint"
              title="Two-Factor Authentication"
              subtitle="Enabled via Authenticator App"
              trailing={<Icon name="check-circle" size={22} color={Colors.onTertiaryContainer} />}
            />
            </SettingsCard>
            </View>

            <View style={isMd ? { flex: 5 } : undefined}>
            {/* Language & Region */}
            <SettingsCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Icon name="language" size={20} color={Colors.secondary} />
              <Text style={styles.cardTitle}>LANGUAGE & REGION</Text>
            </View>
            <View style={{ gap: Spacing.md }}>
              <View>
                <Text style={styles.selectLabel}>PREFERRED LANGUAGE</Text>
                <TouchableOpacity
                  style={styles.selectBox}
                  onPress={() =>
                    setLanguage(LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length])
                  }
                >
                  <Text style={styles.selectValue}>{language}</Text>
                  <Icon name="expand-more" size={18} color={Colors.outline} />
                </TouchableOpacity>
              </View>
              <View>
                <Text style={styles.selectLabel}>TIMEZONE</Text>
                <TouchableOpacity
                  style={styles.selectBox}
                  onPress={() =>
                    setTimezone(TIMEZONES[(TIMEZONES.indexOf(timezone) + 1) % TIMEZONES.length])
                  }
                >
                  <Text style={styles.selectValue}>{timezone}</Text>
                  <Icon name="expand-more" size={18} color={Colors.outline} />
                </TouchableOpacity>
              </View>
            </View>
            </SettingsCard>
            </View>
          </View>

          {/* Danger Zone */}
          <View style={styles.dangerZone}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <Icon name="dangerous" size={20} color={Colors.error} />
              <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.error }]}>DANGER ZONE</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md }}>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={[styles.dangerTitle, isMd && { textAlign: 'left' }]}>Deactivate Account</Text>
                <Text style={[styles.dangerBody, isMd && { textAlign: 'left' }]}>
                  Temporarily disable your profile and assessments. This can be undone.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity style={styles.deactivateBtn} activeOpacity={0.85}>
                  <Text style={styles.deactivateText}>Deactivate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.85}>
                  <Text style={styles.deleteText}>Delete Account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.85} onPress={handleLogout}>
            <Icon name="logout" size={20} color={Colors.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.card}>{children}</View>
  );
}

function Avatar({ uri, size }: { uri: string | null; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Colors.surfaceContainerHigh,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Icon name="person" size={Math.round(size * 0.55)} color={Colors.onSurfaceVariant} />
    </View>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldValueBox}>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  divider
}: {
  icon: keyof typeof Icon.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  divider?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, divider && styles.rowDivider]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.surfaceVariant, true: Colors.secondary }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

function CheckRow({
  icon,
  label,
  checked,
  onToggle,
  divider
}: {
  icon: keyof typeof Icon.glyphMap;
  label: string;
  checked: boolean;
  onToggle: () => void;
  divider?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.checkRow, divider && styles.rowDivider]} onPress={onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 }}>
        <Icon name={icon} size={19} color={Colors.onSurfaceVariant} />
        <Text style={Typography.bodyMd}>{label}</Text>
      </View>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Icon name="check" size={14} color={Colors.onSecondaryContainer} />}
      </View>
    </TouchableOpacity>
  );
}

function LinkRow({
  icon,
  title,
  subtitle,
  trailing,
  divider
}: {
  icon: keyof typeof Icon.glyphMap;
  title: string;
  subtitle: string;
  trailing: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <View style={[styles.linkRow, divider && styles.rowDivider]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 }}>
        <Icon name={icon} size={19} color={Colors.onSurfaceVariant} />
        <View>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  desktopHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    paddingHorizontal: Spacing.marginDesktop,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)',
    zIndex: 50
  },
  desktopBrand: { ...Typography.headlineMd, letterSpacing: -1.2, color: Colors.primary },
  desktopBell: { padding: Spacing.base, borderRadius: 999 },
  header: {
    paddingTop: 44,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.marginMobile,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  pageHeader: { paddingHorizontal: Spacing.marginMobile, paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.25)',
    borderRadius: 12,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  cardTitle: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant },
  editLink: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.secondary },
  profilePhotoRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: Colors.secondaryContainer,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cameraBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 5,
    borderWidth: 2,
    borderColor: '#ffffff'
  },
  fieldLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.outline, marginBottom: Spacing.xs },
  fieldValueBox: { borderBottomWidth: 1, borderBottomColor: 'rgba(198,198,205,0.35)', paddingBottom: Spacing.xs },
  fieldValue: { ...Typography.bodyMd },
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 4,
    ...Typography.bodyMd,
    fontSize: 14
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm
  },
  successText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', fontWeight: '600', color: Colors.onTertiaryContainer },
  errorText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', fontWeight: '600', color: Colors.error },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(198,198,205,0.18)' },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm + 2 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkboxChecked: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.secondary },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.base },
  subscriptionCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.primaryContainer,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.25)',
    borderRadius: 12,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5
  },
  subscriptionBlob: {
    position: 'absolute',
    top: -64,
    right: -64,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.secondary,
    opacity: 0.1
  },
  subscriptionTitle: { ...Typography.headlineMd, fontSize: 19, lineHeight: 25, color: '#ffffff', marginBottom: 4 },
  managePlanBtn: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 8
  },
  managePlanText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, fontWeight: '600', color: '#ffffff' },
  selectLabel: { ...Typography.labelCaps, fontSize: 10, color: Colors.outline, marginBottom: Spacing.xs },
  selectBox: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 4
  },
  selectValue: { ...Typography.bodyMd, fontSize: 14 },
  dangerZone: {
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.2)',
    backgroundColor: 'rgba(255,218,214,0.12)',
    borderRadius: 12,
    padding: Spacing.md
  },
  deactivateBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: 8
  },
  deactivateText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  deleteBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    backgroundColor: Colors.error,
    borderRadius: 8
  },
  deleteText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, fontWeight: '600', color: '#ffffff' },
  dangerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.error, textAlign: 'center' },
  dangerBody: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.35)',
    backgroundColor: 'rgba(186,26,26,0.06)',
    borderRadius: 8,
    paddingVertical: Spacing.base
  },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.error }
});
