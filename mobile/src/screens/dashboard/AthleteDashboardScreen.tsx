import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import CircularScoreGauge from '../../components/CircularScoreGauge';
import MetricTrendChart from '../../components/MetricTrendChart';
import BiometricProgressBar from '../../components/BiometricProgressBar';
import AIChatBotModal from '../../components/AIChatBotModal';
import { getProfile, getAthleteDashboard } from '../../services/api';
import { getQueuedAssessments } from '../../services/assessmentQueue';
import { subscribeSyncEvents } from '../../services/syncEngine';
import { useNetworkStatus } from '../../hooks/useConnectivity';

const MOVEMENT_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDrGzMiabVvpP93GB2fjxSCkmA4n5hVR5IdKMu4KEa5ZIQW-ZT6qb2uHiLYolSU2ybUE90OX6oD0VKF-2SFb6XZ-ZTDDM41wAQ0sTncz-Gc0A2b0mNAziLUj5EuK3lqIfKucK8snFbu1KJKNlfQY3HtozJLTUFyfSJAckHD6aG9DQdo_hOBGYQzAHeMuHcy-D86m8U_i4I6Oa5it-3RrRd2ZWrP7i0or7NzgVNNcNF7nhyzjuW51rStMIcuEAcAX39UwOVZVbUqNxg';

const WEEKLY_BARS = [
  { day: 'MON', pct: 40, active: false },
  { day: 'TUE', pct: 65, active: false },
  { day: 'WED', pct: 90, active: false },
  { day: 'THU', pct: 55, active: false },
  { day: 'FRI', pct: 80, active: true },
  { day: 'SAT', pct: 30, active: false },
  { day: 'SUN', pct: 20, active: false }
];

const BENCHMARKS = [
  { label: 'EXPLOSIVE POWER', value: 'P92', percent: 92, color: Colors.secondary, shadow: true },
  { label: 'REACTIVE STRENGTH', value: 'P78', percent: 78, color: Colors.onTertiaryContainer, shadow: false },
  { label: 'LATERAL AGILITY', value: 'P64', percent: 64, color: Colors.error, shadow: false }
];

const TREND_RANGES = ['1M', '3M', '6M'];

