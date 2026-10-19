import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import { getCoachDashboard, getCoachConsultations } from '../../services/api';
import { clearSession } from '../../services/session';
import { SkeletonBlock, SkeletonCard } from '../../components/Skeleton';

const RISK_COLORS: Record<string, string> = {
  Low: '#009844',
  Moderate: '#b26a00',
  High: Colors.error
};

const CONSULT_STATUS_COLORS: Record<string, string> = {
  requested: '#b26a00',
  confirmed: '#009844',
  in_progress: Colors.secondary,
  completed: Colors.onSurfaceVariant,
  cancelled: Colors.error
};

function formatDateTime(d: any): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  } catch {
    return '';
  }
}

export default function CoachDashboardScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const [data, setData] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[] | null>(null);
  const [consultError, setConsultError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConsultations = useCallback(async () => {
    setConsultError(null);
    try {
      const res = await getCoachConsultations();
      setConsultations(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setConsultError(e?.message || 'Failed to load consultations');
    }
  }, []);

  const load = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const [dashRes] = await Promise.allSettled([getCoachDashboard(), loadConsultations()]);
    if (dashRes.status === 'fulfilled') {
      setData(dashRes.value?.data || null);
    } else {
      setError(dashRes.reason?.message || 'Failed to load coach dashboard');
    }
    setLoading(false);
  }, [loadConsultations]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    await clearSession();
    navigation.reset({ index: 0, routes: [{ name: 'Landing' }] });
  };

  const coachName = data?.coach?.name || 'Coach';
  const stats = data?.stats || {};
  const alerts: any[] = Array.isArray(data?.alerts) ? data.alerts : [];
  const topPerformers: any[] = Array.isArray(data?.topPerformers) ? data.topPerformers : [];

  if (loading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { paddingHorizontal: padH }]}>
            <View style={{ gap: 8 }}>
              <SkeletonBlock width={140} height={12} />
              <SkeletonBlock width={220} height={34} />
            </View>
            <SkeletonBlock width={110} height={38} radius={8} />
          </View>
          <View style={{ paddingHorizontal: padH }}>
            <View style={[{ alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX }, { paddingVertical: Spacing.lg }]}>
              <View style={[styles.statRow, !isMd && { flexDirection: 'column', gap: Spacing.md }]}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[styles.statCard, isMd && { flex: 1 }]}>
                    <SkeletonBlock width={28} height={28} radius={14} />
                    <SkeletonBlock width={64} height={30} />
                    <SkeletonBlock width={90} height={11} />
                  </View>
                ))}
              </View>
              <SkeletonBlock height={48} radius={12} style={{ marginTop: Spacing.lg }} />
              <SkeletonBlock height={26} style={{ marginTop: Spacing.xl, maxWidth: 160 }} />
              <SkeletonCard height={84} style={{ marginBottom: Spacing.sm }} />
              <SkeletonCard height={84} />
              <SkeletonBlock height={26} style={{ marginTop: Spacing.xl, maxWidth: 200 }} />
              <SkeletonCard height={64} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <Icon name="error-outline" size={40} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statCards = [
    { icon: 'groups', label: 'ATHLETES', value: String(stats.athletes ?? 0), color: Colors.secondary },
    {
      icon: 'assessment',
      label: 'ASSESSMENTS',
      value: String(stats.assessments ?? 0),
      sub: stats.completedAssessments != null ? `${stats.completedAssessments} completed` : undefined,
      color: Colors.primary
    },
    {
      icon: 'notification-important',
      label: 'ALERTS',
      value: String(alerts.length),
      sub: stats.highRiskAthletes != null && stats.highRiskAthletes > 0 ? `${stats.highRiskAthletes} high risk` : 'All clear',
      color: alerts.length > 0 ? Colors.error : Colors.onTertiaryContainer
    }
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} colors={[Colors.secondary]} />
        }
      >
        <View style={[styles.header, { paddingHorizontal: padH }]}>
          <View>
            <Text style={styles.headerLabel}>COACH OVERVIEW</Text>
            <Text style={styles.headerName}>{coachName}</Text>
            {data?.coach?.title ? <Text style={styles.headerTitle}>{data.coach.title}</Text> : null}
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Icon name="logout" size={18} color={Colors.onPrimary} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: padH }}>
          <View style={[container, { paddingVertical: Spacing.lg }]}>
            <View style={[styles.statRow, !isMd && { flexDirection: 'column', gap: Spacing.md }]}>
              {statCards.map(c => (
                <View key={c.label} style={[styles.statCard, isMd && { flex: 1 }]}>
                  <Icon name={c.icon as any} size={28} color={c.color} />
                  <Text style={styles.statValue}>{c.value}</Text>
                  <Text style={styles.statLabel}>{c.label}</Text>
                  {c.sub ? <Text style={styles.statSub}>{c.sub}</Text> : null}
                </View>
              ))}
              <View style={[styles.statCard, styles.avgCard, isMd && { flex: 1 }]}>
                <Icon name="speed" size={28} color={Colors.onSecondaryContainer} />
                <Text style={styles.statValue}>{stats.avgScore ?? '--'}</Text>
                <Text style={styles.statLabel}>AVG SCORE</Text>
                {stats.avgScore == null ? <Text style={styles.statSub}>No completed assessments</Text> : null}
              </View>
            </View>

            <TouchableOpacity
              style={styles.viewAthletesBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CoachAthletes')}
            >
              <Icon name="groups" size={20} color={Colors.onSecondary} />
              <Text style={styles.viewAthletesText}>View Athletes ({stats.athletes ?? 0})</Text>
              <Icon name="arrow-forward" size={18} color={Colors.onSecondary} />
            </TouchableOpacity>

            <Text style={[Typography.headlineLg, { color: Colors.onSurface, marginTop: Spacing.xl, marginBottom: Spacing.md }]}>
              Alerts
            </Text>
            {alerts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="verified" size={24} color={Colors.onTertiaryContainer} />
                <Text style={styles.emptyTitle}>No alerts</Text>
                <Text style={styles.emptyBody}>No high-risk athletes or failed assessments right now.</Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {alerts.map((a, i) => (
                  <View key={`${a.type}-${i}`} style={styles.alertRow}>
                    <Icon
                      name={a.severity === 'high' ? 'warning' : 'info'}
                      size={20}
                      color={a.severity === 'high' ? Colors.error : '#b26a00'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertMsg}>{a.message}</Text>
                    </View>
                    {a.athleteId ? (
                      <TouchableOpacity
                        onPress={() => navigation.navigate('CoachAthleteOverview', { athleteId: a.athleteId })}
                      >
                        <Text style={styles.alertLink}>VIEW</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Text style={[Typography.headlineLg, { color: Colors.onSurface, marginTop: Spacing.xl, marginBottom: Spacing.md }]}>
              Consultations
            </Text>
            {consultError ? (
              <View style={styles.emptyCard}>
                <Icon name="error-outline" size={24} color={Colors.error} />
                <Text style={styles.emptyTitle}>Couldn't load consultations</Text>
                <Text style={styles.emptyBody}>{consultError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadConsultations}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : !consultations ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator size="small" color={Colors.secondary} />
              </View>
            ) : consultations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="event-busy" size={24} color={Colors.outline} />
                <Text style={styles.emptyTitle}>No consultation requests yet</Text>
                <Text style={styles.emptyBody}>Athlete bookings will appear here with their status and schedule.</Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {consultations.map(c => {
                  const sc = CONSULT_STATUS_COLORS[c.status] ?? Colors.outline;
                  const athleteName = c.athleteId?.name || 'Athlete';
                  return (
                    <View key={String(c._id)} style={styles.consultRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                          <Text style={styles.consultAthlete}>{athleteName}</Text>
                          <View style={[styles.statusChipSm, { backgroundColor: `${sc}22` }]}>
                            <Text style={[styles.statusChipSmText, { color: sc }]}>{String(c.status || '').toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={styles.consultMeta}>
                          {[
                            c.scheduledDate ? `Scheduled ${formatDateTime(c.scheduledDate)}` : 'Not scheduled yet',
                            c.assessmentId?.assessmentCode ? `Re: ${c.assessmentId.assessmentCode}` : null
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </Text>
                        {c.athleteNotes ? (
                          <Text style={styles.consultNotes} numberOfLines={2}>
                            {String(c.athleteNotes)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={[Typography.headlineLg, { color: Colors.onSurface, marginTop: Spacing.xl, marginBottom: Spacing.md }]}>
              Top Performers
            </Text>
            {topPerformers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="person-off" size={24} color={Colors.outline} />
                <Text style={styles.emptyTitle}>No athletes assigned yet</Text>
                <Text style={styles.emptyBody}>Athletes who authorize you will appear here.</Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {topPerformers.map((a: any) => (
                  <TouchableOpacity
                    key={String(a._id)}
                    style={styles.performerRow}
                    onPress={() => navigation.navigate('CoachAthleteOverview', { athleteId: a._id })}
                  >
                    <Icon name="leaderboard" size={20} color={Colors.secondary} />
                    <Text style={styles.performerName}>{a.name}</Text>
                    <View style={[styles.riskPill, { backgroundColor: `${RISK_COLORS[a.currentInjuryRiskLevel] ?? Colors.outline}22` }]}>
                      <Text style={[styles.riskText, { color: RISK_COLORS[a.currentInjuryRiskLevel] ?? Colors.outline }]}>
                        {a.overallPerformanceScore ?? '--'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

const GlassBg = { backgroundColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(15,23,42,0.05)' };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  errorText: { ...Typography.bodyMd, color: Colors.error, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  retryText: { ...Typography.labelCaps, color: Colors.onPrimary },
  header: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md
  },
  headerLabel: { ...Typography.labelCaps, color: Colors.secondary },
  headerName: { ...Typography.displayHero, fontSize: 36, lineHeight: 44, letterSpacing: -1.4, color: Colors.onSurface },
  headerTitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44
  },
  logoutText: { ...Typography.labelCaps, color: Colors.onPrimary },
  statRow: { flexDirection: 'row', gap: Spacing.md },
  statCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 16,
    padding: Spacing.md,
    gap: Spacing.xs
  },
  avgCard: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.secondaryContainer },
  statValue: { ...Typography.displayHero, fontSize: 34, lineHeight: 40, color: Colors.onSurface },
  statLabel: { ...Typography.labelCaps, color: Colors.onSurfaceVariant },
  statSub: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant },
  viewAthletesBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm
  },
  viewAthletesText: { ...Typography.headlineMd, color: Colors.onSecondary },
  emptyCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs
  },
  emptyTitle: { ...Typography.headlineMd, color: Colors.onSurface },
  emptyBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 12,
    padding: Spacing.md
  },
  alertMsg: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1 },
  alertLink: { ...Typography.labelCaps, color: Colors.secondary },
  performerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: GlassBg.backgroundColor,
    borderWidth: 1,
    borderColor: GlassBg.borderColor,
    borderRadius: 12,
    padding: Spacing.md
  },
  performerName: { ...Typography.bodyLg, fontWeight: '600', color: Colors.onSurface, flex: 1 },
  riskPill: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  riskText: { ...Typography.monoData, fontSize: 13 },
  consultRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    borderRadius: 12,
    padding: Spacing.md
  },
  consultAthlete: { fontFamily: 'Geist_600SemiBold', fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.onSurface },
  statusChipSm: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  statusChipSmText: { ...Typography.labelCaps, fontSize: 9 },
  consultMeta: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant },
  consultNotes: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, fontStyle: 'italic' }
});
