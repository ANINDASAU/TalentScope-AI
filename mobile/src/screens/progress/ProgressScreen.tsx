import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import CircularScoreGauge from '../../components/CircularScoreGauge';
import MetricTrendChart from '../../components/MetricTrendChart';
import { getAthleteProgress, getAthleteStats } from '../../services/api';

type TrendPoint = { value: number; date: string };

type Milestone = {
  icon: 'flag' | 'emoji-events' | 'schedule' | 'lock';
  iconBg: string;
  iconColor: string;
  title: string;
  detail: string;
  locked?: boolean;
};

export default function ProgressScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progressRes, statsRes] = await Promise.all([getAthleteProgress(), getAthleteStats()]);
      setProgress(progressRes?.data ?? null);
      setStats(statsRes?.data ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rawTrend: any[] =
    progress?.chronologicalTrend?.length ? progress.chronologicalTrend : stats?.metricVelocity || [];
  const trendPoints: TrendPoint[] = rawTrend
    .map((p: any) => ({ value: typeof p.score === 'number' ? p.score : p.value, date: p.date }))
    .filter((p: any) => typeof p.value === 'number');
  const hasTrend = trendPoints.length >= 2;
  const chartData = trendPoints.map(p => p.value);
  const chartLabels = trendPoints.map(p => p.date);

  const totalCount: number | null = progress?.totalAssessments ?? stats?.totalAssessments ?? null;
  const completedCount: number | null =
    progress?.completedAssessmentsCount ?? stats?.totalCompletedAssessments ?? null;
  const percentile: string | null = typeof stats?.percentile === 'string' ? stats.percentile : null;
  const peakScore: number | null = typeof progress?.peakScore === 'number' ? progress.peakScore : null;
  const latestScore: number | null =
    typeof progress?.latestScore === 'number'
      ? progress.latestScore
      : typeof stats?.score === 'number'
        ? stats.score
        : null;
  const scoreDifferential: number | null =
    typeof progress?.scoreDifferential === 'number' ? progress.scoreDifferential : null;

  const completionRate =
    typeof totalCount === 'number' && totalCount > 0 && typeof completedCount === 'number'
      ? Math.round((completedCount / totalCount) * 100)
      : null;

  const historyRecords: any[] = (progress?.assessmentHistory || []).filter(
    (a: any) => a.status === 'completed'
  );
  const firstRecord = historyRecords.length ? historyRecords[historyRecords.length - 1] : null;
  const latestRecord = historyRecords.length ? historyRecords[0] : null;
  const bestRecord = historyRecords.reduce(
    (best: any, a: any) => (!best || (typeof a.score === 'number' && a.score > best.score) ? a : best),
    null
  );

  const milestones: Milestone[] = [];
  if (firstRecord) {
    milestones.push({
      icon: 'flag',
      iconBg: Colors.tertiaryFixed,
      iconColor: Colors.onTertiaryFixed,
      title: 'First Assessment',
      detail: `${firstRecord.testType ? String(firstRecord.testType).replace(/_/g, ' ') : 'Assessment'} • ${firstRecord.date}`
    });
  }
  milestones.push({
    icon: 'emoji-events',
    iconBg: Colors.secondaryContainer,
    iconColor: Colors.onSecondaryContainer,
    title: 'Best Score',
    detail:
      bestRecord && typeof bestRecord.score === 'number'
        ? `${bestRecord.score}/100 • ${bestRecord.assessmentCode}`
        : 'Complete an assessment to set your benchmark'
  });
  if (latestRecord && latestRecord !== firstRecord) {
    milestones.push({
      icon: 'schedule',
      iconBg: Colors.secondaryFixed,
      iconColor: Colors.onSecondaryContainer,
      title: 'Latest Assessment',
      detail: `${latestRecord.testType ? String(latestRecord.testType).replace(/_/g, ' ') : 'Assessment'} • ${latestRecord.date}`
    });
  }
  milestones.push({
    icon: 'lock',
    iconBg: Colors.surfaceContainerHighest,
    iconColor: Colors.onSurfaceVariant,
    title: 'Elite Tier Alpha',
    detail: 'Reach a 90+ overall score to unlock',
    locked: !peakScore || peakScore < 90
  });

  const averages = progress?.historicalAverages || null;

  const errorBanner = (
    <View style={styles.errorBanner}>
      <Icon name="error-outline" size={18} color={Colors.error} />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.85}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const chartCard = (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md }}>
        <View>
          <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.secondary }]}>PERFORMANCE TREND</Text>
          <Text style={[Typography.headlineMd, { fontSize: 19, lineHeight: 25, marginTop: Spacing.xs }]}>
            Aggregate Performance Score
          </Text>
        </View>
        {hasTrend && (
          <View style={styles.yearPill}>
            <Text style={styles.yearPillText}>{`${chartLabels[0]} - ${chartLabels[chartLabels.length - 1]}`}</Text>
          </View>
        )}
      </View>

      {hasTrend ? (
        <MetricTrendChart height={256} data={chartData} labels={chartLabels} />
      ) : (
        <View style={styles.emptyState}>
          <Icon name="assessment" size={40} color={Colors.outline} />
          <Text style={styles.emptyTitle}>Run your first assessment</Text>
          <Text style={styles.emptyBody}>Your performance trend will appear once an assessment is completed.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Assess' })}
          >
            <Text style={styles.emptyBtnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const summaryBody = (() => {
    if (!completedCount) {
      return 'Complete assessments to unlock AI-driven analysis of your performance trajectory.';
    }
    const parts: string[] = [`${completedCount} assessment${completedCount === 1 ? '' : 's'} completed`];
    if (peakScore !== null) parts.push(`peak score ${peakScore}`);
    if (latestScore !== null && scoreDifferential !== null) {
      parts.push(`latest ${latestScore} (${scoreDifferential >= 0 ? '+' : ''}${scoreDifferential} vs previous)`);
    } else if (latestScore !== null) {
      parts.push(`latest score ${latestScore}`);
    }
    if (percentile) parts.push(`currently ranked in the ${percentile}`);
    return `Across your records: ${parts.join(', ')}.`;
  })();

  const aiCard = (
    <View style={[styles.aiCard, isLg && { flex: 1 }]}>
      <View style={styles.aiWatermark}>
        <Icon name="psychology" size={64} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.secondaryContainer }]}>
        AI CORE ANALYSIS
      </Text>
      <Text style={[Typography.headlineMd, { fontSize: 20, lineHeight: 26, marginTop: Spacing.xs, marginBottom: Spacing.md }]}>
        Performance Summary
      </Text>
      <Text style={styles.aiBody}>{summaryBody}</Text>
    </View>
  );

  const consistencyCard = (
    <View style={styles.consistencyCard}>
      <View>
        <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.onSurfaceVariant }]}>
          ASSESSMENTS COMPLETED
        </Text>
        <Text style={styles.consistencyValue}>
          {typeof completedCount === 'number' && typeof totalCount === 'number'
            ? `${completedCount}/${totalCount}`
            : '--'}
        </Text>
        <Text style={styles.consistencyNote}>
          {percentile ? `Percentile ${percentile}` : 'Percentile --'}
        </Text>
      </View>
      <CircularScoreGauge
        size={48}
        strokeWidth={3}
        score={completionRate ?? 0}
        trackColor={Colors.surfaceContainerHighest}
        rotate
      >
        <Text style={styles.ringHidden}>{''}</Text>
      </CircularScoreGauge>
    </View>
  );

  const milestonesCard = (
    <View style={[styles.card, isMd && { flex: 1 }]}>
      <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.onSurfaceVariant, marginBottom: Spacing.md }]}>
        MILESTONES & ACHIEVEMENTS
      </Text>
      {historyRecords.length ? (
        <View style={{ gap: Spacing.base }}>
          {milestones.map(m => (
            <View key={m.title} style={[styles.milestoneRow, m.locked && styles.milestoneLocked]}>
              <View style={[styles.milestoneIcon, { backgroundColor: m.iconBg }]}>
                <Icon name={m.icon} size={18} color={m.iconColor} />
              </View>
              <View>
                <Text style={styles.milestoneTitle}>{m.title}</Text>
                <Text style={styles.milestoneDetail}>{m.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.dashedPlaceholder}>
          <Icon name="flag" size={28} color={Colors.outline} />
          <Text style={styles.emptyBody}>Complete your first assessment to unlock milestones.</Text>
        </View>
      )}
    </View>
  );

  const noDataMetric = (
    <View style={[styles.dashedPlaceholder, { flex: 1, minHeight: 120 }]}>
      <Text style={styles.emptyBody}>No data yet</Text>
    </View>
  );

  const qualityMetric = averages ? (
    <EvolutionMetric
      title="Movement Quality"
      value={`${averages.avgMovementQuality}/100`}
      percent={averages.avgMovementQuality}
      note="Average movement quality across your completed assessments."
    />
  ) : null;
  const alignmentMetric = averages ? (
    <EvolutionMetric
      title="Joint Alignment"
      value={`${averages.avgJointAlignment}/100`}
      percent={averages.avgJointAlignment}
      note="Average joint alignment across your completed assessments."
    />
  ) : null;

  const evolutionCard = (
    <View style={[styles.card, isMd && { flex: 1 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg }}>
        <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.onSurfaceVariant }]}>
          BIOMETRIC EVOLUTION
        </Text>
        {averages && (
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.legendDot, { backgroundColor: Colors.secondary }]} />
              <Text style={styles.legendText}>Quality</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.legendDot, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
              <Text style={styles.legendText}>Alignment</Text>
            </View>
          </View>
        )}
      </View>
      {isMd ? (
        <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
          <View style={{ flex: 1 }}>{qualityMetric ?? noDataMetric}</View>
          <View style={{ flex: 1 }}>{alignmentMetric ?? noDataMetric}</View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg }}>
          {qualityMetric ?? noDataMetric}
          {alignmentMetric ?? noDataMetric}
        </View>
      )}
    </View>
  );

  const trajectoryCard = (
    <View style={[styles.trajectoryCard, isMd && { marginTop: Spacing.gutter }]}>
      <View style={styles.trajectoryHeader}>
        <Text style={[Typography.labelCaps, { fontSize: 11, color: Colors.onSurfaceVariant }]}>
          CAREER TRAJECTORY MAP
        </Text>
      </View>
      <View style={[styles.trajectoryBody, styles.dashedPlaceholder]}>
        <Icon name="map" size={36} color={Colors.outline} />
        <Text style={styles.emptyBody}>No data yet</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <Text style={styles.brand}>TalentScope AI</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.secondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={container}>
            <View style={[styles.pageHeader, { paddingHorizontal: padH }]}>
              <Text style={[isMd ? Typography.headlineLg : Typography.headlineLgMobile, { marginBottom: Spacing.xs }]}>
                Athlete Journey
              </Text>
              <Text style={[Typography.bodyLg, isMd ? {} : { fontSize: 16 }, { color: Colors.onSurfaceVariant }]}>
                Track your trajectory across all recorded assessments.
              </Text>
            </View>

            <View style={{ paddingHorizontal: padH, gap: Spacing.gutter }}>
              {error && errorBanner}

              {isMd ? (
                <>
                  {isLg ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.gutter, alignItems: 'stretch' }}>
                      <View style={{ flex: 8 }}>{chartCard}</View>
                      <View style={{ flex: 4, gap: Spacing.gutter }}>
                        {aiCard}
                        {consistencyCard}
                      </View>
                    </View>
                  ) : (
                    <>
                      {chartCard}
                      <View style={{ gap: Spacing.gutter }}>
                        {aiCard}
                        {consistencyCard}
                      </View>
                    </>
                  )}

                  <View style={{ flexDirection: 'row', gap: Spacing.gutter, alignItems: 'stretch' }}>
                    <View style={{ flex: isLg ? 4 : 6 }}>{milestonesCard}</View>
                    <View style={{ flex: isLg ? 8 : 6 }}>{evolutionCard}</View>
                  </View>

                  {trajectoryCard}
                </>
              ) : (
                <>
                  {chartCard}

                  <View style={{ gap: Spacing.gutter }}>
                    {aiCard}
                    {consistencyCard}
                  </View>

                  {milestonesCard}

                  {evolutionCard}

                  {trajectoryCard}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function EvolutionMetric({ title, value, percent, note }: { title: string; value: string; percent: number; note: string }) {
  return (
    <View style={{ width: '100%', gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Text style={styles.evolutionTitle}>{title}</Text>
        <Text style={styles.evolutionDelta}>{value}</Text>
      </View>
      <View style={styles.evolutionTrack}>
        <View style={[styles.evolutionFill, { width: `${Math.min(Math.max(percent, 0), 100)}%` }]} />
      </View>
      <Text style={styles.evolutionNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 44,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.marginMobile,
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  brand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary },
  pageHeader: { paddingHorizontal: Spacing.marginMobile, paddingTop: Spacing.md, paddingBottom: Spacing.lg },
  card: {
    backgroundColor: 'rgba(255,255,255,0.85)',
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
  yearPill: {
    backgroundColor: 'rgba(87,223,254,0.2)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: 999
  },
  yearPillText: { fontSize: 11, fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.onSecondaryContainer },
  emptyState: {
    height: 256,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(198,198,205,0.5)',
    borderRadius: 12,
    padding: Spacing.md
  },
  emptyTitle: { ...Typography.headlineMd, fontSize: 17, lineHeight: 23 },
  emptyBody: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    marginTop: Spacing.xs
  },
  emptyBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, fontWeight: '700', color: '#ffffff' },
  dashedPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(198,198,205,0.5)',
    borderRadius: 12,
    padding: Spacing.md
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorContainer,
    borderRadius: 10,
    padding: Spacing.base
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.error },
  retryBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: 6
  },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700', color: '#ffffff' },
  aiCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8
  },
  aiWatermark: { position: 'absolute', top: 0, right: 0, padding: Spacing.md },
  aiBody: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.8)' },
  consistencyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 12,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  consistencyValue: { ...Typography.headlineMd, marginTop: 2 },
  consistencyNote: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  ringHidden: { display: 'none' as any },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderRadius: 8,
    backgroundColor: 'rgba(236,238,240,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.12)'
  },
  milestoneLocked: {
    opacity: 0.4,
    borderStyle: 'dashed',
    backgroundColor: 'transparent'
  },
  milestoneIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  milestoneTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, fontWeight: '700' },
  milestoneDetail: { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.onSurfaceVariant },
  evolutionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', fontWeight: '600' },
  evolutionDelta: { fontFamily: 'Inter_700Bold', fontSize: 17, fontWeight: '700', color: Colors.secondary },
  evolutionTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerHighest,
    overflow: 'hidden'
  },
  evolutionFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 999 },
  evolutionNote: { fontSize: 11, lineHeight: 14, color: Colors.onSurfaceVariant },
  trajectoryCard: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.25)',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2
  },
  trajectoryHeader: {
    padding: Spacing.md,
    backgroundColor: 'rgba(242,244,246,0.35)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.2)'
  },
  trajectoryBody: { height: 400, backgroundColor: '#f8fafc', margin: Spacing.md }
});
