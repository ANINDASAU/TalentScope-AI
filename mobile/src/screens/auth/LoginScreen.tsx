import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import SkeletonOverlay from '../../components/SkeletonOverlay';
import { loginUser } from '../../services/api';
import { saveSession } from '../../services/session';

const ATHLETE_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAYMw7I7WKGnzA1eHJuJXNMuJbpjwVgTNFaSBx8L5_Uxg3i4SGZnI3xSCzPs5aJNKPYhEt-jxPUJ22W77z-n3vhqh18AffQZxJI3dvq0Qq_KWGucz0VFcf9dDCZGXwwuMLL2sVjLUo2ItyV6zYZtQUFu7bFap_OsvVzQBTh87yloPEHYuDPeMyWRIYuA2NoACG1EiuQsx7IO12BnOab4cihPYcr_V8ot09H2Ss8A9MQ3C25msfBGfQEZdcZrsl85BAEBEGQ1BQA7Pk';

const GOOGLE_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBvZ6h7Zpz7I6wOeSRUVDVx2e67mIK-Ktvvklb6Qf7l4Xj_Qw7oCQJ6xf2lfxXHWuMLfyWCTDHYWrMk-62ce4exFK9-OYG4VBbmsObBSYbgEkcYl1uhCyKb_0hQawDf8MT66vL2Q159z8A3pb2nZ0Urc_Sl7daZA_JbWVPAuXh5SqM_OfaBACmLF2_I8Rx35Tlu5c8FZrUXJH5YpYiWV-vQfORIRdoFd6IwVG42yh3fqbc3UHDF9skY6Uu2-fRIpStNRrH4j7HD-kg';

export default function LoginScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (authenticating) return;
    setAuthenticating(true);
    setError('');
    try {
      const res = await loginUser({ phone, password });
      if (res?.token) {
        await saveSession(res.token, res.user || res.data || null);
        const role = res?.user?.role || res?.data?.user?.role || 'athlete';
        setTimeout(() => {
          setAuthenticating(false);
          navigation.replace(role === 'coach' ? 'CoachDashboard' : 'MainTabs');
        }, 500);
        return;
      }
      setAuthenticating(false);
      setError('Invalid credentials. Please try again.');
    } catch (e: any) {
      setAuthenticating(false);
      const message = e?.message || 'Unable to reach server. Please try again.';
      setError(message);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? undefined : undefined} style={{ flex: 1 }}>
        <View style={[styles.main, isLg && { flexDirection: 'row' }]}>
          {isLg && (
            <View style={styles.visualPanel}>
              <Image source={{ uri: ATHLETE_IMG }} style={styles.visualImage} />
              <View style={styles.visualGradient} />
              <View style={styles.skeletonWrap} pointerEvents="none">
                <SkeletonOverlay variant="hero" animate />
              </View>
              <View style={styles.brandingBlock}>
                <Text style={styles.brandTitle}>TalentScope AI</Text>
                <Text style={styles.brandBody}>
                  Harness the power of elite performance analytics. Our AI-driven engine decodes athlete biometrics and biomechanics with surgical precision.
                </Text>
                <View style={styles.brandStatsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel}>SUCCESS RATE</Text>
                    <Text style={styles.statValue}>98.4%</Text>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel}>PRO ANALYTICS</Text>
                    <Text style={styles.statValue}>24/7 LIVE</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={[styles.formPanel, isMd && { paddingHorizontal: Spacing.marginDesktop }]}>
            <View style={[styles.formInner, isMd && { maxWidth: 448 }]}>
              <View style={styles.header}>
                {!isLg && <Text style={styles.mobileBrand}>TalentScope AI</Text>}
                <Text style={Typography.headlineLg}>Welcome back</Text>
                <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant }]}>
                  Log in to your performance dashboard
                </Text>
              </View>

              <TouchableOpacity style={styles.googleBtn} activeOpacity={0.85}>
                <Image source={{ uri: GOOGLE_IMG }} style={styles.googleIcon} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </TouchableOpacity>

              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR PHONE</Text>
              </View>

              <View style={{ gap: Spacing.md }}>
                <View>
                  <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 (555) 000-0000"
                    placeholderTextColor="rgba(118,119,125,0.5)"
                    keyboardType="phone-pad"
                    style={styles.input}
                  />
                </View>
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.fieldLabel}>PASSWORD</Text>
                    <TouchableOpacity>
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(118,119,125,0.5)"
                    secureTextEntry
                    style={styles.input}
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.loginBtn, authenticating && { opacity: 0.7 }]}
                activeOpacity={0.9}
                onPress={handleLogin}
                disabled={authenticating}
              >
                <Text style={styles.loginBtnText}>{authenticating ? 'Authenticating...' : 'Log In'}</Text>
              </TouchableOpacity>

              <View style={styles.footerLinks}>
                <Text style={Typography.bodyMd}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                  <Text style={styles.createAccount}>Create Account</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.trustRow}>
                <View style={styles.trustItem}>
                  <Icon name="verified-user" size={24} color={Colors.onSurface} />
                  <Text style={styles.trustLabel}>SOC 2 COMPLIANT</Text>
                </View>
                <View style={styles.trustItem}>
                  <Icon name="enhanced-encryption" size={24} color={Colors.onSurface} />
                  <Text style={styles.trustLabel}>AES-256 ENCRYPTION</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  main: { flex: 1 },
  visualPanel: {
    width: '50%',
    backgroundColor: '#000000',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  visualImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6
  },
  visualGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(25,28,30,0.4)'
  },
  skeletonWrap: { ...StyleSheet.absoluteFillObject, opacity: 0.4 },
  brandingBlock: {
    maxWidth: 576,
    padding: Spacing.xl
  },
  brandTitle: {
    ...Typography.displayHero,
    color: '#ffffff',
    marginBottom: Spacing.md
  },
  brandBody: {
    ...Typography.bodyLg,
    color: 'rgba(255,255,255,0.8)'
  },
  brandStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg
  },
  statLabel: { ...Typography.labelCaps, color: Colors.secondaryContainer },
  statValue: { ...Typography.headlineMd, color: '#ffffff', marginTop: 2 },
  verticalDivider: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.2)' },
  formPanel: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.surface
  },
  formInner: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: Spacing.marginMobile
  },
  header: { marginBottom: Spacing.lg },
  mobileBrand: {
    ...Typography.headlineMd,
    letterSpacing: -0.8,
    color: Colors.primary,
    marginBottom: Spacing.md
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg
  },
  googleIcon: { width: 20, height: 20 },
  googleText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, fontWeight: '600', color: Colors.onSurface },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg
  },
  orLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
  orText: {
    ...Typography.labelCaps,
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    alignSelf: 'center'
  },
  fieldLabel: { ...Typography.labelCaps, color: Colors.onSurfaceVariant, marginBottom: Spacing.xs },
  errorBox: {
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.3)',
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.sm
  },
  errorText: { fontSize: 13, color: Colors.error, fontFamily: 'Inter_500Medium' },
  input: {
    borderBottomWidth: 1,
    borderColor: Colors.outline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.onSurface
  },
  forgotLink: { fontSize: 12, fontFamily: 'Inter_600SemiBold', fontWeight: '600', color: Colors.secondary },
  loginBtn: {
    marginTop: Spacing.base,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.sm + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  loginBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center'
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg
  },
  createAccount: { fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.primary, marginLeft: 4 },
  trustRow: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.3)',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    opacity: 0.4
  },
  trustItem: { alignItems: 'center' },
  trustLabel: { ...Typography.labelCaps, fontSize: 10, marginTop: Spacing.xs }
});
