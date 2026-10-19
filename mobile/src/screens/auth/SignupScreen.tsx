import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { registerAthlete } from '../../services/api';
import { saveSession } from '../../services/session';

const GENDERS = ['Select Gender', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];

export default function SignupScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: 672 };
  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    weight: '',
    height: '',
    sports: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [genderIndex, setGenderIndex] = useState(0);
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef<Array<TextInput | null>>([]);
  const [secondsLeft, setSecondsLeft] = useState(119);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const formatTimer = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < otp.length - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpBackspace = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await registerAthlete({
        name: form.name,
        phone: form.phone,
        password: form.password,
        age: form.age ? Number(form.age) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined,
        primarySport: form.sports,
        preferredSports: form.sports ? [form.sports] : undefined
      });
      if (res?.token) {
        await saveSession(res.token, res.user || res.data || null);
      }
      setTimeout(() => {
        setSubmitting(false);
        navigation.replace('MainTabs');
      }, 500);
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message || 'Registration failed. Please try again.');
    }
  };

  const setField = (key: keyof typeof form) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: padH }, isLg && { justifyContent: 'flex-start' }]}>
        <Text style={styles.brand}>TalentScope AI</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: padH }, container, isMd && { paddingVertical: Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, isMd && Typography.headlineLg]}>Create your elite profile.</Text>
        <Text style={[Typography.bodyLg, { color: Colors.onSurfaceVariant }]}>
          Join the next generation of athletic intelligence. Complete your profile to begin your transformation.
        </Text>

        {/* Section 01 */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>01 PERSONAL INFORMATION</Text>
          <View style={styles.sectionRule} />
        </View>
        <View style={{ gap: Spacing.md }}>
          <Field label="FULL NAME">
            <TextInput
              value={form.name}
              onChangeText={setField('name')}
              placeholder="Enter your full name"
              placeholderTextColor="rgba(118,119,125,0.5)"
              style={styles.input}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="AGE">
                <TextInput
                  value={form.age}
                  onChangeText={setField('age')}
                  placeholder="24"
                  placeholderTextColor="rgba(118,119,125,0.5)"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="GENDER">
                <TouchableOpacity style={styles.selectBtn} onPress={() => setShowGenderSheet(true)}>
                  <Text style={[styles.selectText, genderIndex === 0 && { color: 'rgba(118,119,125,0.5)' }]}>
                    {GENDERS[genderIndex]}
                  </Text>
                  <Icon name="expand-more" size={20} color={Colors.outline} />
                </TouchableOpacity>
              </Field>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="WEIGHT (KG)">
                <TextInput
                  value={form.weight}
                  onChangeText={setField('weight')}
                  placeholder="75"
                  placeholderTextColor="rgba(118,119,125,0.5)"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="HEIGHT (CM)">
                <TextInput
                  value={form.height}
                  onChangeText={setField('height')}
                  placeholder="185"
                  placeholderTextColor="rgba(118,119,125,0.5)"
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
          </View>
          <Field label="PREFERRED SPORTS">
            <TextInput
              value={form.sports}
              onChangeText={setField('sports')}
              placeholder="e.g. High Jump, Long Jump, Sprinting"
              placeholderTextColor="rgba(118,119,125,0.5)"
              style={styles.input}
            />
          </Field>
          <Field label="CONTACT NUMBER">
            <TextInput
              value={form.phone}
              onChangeText={setField('phone')}
              placeholder="+1 (555) 000-0000"
              placeholderTextColor="rgba(118,119,125,0.5)"
              keyboardType="phone-pad"
              style={styles.input}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="PASSWORD">
                <TextInput
                  value={form.password}
                  onChangeText={setField('password')}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(118,119,125,0.5)"
                  secureTextEntry
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="CONFIRM PASSWORD">
                <TextInput
                  value={form.confirmPassword}
                  onChangeText={setField('confirmPassword')}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(118,119,125,0.5)"
                  secureTextEntry
                  style={styles.input}
                />
              </Field>
            </View>
          </View>
        </View>

        {/* Section 02 */}
        <View style={[styles.sectionHeadingRow, { marginTop: Spacing.xl }]}>
          <Text style={styles.sectionHeading}>02 VERIFICATION & ACCESS</Text>
          <View style={styles.sectionRule} />
        </View>
        <Text style={styles.otpLabel}>SMS VERIFICATION CODE</Text>
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={ref => {
                otpRefs.current[i] = ref;
              }}
              value={digit}
              onChangeText={t => handleOtpChange(t, i)}
              onKeyPress={({ nativeEvent }) => handleOtpBackspace(nativeEvent.key, i)}
              maxLength={1}
              keyboardType="number-pad"
              style={styles.otpInput}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm }}>
          <Text style={styles.timerText}>CODE EXPIRES IN {formatTimer}</Text>
          <TouchableOpacity onPress={() => setSecondsLeft(119)}>
            <Text style={styles.resendText}> RESEND</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: Spacing.md, gap: Spacing.md }}>
          <CheckboxRow checked={acceptTerms} onToggle={() => setAcceptTerms(v => !v)}>
            <Text style={styles.checkboxText}>
              I accept the <Text style={styles.linkText}>Terms and Conditions</Text> and{' '}
              <Text style={styles.linkText}>Privacy Policy</Text>.
            </Text>
          </CheckboxRow>
          <CheckboxRow checked={marketing} onToggle={() => setMarketing(v => !v)}>
            <Text style={styles.checkboxText}>
              Receive elite performance insights, industry updates, and marketing offers.
            </Text>
          </CheckboxRow>
        </View>

        {/* Submit */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          activeOpacity={0.9}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>
            {submitting ? 'CREATING PROFILE...' : 'CREATE ACCOUNT & VERIFY'}
          </Text>
          {!submitting && <Icon name="check-circle" size={18} color="#ffffff" />}
        </TouchableOpacity>
        <Text style={styles.copyright}>TALENTSCOPE AI © 2024 • ELITE PERFORMANCE ANALYTICS</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant }]}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showGenderSheet && (
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowGenderSheet(false)} />
          <View style={styles.sheetPanel}>
            {GENDERS.slice(1).map(g => (
              <TouchableOpacity
                key={g}
                style={styles.sheetOption}
                onPress={() => {
                  setGenderIndex(GENDERS.indexOf(g));
                  setShowGenderSheet(false);
                }}
              >
                <Text style={Typography.bodyMd}>{g}</Text>
                {GENDERS[genderIndex] === g && <Icon name="check" size={20} color={Colors.secondary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.xs }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function CheckboxRow({
  checked,
  onToggle,
  children
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={onToggle} activeOpacity={0.8}>
      <View style={[styles.checkboxBox, checked && styles.checkboxChecked]}>
        {checked && <Icon name="check" size={16} color="#ffffff" />}
      </View>
      <Text style={styles.checkboxText}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  header: {
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: Spacing.marginMobile,
    backgroundColor: 'rgba(247,249,251,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  brand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary },
  scroll: {
    paddingHorizontal: Spacing.marginMobile,
    paddingVertical: Spacing.lg
  },
  pageTitle: {
    ...Typography.headlineLgMobile,
    color: Colors.primary,
    marginBottom: Spacing.xs
  },
  sectionHeadingRow: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md
  },
  sectionHeading: {
    ...Typography.labelCaps,
    color: Colors.secondary,
    letterSpacing: 2.4,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.3)'
  },
  sectionRule: {},
  fieldLabel: {
    ...Typography.labelCaps,
    fontSize: 11,
    color: Colors.onSurfaceVariant
  },
  input: {
    borderBottomWidth: 2,
    borderColor: Colors.outlineVariant,
    paddingVertical: Spacing.base,
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
    color: Colors.onSurface,
    backgroundColor: Colors.surface
  },
  selectBtn: {
    borderBottomWidth: 2,
    borderColor: Colors.outlineVariant,
    paddingVertical: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selectText: { fontSize: 17, fontFamily: 'Inter_400Regular', color: Colors.onSurface },
  otpLabel: {
    ...Typography.labelCaps,
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.sm
  },
  otpInput: {
    width: 48,
    height: 64,
    textAlign: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 2,
    borderColor: Colors.outlineVariant,
    fontFamily: 'Geist_600SemiBold',
    fontSize: 24,
    fontWeight: '600',
    color: Colors.onSurface
  },
  timerText: { ...Typography.monoData, fontSize: 10, color: Colors.onSurfaceVariant },
  resendText: { ...Typography.labelCaps, fontSize: 10, color: Colors.secondary },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxText: {
    ...Typography.bodyMd,
    flex: 1
  },
  linkText: { color: Colors.secondary, textDecorationLine: 'underline' },
  submitBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm
  },
  submitText: { ...Typography.labelCaps, color: Colors.onPrimary },
  copyright: {
    ...Typography.labelCaps,
    color: Colors.onSurfaceVariant,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: Spacing.md
  },
  loginLink: { fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.secondary },
  errorBox: {
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.3)',
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.md
  },
  errorText: { fontSize: 13, color: Colors.error, fontFamily: 'Inter_500Medium' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end'
  },
  sheetPanel: {
    backgroundColor: Colors.surfaceBright,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: Spacing.sm
  },
  sheetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14
  }
});