export default function AthleteDashboardScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const [range, setRange] = useState('1M');
  const [profile, setProfile] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const networkStatus = useNetworkStatus();
  const offline = networkStatus === 'offline';
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [profileRes, dashRes] = await Promise.allSettled([getProfile(), getAthleteDashboard()]);
    let failed = true;
    if (profileRes.status === 'fulfilled') {
      setProfile(profileRes.value.user || profileRes.value.data || null);
      failed = false;
    }
    if (dashRes.status === 'fulfilled') {
      setDashboard(dashRes.value.data || dashRes.value || null);
      failed = false;
    }
    setError(failed);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Offline / sync status tracking
  const refreshPendingSync = useCallback(() => {
    getQueuedAssessments()
      .then(q => setPendingSyncCount(q.filter(x => x.syncStatus !== 'completed').length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingSync();
    const unsub = subscribeSyncEvents(() => refreshPendingSync());
    const iv = setInterval(refreshPendingSync, 10000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [refreshPendingSync]);

  const avatarUri: string | null = profile?.avatar || dashboard?.athlete?.avatar || null;

  const userName = profile?.name
    ? String(profile.name)
        .split(' ')
        .slice(0, 1)
        .map((s: string) => s.toUpperCase())[0] + '.'
    : 'ATHLETE';

  const tierLabel = profile?.tier || dashboard?.athlete?.tier || 'NEW';

  const latestAssessment = dashboard?.latestAssessment ?? null;
  const score = typeof latestAssessment?.overallScore === 'number' ? latestAssessment.overallScore : null;
  const percentileRank = latestAssessment?.percentileRank ?? null;
  // percentileRank may be a number (91) or a preformatted string ("Top 5%"):
  // numbers get a real ordinal suffix, strings render verbatim.
  const ordinalSuffix = (n: number): string => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'TH';
    switch (n % 10) {
      case 1: return 'ST';
      case 2: return 'ND';
      case 3: return 'RD';
      default: return 'TH';
    }
  };
  const percentileLabel =
    typeof percentileRank === 'number'
      ? `${percentileRank}${ordinalSuffix(percentileRank)} PERCENTILE`
      : percentileRank != null && String(percentileRank).trim() !== ''
        ? `${String(percentileRank)} PERCENTILE`
        : null;
  const injuryLevel = latestAssessment?.injuryRisk?.level ?? profile?.currentInjuryRiskLevel ?? null;
  const injuryPct =
    typeof latestAssessment?.injuryRisk?.percentage === 'number'
      ? latestAssessment.injuryRisk.percentage
      : typeof profile?.currentInjuryRiskPercentage === 'number'
        ? profile.currentInjuryRiskPercentage
        : null;
  const rankNum = typeof profile?.regionalRank === 'number' ? profile.regionalRank : null;
  const totalAssessments =
    dashboard?.counts?.totalCompletedAssessments ?? dashboard?.totalCompletedAssessments ?? 0;
  const velocity: any[] = Array.isArray(dashboard?.metricVelocity) ? dashboard.metricVelocity : [];
  const recommendationText =
    latestAssessment?.recommendations && latestAssessment.recommendations.length
      ? String(latestAssessment.recommendations[0])
      : null;

  const activities = velocity.map((p: any) => ({
    icon: 'directions-run' as const,
    title: `${p.testType ? String(p.testType).replace(/_/g, ' ') : 'Assessment'} • ${p.assessmentCode || ''}`.trim(),
    time: p.date || '',
    score: p.value != null ? `${p.value}%` : '--'
  }));

  const firstName = profile?.name ? String(profile.name).split(' ')[0] : 'Athlete';

  return (
    <View style={styles.root}>
      {isLg && <DesktopSideNav navigation={navigation} activeKey="home" />}
      <View style={isLg ? styles.mainLg : undefined}>
      {/* Top App Bar */}
      <View style={[styles.topBar, isLg && { paddingHorizontal: Spacing.marginDesktop }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Text style={styles.topBarTitle}>Athlete Overview</Text>
          <View style={styles.eliteBadge}>
            <Text style={styles.eliteBadgeText}>{String(tierLabel).toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <TouchableOpacity style={styles.bellBtn}>
            <Icon name="notifications" size={22} color={Colors.onSurface} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
          <View style={styles.userChip}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Icon name="person" size={18} color={Colors.onSurfaceVariant} />
              </View>
            )}
            <Text style={styles.userName}>{userName}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: isLg ? Spacing.lg : 120 }} showsVerticalScrollIndicator={false}>
        <View
          style={[
            { gap: Spacing.gutter, alignSelf: 'center', width: '100%', maxWidth: 1440 },
            isLg ? { padding: Spacing.marginDesktop } : { padding: Spacing.marginMobile }
          ]}
        >
          {loading ? (
            <Card style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
              <ActivityIndicator size="large" color={Colors.secondary} />
            </Card>
          ) : (
            <>
              {error && (
                <View style={styles.errorBanner}>
                  <Icon name="error-outline" size={20} color={Colors.error} />
                  <Text style={styles.errorBannerText}>Couldn't load your dashboard data.</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={load}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
          {/* Offline / sync status */}
          {(offline || pendingSyncCount > 0) && (
            <TouchableOpacity
              style={styles.pendingSyncCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Assess')}
            >
              <Icon name={offline ? 'wifi-off' : 'cloud-sync'} size={20} color={Colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingSyncTitle}>
                  {offline
                    ? "You're offline. Assessments will be saved and synced later."
                    : `${pendingSyncCount} assessment${pendingSyncCount === 1 ? '' : 's'} waiting to sync`}
                </Text>
                <Text style={styles.pendingSyncBody}>
                  {pendingSyncCount > 0
                    ? `${pendingSyncCount} waiting to sync • Open Assess for details`
                    : 'Recording works without a connection'}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}
          {/* Quick Actions */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
            <TouchableOpacity
              style={[styles.quickActionCard, { backgroundColor: Colors.primary }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Assess' })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionLabelLight}>PRO ASSESSMENT</Text>
                <Text style={styles.quickActionTitle}>Start Assessment</Text>
              </View>
              <Icon name="bolt" size={24} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickActionCard, Glass]} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionLabel}>AI ANALYTICS</Text>
                <Text style={styles.quickActionTitleDark}>Upload Video</Text>
              </View>
              <Icon name="videocam" size={24} color={Colors.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionCard, Glass]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Progress')}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionLabel}>DATA ARCHIVE</Text>
                <Text style={styles.quickActionTitleDark}>View Reports</Text>
              </View>
              <Icon name="description" size={24} color={Colors.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionCard, Glass]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.quickActionLabel}>NETWORK</Text>
                <Text style={styles.quickActionTitleDark}>Find Coach</Text>
              </View>
              <Icon name="groups" size={24} color={Colors.secondary} />
            </TouchableOpacity>
          </View>

          {/* Bento Row 1: Gauge / Status / Activities */}
          <View style={{ flexDirection: 'row', flexWrap: isMd ? 'nowrap' : 'wrap', gap: Spacing.gutter }}>
            <Card style={[{ alignItems: 'center' }, isMd ? { flex: 1 } : { width: '100%' }]}>
              <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, styles.cardHeader]}>
                <Text style={styles.cardLabel}>PERFORMANCE SCORE</Text>
                <Icon name="info" size={20} color={Colors.secondary} />
              </View>
              <View style={styles.gaugeWrap}>
                {score !== null ? (
                  <CircularScoreGauge size={isMd ? 192 : 176} strokeWidth={isMd ? 9 : 10} score={score} rotate>
                    <Text style={styles.gaugeScore}>{score}</Text>
                    {percentileLabel != null && (
                      <Text style={styles.gaugePercentile}>{percentileLabel}</Text>
                    )}
                  </CircularScoreGauge>
                ) : (
                  <View style={[styles.gaugeEmpty, { height: isMd ? 192 : 176 }]}>
                    <Text style={styles.gaugeScore}>--</Text>
                    <Text style={styles.gaugePercentile}>NO ASSESSMENT YET</Text>
                  </View>
                )}
              </View>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.md }]}>
                {latestAssessment?.testType
                  ? `Latest ${String(latestAssessment.testType).replace(/_/g, ' ')} score from ${latestAssessment.assessmentCode || 'your last session'}.`
                  : 'No assessment yet — complete your first assessment to see your score.'}
              </Text>
            </Card>

            <View style={isMd ? { flex: 1, gap: Spacing.gutter } : { width: '100%', gap: Spacing.gutter }}>
              <Card style={{ gap: Spacing.base }} >
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
                  onPress={() => navigation.navigate('InjuryRisk')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cardLabel}>INJURY RISK</Text>
                  <Icon name={injuryLevel ? 'check-circle' : 'info'} size={22} color={injuryLevel ? Colors.onTertiaryContainer : Colors.onSurfaceVariant} />
                </TouchableOpacity>
                <Text style={Typography.headlineLg}>{injuryLevel ?? '--'}</Text>
                <View style={styles.riskTrack}>
                  <View style={[styles.riskFill, { width: injuryPct != null ? `${Math.min(100, Math.max(0, injuryPct))}%` : '0%' }]} />
                </View>
              </Card>

              <Card style={{ gap: Spacing.base }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={styles.cardLabel}>CURRENT RANK</Text>
                  <Icon name="military-tech" size={22} color={Colors.secondary} />
                </View>
                <Text style={Typography.headlineLg}>{rankNum !== null ? `#${rankNum}` : '--'}</Text>
                {profile?.division ? (
                  <Text style={styles.tinyCaps}>{String(profile.division).toUpperCase()}</Text>
                ) : null}
              </Card>

              <Card style={{ gap: Spacing.base }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={styles.cardLabel}>ASSESSMENTS</Text>
                  <Icon name="history" size={22} color={Colors.secondary} />
                </View>
                <Text style={Typography.headlineLg}>{totalAssessments}</Text>
                <Text style={styles.tinyCaps}>COMPLETED THIS SEASON</Text>
              </Card>
            </View>

            <Card style={isMd ? { flex: 1 } : { width: '100%' }}>
              <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, styles.cardHeader]}>
                <Text style={styles.cardLabel}>RECENT ACTIVITIES</Text>
                <TouchableOpacity onPress={() => navigation.navigate('AnalysisResults')}>
                  <Text style={styles.seeAll}>SEE ALL</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: Spacing.md }}>
                {activities.length ? (
                  activities.map((a, i) => (
                    <View key={`${a.title}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                      <View style={styles.activityIconBox}>
                        <Icon name={a.icon} size={20} color={Colors.onSurfaceVariant} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityTitle}>{a.title}</Text>
                        <Text style={styles.activityTime}>{a.time}</Text>
                      </View>
                      <Text style={styles.activityScore}>{a.score}</Text>
                    </View>
                  ))
                ) : (
                  <TouchableOpacity
                    style={styles.emptyActivityRow}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'Assess' })}
                  >
                    <View style={styles.activityIconBox}>
                      <Icon name="add" size={20} color={Colors.onSurfaceVariant} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle}>No activity yet</Text>
                      <Text style={[styles.activityTime, { color: Colors.secondary }]}>
                        Start your first assessment →
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {recommendationText && (
              <View style={styles.recommendationSection}>
                <Text style={[styles.cardLabel, { marginBottom: Spacing.md }]}>AI RECOMMENDATIONS</Text>
                <View style={styles.recommendationCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs }}>
                    <Icon name="auto-awesome" size={16} color={Colors.secondaryFixed} />
                    <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.secondaryFixed }]}>NEXT STEP</Text>
                  </View>
                  <Text style={styles.recommendationTitle}>
                    {recommendationText}
                  </Text>
                </View>
              </View>
              )}
            </Card>
          </View>

          {/* Progress Trend Chart + Weekly Performance */}
          <View style={isMd ? { flexDirection: 'row', gap: Spacing.gutter } : undefined}>
          <View style={isMd ? { flex: 2 } : undefined}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: Spacing.lg }}>
              <View>
                <Text style={styles.cardLabel}>PROGRESS TREND</Text>
                <Text style={Typography.headlineMd}>Metric Velocity</Text>
              </View>
              <View style={styles.rangeSwitcher}>
                {TREND_RANGES.map(r => (
                  <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}>
                    <Text style={[styles.rangeText, range === r && styles.rangeTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <MetricTrendChart height={240} data={range === '1M' ? [70, 74, 71, 79, 76, 84] : range === '3M' ? [62, 66, 72, 69, 78, 82] : [58, 64, 60, 70, 75, 81]} labels={['APR 01', 'APR 15', 'MAY 01', 'MAY 15', 'TODAY']} />
          </Card>
          </View>

          <View style={isMd ? { flex: 1 } : undefined}>
          {/* Weekly Performance */}
          <Card>
            <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, styles.cardHeader]}>
              <Text style={styles.cardLabel}>WEEKLY PERFORMANCE</Text>
              <Icon name="more-vert" size={22} color={Colors.onSurfaceVariant} />
            </View>
            <View style={styles.weeklyRow}>
              {WEEKLY_BARS.map(b => (
                <View key={b.day} style={styles.weeklyCol}>
                  <View
                    style={[
                      styles.weeklyBar,
                      {
                        height: `${b.pct}%`,
                        backgroundColor: b.active ? Colors.secondary : Colors.surfaceContainer
                      }
                    ]}
                  />
                  <Text style={[styles.weeklyDay, b.active && styles.weeklyDayActive]}>{b.day}</Text>
                </View>
              ))}
            </View>
          </Card>
          </View>
          </View>

          {/* Dynamic Movement Assessment + Elite Comparison */}
          <View style={isMd ? { flexDirection: 'row', gap: Spacing.gutter } : undefined}>
          <View style={isMd ? { flex: 1 } : undefined}>
          <Card style={{ overflow: 'hidden', padding: 0 }}>
            <View style={styles.movementMedia}>
              <Image source={{ uri: MOVEMENT_IMG }} style={styles.movementImage} />
              <View style={styles.movementOverlay}>
                <View style={styles.dashedFrame}>
                  <View style={styles.aiActiveChip}>
                    <Text style={styles.aiActiveText}>AI FORM ANALYSIS ACTIVE</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ padding: Spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={Typography.headlineMd}>Dynamic Movement Assessment</Text>
                <Icon name="analytics" size={22} color={Colors.secondary} />
              </View>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                Proprietary vision AI tracking 24 key body nodes to assess stability and power transfer during vertical loads.
              </Text>
            </View>
          </Card>
          </View>

          <View style={isMd ? { flex: 1 } : undefined}>
          {/* Elite Comparison */}
          <Card>
            <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, styles.cardHeader]}>
              <Text style={styles.cardLabel}>ELITE COMPARISON</Text>
              <Icon name="trending-up" size={22} color={Colors.secondary} />
            </View>
            <Text style={[Typography.headlineMd, { marginBottom: Spacing.lg }]}>Biometric Benchmarks</Text>
            <View style={{ gap: Spacing.md }}>
              {BENCHMARKS.map(b => (
                <BiometricProgressBar
                  key={b.label}
                  label={b.label}
                  value={b.value}
                  percent={b.percent}
                  barColor={b.color}
                  trackColor={Colors.surfaceContainerHigh}
                  barHeight={8}
                  showShadow={b.shadow}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.benchmarkBtn}>
              <Text style={styles.benchmarkBtnText}>View Detailed Benchmarks</Text>
              <Icon name="north-east" size={18} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
          </Card>
          </View>
          </View>
            </>
          )}
        </View>
      </ScrollView>

      <AIChatBotModal athleteName={firstName} />
      </View>
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const NAV_ITEMS = [
  { key: 'home', icon: 'dashboard', label: 'Home', tab: 'Home' },
  { key: 'analysis', icon: 'analytics', label: 'Analysis', tab: 'Insights' },
  { key: 'injuries', icon: 'monitor-heart', label: 'Injuries', stack: 'InjuryRisk' },
  { key: 'progress', icon: 'trending-up', label: 'Progress', stack: 'Progress' },
  { key: 'coach', icon: 'person-search', label: 'Find Personal Coach', tab: 'Explore' },
  { key: 'admin', icon: 'admin-panel-settings', label: 'Admin' }
] as const;

const NAV_FOOTER = [
  { key: 'settings', icon: 'settings', label: 'Settings', tab: 'Profile' },
  { key: 'help', icon: 'help', label: 'Help' }
] as const;

export function DesktopSideNav({
  navigation,
  activeKey,
  showBack
}: {
  navigation: any;
  activeKey?: string;
  showBack?: boolean;
}) {
  const renderItem = (item: any, active: boolean, onPress?: () => void) => (
    <TouchableOpacity
      key={item.key}
      style={[styles.sideNavItem, active && styles.sideNavItemActive]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Icon name={item.icon} size={22} color={active ? Colors.onSecondaryContainer : Colors.onSurfaceVariant} />
      <Text style={[styles.sideNavLabel, active && styles.sideNavLabelActive]}>{item.label}</Text>
    </TouchableOpacity>
  );

  const handle = (item: any) => {
    if (item.tab) return () => navigation.navigate('MainTabs', { screen: item.tab });
    if (item.stack) return () => navigation.navigate(item.stack);
    return undefined;
  };

  return (
    <View style={styles.sideNav}>
      {!showBack && (
        <View style={styles.sideNavBrand}>
          <View style={styles.brandLogo}>
            <Icon name="insights" size={22} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.brandName}>TalentScope AI</Text>
            <Text style={styles.brandTagline}>ELITE PERFORMANCE AI</Text>
          </View>
        </View>
      )}
      {showBack && (
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={Colors.onSurfaceVariant} />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      )}
      <View style={{ gap: Spacing.xs, flexGrow: 1 }}>
        {NAV_ITEMS.map(item => renderItem(item, item.key === activeKey, handle(item)))}
      </View>
      <View style={[{ gap: Spacing.xs }, showBack ? styles.sideNavFooterTop : styles.sideNavFooterBorder]}>
        {NAV_FOOTER.map(item => renderItem(item, item.key === activeKey, handle(item)))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  mainLg: { marginLeft: 256 },
  sideNav: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 256,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: 'rgba(198,198,205,0.15)',
    padding: Spacing.md,
    gap: Spacing.sm,
    zIndex: 50
  },
  sideNavBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.lg
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandName: { ...Typography.headlineMd, color: Colors.primary, letterSpacing: -1.2 },
  brandTagline: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.base,
    borderRadius: 8
  },
  backBtnText: { ...Typography.bodyMd, fontWeight: '600' },
  sideNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    borderRadius: 8
  },
  sideNavItemActive: {
    backgroundColor: Colors.secondaryContainer
  },
  sideNavLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 22, fontWeight: '600', color: Colors.onSurfaceVariant },
  sideNavLabelActive: { color: Colors.onSecondaryContainer },
  sideNavFooterBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.15)',
    paddingTop: Spacing.md
  },
  sideNavFooterTop: {
    marginTop: 'auto'
  },
  topBar: {
    height: 64,
    paddingHorizontal: Spacing.marginMobile,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,249,251,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  topBarTitle: { ...Typography.headlineMd, fontSize: 20, lineHeight: 26, color: Colors.primary },
  eliteBadge: {
    backgroundColor: Colors.tertiaryFixed,
    paddingHorizontal: Spacing.base,
    paddingVertical: 2,
    borderRadius: 999
  },
  eliteBadgeText: { ...Typography.labelCaps, fontSize: 9, letterSpacing: 1.6, color: Colors.onTertiaryFixed },
  bellBtn: { position: 'relative', padding: Spacing.base },
  notifDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1,
    borderColor: Colors.surface
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: Spacing.md,
    paddingVertical: 4
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  userName: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant },
  quickActionCard: {
    flexGrow: 1,
    minWidth: 160,
    borderRadius: 12,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center'
  },
  quickActionLabelLight: {
    ...Typography.labelCaps,
    fontSize: 9,
    opacity: 0.7,
    color: '#ffffff',
    marginBottom: 2
  },
  quickActionLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginBottom: 2 },
  quickActionTitle: { fontFamily: 'Geist_600SemiBold', fontSize: 19, fontWeight: '600', color: '#ffffff' },
  quickActionTitleDark: { fontFamily: 'Geist_600SemiBold', fontSize: 19, fontWeight: '600', color: Colors.onSurface },
  card: {
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 12,
    padding: Spacing.md,
    width: '100%'
  },
  cardHeader: { marginBottom: Spacing.md },
  cardLabel: { ...Typography.labelCaps, color: Colors.onSurfaceVariant },
  pendingSyncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.secondaryContainer,
    borderWidth: 1,
    borderColor: Colors.secondaryContainer,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg
  },
  pendingSyncTitle: { fontFamily: 'Geist_600SemiBold', fontSize: 14, lineHeight: 19, fontWeight: '600', color: Colors.onSurface },
  pendingSyncBody: { ...Typography.bodyMd, fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.25)',
    borderRadius: 8,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md
  },
  errorBannerText: { flex: 1, fontSize: 13, color: Colors.error },
  retryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.error,
    borderRadius: 6
  },
  retryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, fontWeight: '600', color: '#ffffff' },
  gaugeWrap: { alignItems: 'center', justifyContent: 'center' },
  gaugeEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarPlaceholder: { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  gaugeScore: {
    ...Typography.displayHero,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -2,
    color: Colors.primary
  },
  gaugePercentile: { ...Typography.labelCaps, color: Colors.onSurfaceVariant, marginTop: 2 },
  riskTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden'
  },
  riskFill: { height: '100%', backgroundColor: Colors.onTertiaryContainer, borderRadius: 999 },
  tinyCaps: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant },
  seeAll: { fontSize: 11, fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.secondary, textTransform: 'uppercase' },
  activityIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 8,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs
  },
  activityTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  activityTime: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginTop: 2 },
  activityScore: { ...Typography.monoData, color: Colors.secondary },
  recommendationSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.2)'
  },
  recommendationCard: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 12,
    padding: Spacing.md
  },
  recommendationTitle: { ...Typography.bodyMd, fontFamily: 'Inter_600SemiBold', fontWeight: '600', color: Colors.onPrimaryContainer, marginBottom: Spacing.sm },
  rangeSwitcher: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    padding: 4,
    gap: 2
  },
  rangeBtn: { paddingHorizontal: Spacing.base, paddingVertical: 4, borderRadius: 6 },
  rangeBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  rangeText: { fontSize: 10, fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.onSurfaceVariant },
  rangeTextActive: { color: Colors.onSurface },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: Spacing.base,
    height: 256
  },
  weeklyCol: { flex: 1, alignItems: 'center', gap: Spacing.base, height: '100%', justifyContent: 'flex-end' },
  weeklyBar: {
    width: '100%',
    borderRadius: 8
  },
  weeklyDay: { ...Typography.monoData, fontSize: 10, color: Colors.outline },
  weeklyDayActive: { color: Colors.primary, fontFamily: 'Inter_700Bold' },
  movementMedia: { aspectRatio: 16 / 9, backgroundColor: Colors.surfaceDim },
  movementImage: { ...StyleSheet.absoluteFillObject, opacity: 0.7 },
  movementOverlay: { ...StyleSheet.absoluteFillObject, padding: Spacing.md },
  dashedFrame: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,104,122,0.3)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiActiveChip: {
    backgroundColor: 'rgba(0,104,122,0.12)',
    borderColor: 'rgba(0,104,122,0.4)',
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    borderRadius: 8
  },
  aiActiveText: { ...Typography.labelCaps, color: Colors.onSecondaryContainer },
  benchmarkBtn: {
    marginTop: Spacing.lg,
    width: '100%',
    paddingVertical: Spacing.base,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs
  },
  benchmarkBtnText: { fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.onSurfaceVariant }
});
