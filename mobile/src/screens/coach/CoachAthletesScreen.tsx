import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import { getMyCoachAthletes } from '../../services/api';
import { SkeletonBlock } from '../../components/Skeleton';

const RISK_COLORS: Record<string, string> = {
  Low: '#009844',
  Moderate: '#b26a00',
  High: Colors.error
};

function formatDate(d: any): string {
  if (!d) return '';
  try {
    return new Date(d)
      .toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      .toUpperCase();
  } catch {
    return '';
  }
}

export default function CoachAthletesScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const [athletes, setAthletes] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyCoachAthletes();
      setAthletes(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load athletes');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await getMyCoachAthletes();
      setAthletes(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load athletes');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = athletes ?? [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (a: any) =>
          String(a.name || '').toLowerCase().includes(q) ||
          String(a.primarySport || '').toLowerCase().includes(q) ||
          String(a.tier || '').toLowerCase().includes(q)
      )
    : rows;

  if (loading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { paddingHorizontal: padH }]} />
          <View style={{ paddingHorizontal: padH }}>
            <View style={[{ alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX }, { paddingVertical: Spacing.md }]}>
              <SkeletonBlock width={220} height={34} />
              <SkeletonBlock width={280} height={18} style={{ marginTop: 10, marginBottom: Spacing.lg }} />
              {[0, 1, 2].map(i => (
                <View key={i} style={[styles.card, { marginBottom: Spacing.md }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <SkeletonBlock width={48} height={48} radius={24} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <SkeletonBlock width="55%" height={16} />
                      <SkeletonBlock width="40%" height={12} />
                    </View>
                    <SkeletonBlock width={70} height={22} radius={999} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error && athletes === null) {
    return (
      <View style={styles.center}>
        <Icon name="error-outline" size={40} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pairs: any[][] = [];
  if (isMd && filtered.length > 1) {
    for (let i = 0; i < filtered.length; i += 2) pairs.push(filtered.slice(i, i + 2));
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} colors={[Colors.secondary]} />
        }
      >
        <View style={[styles.header, { paddingHorizontal: padH }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={Colors.onSurface} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: padH }}>
          <View style={[{ alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX }, { paddingVertical: Spacing.md }]}>
            <Text style={styles.pageTitle}>Your Athletes</Text>
            <Text style={[Typography.bodyLg, { color: Colors.onSurfaceVariant, marginBottom: Spacing.lg }]}>
              Select an athlete to review their performance overview.
            </Text>

            {rows.length > 0 ? (
              <View style={styles.searchBox}>
                <Icon name="search" size={20} color={Colors.onSurfaceVariant} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name, sport or tier"
                  placeholderTextColor={Colors.onSurfaceVariant}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Icon name="close" size={18} color={Colors.onSurfaceVariant} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {rows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="person-off" size={32} color={Colors.outline} />
                <Text style={styles.emptyTitle}>No athletes assigned yet</Text>
                <Text style={styles.emptyBody}>
                  Athletes appear here once they authorize you as their coach.
                </Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="search-off" size={32} color={Colors.outline} />
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyBody}>No athletes match "{searchQuery.trim()}".</Text>
              </View>
            ) : (
              <>
                {isMd && pairs.length > 0
                  ? pairs.map((pair, pi) => (
                      <View key={pi} style={styles.gridRow}>
                        {pair.map(a => (
                          <View key={String(a._id)} style={{ flex: 1 }}>
                            <AthleteCard athlete={a} navigation={navigation} />
                          </View>
                        ))}
                        {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
                      </View>
                    ))
                  : filtered.map((a: any) => (
                      <View key={String(a._id)} style={{ marginBottom: Spacing.md }}>
                        <AthleteCard athlete={a} navigation={navigation} />
                      </View>
                    ))}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AthleteCard({ athlete: a, navigation }: { athlete: any; navigation: any }) {
  const riskColor = RISK_COLORS[a.currentInjuryRiskLevel] ?? Colors.outline;
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('CoachAthleteOverview', { athleteId: a._id })}
    >
      <View style={styles.cardTopRow}>
        {a.avatar ? (
          <Image source={{ uri: a.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Icon name="person" size={22} color={Colors.onSurfaceVariant} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.athleteName}>{a.name}</Text>
          <Text style={styles.athleteMeta}>
            {[
              a.age != null ? `${a.age} yrs old` : null,
              a.primarySport,
              a.tier
            ]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        </View>
        <View style={[styles.riskPill, { backgroundColor: `${riskColor}22` }]}>
          <Text style={[styles.riskPillText, { color: riskColor }]}>
            {(a.currentInjuryRiskLevel ?? 'NO RISK DATA').toString().toUpperCase()}{a.currentInjuryRiskLevel ? ' RISK' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{a.overallPerformanceScore ?? '--'}</Text>
          <Text style={styles.metricLabel}>SCORE</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{a.totalAssessmentsCount ?? 0}</Text>
          <Text style={styles.metricLabel}>ASSESSMENTS</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>
            {a.latestAssessment?.overallScore != null ? a.latestAssessment.overallScore : '--'}
          </Text>
          <Text style={styles.metricLabel}>LATEST</Text>
        </View>
      </View>

      <View style={styles.cardBottomRow}>
        <Text style={styles.latestCode}>
          {a.latestAssessment?.assessmentCode
            ? `${a.latestAssessment.assessmentCode}${formatDate(a.lastAssessmentDate) ? ` • ${formatDate(a.lastAssessmentDate)}` : ''}`
            : 'No assessments yet'}
        </Text>
        <Icon name="chevron-right" size={20} color={Colors.onSurfaceVariant} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  errorText: { ...Typography.bodyMd, color: Colors.error, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  retryText: { ...Typography.labelCaps, color: Colors.onPrimary },
  header: { paddingTop: Spacing.lg },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    minHeight: 44
  },
  backLabel: { ...Typography.bodyMd, color: Colors.onSurface },
  pageTitle: { ...Typography.displayHero, fontSize: 34, lineHeight: 42, letterSpacing: -1.3, color: Colors.onSurface },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg
  },
  searchInput: { flex: 1, ...Typography.bodyMd, color: Colors.onSurface, paddingVertical: 0 },
  gridRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  emptyCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs
  },
  emptyTitle: { ...Typography.headlineMd, color: Colors.onSurface },
  emptyBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    borderRadius: 16,
    padding: Spacing.md
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  athleteName: { fontFamily: 'Geist_600SemiBold', fontSize: 17, lineHeight: 22, fontWeight: '600', color: Colors.onSurface },
  athleteMeta: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant },
  riskPill: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  riskPillText: { ...Typography.labelCaps, fontSize: 10 },
  divider: { borderTopWidth: 1, borderTopColor: 'rgba(198,198,205,0.35)', marginVertical: Spacing.md },
  metricsRow: { flexDirection: 'row', gap: Spacing.lg },
  metric: { alignItems: 'flex-start' },
  metricValue: { ...Typography.headlineLg, fontSize: 24, lineHeight: 30, color: Colors.secondary },
  metricLabel: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant },
  cardBottomRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  latestCode: { ...Typography.monoData, fontSize: 13, color: Colors.onSurfaceVariant }
});
