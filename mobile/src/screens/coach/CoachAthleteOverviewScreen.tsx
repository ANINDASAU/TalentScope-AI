import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import CircularScoreGauge from '../../components/CircularScoreGauge';
import MetricTrendChart from '../../components/MetricTrendChart';
import BiometricProgressBar from '../../components/BiometricProgressBar';
import PostureHeatmap, { buildHeatmapSpotsFromAssessment, buildFindingsFromAssessment } from '../../components/PostureHeatmap';
import { SkeletonBlock, SkeletonCard } from '../../components/Skeleton';
import { getCoachAthleteOverview, getCoachAthleteProgress, getAssessmentById } from '../../services/api';
import { buildRiskFactors } from '../../services/riskVisualization';
import {
  resolveAssessmentView,
  heatmapStateForView,
  PROCESSING_STATUSES
} from '../../services/assessmentView';

const RISK_COLORS: Record<string, string> = {
  Low: '#009844',
  Moderate: '#b26a00',
  High: Colors.error
};

const STATUS_COLORS: Record<string, string> = {
  completed: '#009844',
  processing: Colors.secondary,
  created: Colors.onSurfaceVariant,
  pending: Colors.onSurfaceVariant,
  failed: Colors.error
};

const METRIC_LABELS: Record<string, string> = {
  movementQuality: 'MOVEMENT QUALITY',
  jointAlignment: 'JOINT ALIGNMENT',
  landingMechanics: 'LANDING MECHANICS',
  balanceStability: 'BALANCE & STABILITY',
  symmetryScore: 'SYMMETRY',
  flexibility: 'FLEXIBILITY',
  powerOutput: 'POWER OUTPUT',
  reactionTime: 'REACTION TIME'
};

function formatDate(d: any): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  } catch {
    return '';
  }
}

export default function CoachAthleteOverviewScreen({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const athleteId: string | undefined = route?.params?.athleteId;
  const [data, setData] = useState<any>(null);
  const [progressData, setProgressData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // STEP 8: explicitly selected assessment for the Injury Risk section.
  // Null = latest completed (ships inside the authorized overview payload).
  // Any other ID is fetched as a full document through the same authorized
  // per-assessment endpoint athletes use — the backend enforces that the
  // coach is assigned to this athlete, so nothing unauthorized can load.
  const [selectedAid, setSelectedAid] = useState<string | null>(null);
  const [selDoc, setSelDoc] = useState<any>(null);
  const [selLoading, setSelLoading] = useState(false);
  const [selError, setSelError] = useState<any | null>(null);
  const selRequestRef = useRef(0);

  const selectAssessment = useCallback(async (id: string | null) => {
    const req = ++selRequestRef.current;
    setSelectedAid(id);
    setSelDoc(null);
    setSelError(null);
    if (id === null) {
      setSelLoading(false);
      return;
    }
    setSelLoading(true);
    try {
      const res = await getAssessmentById(id);
      if (selRequestRef.current !== req) return;
      setSelDoc(res?.data ?? null);
    } catch (e: any) {
      if (selRequestRef.current !== req) return;
      setSelDoc(null);
      setSelError(e);
    } finally {
      if (selRequestRef.current === req) setSelLoading(false);
    }
  }, []);

  const load = useCallback(async (silent: boolean = false) => {
    if (!athleteId) {
      setError('No athlete selected');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    const [overviewRes, progressRes] = await Promise.allSettled([
      getCoachAthleteOverview(athleteId),
      getCoachAthleteProgress(athleteId)
    ]);
    let failed = true;
    if (overviewRes.status === 'fulfilled') {
      setData(overviewRes.value?.data || null);
      failed = false;
    }
    if (progressRes.status === 'fulfilled') {
      setProgressData(progressRes.value?.data || null);
      failed = false;
    } else if (overviewRes.status === 'rejected') {
      setError(progressRes.reason?.message || 'Failed to load athlete overview');
    }
    if (failed) {
      setError(overviewRes.status === 'rejected' ? overviewRes.reason?.message || 'Failed to load athlete overview' : 'Failed to load athlete overview');
    }
    setLoading(false);
  }, [athleteId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // A different athlete resets the assessment selection (never carry the
  // previous athlete's document into the new hero).
  useEffect(() => {
    selRequestRef.current++;
    setSelectedAid(null);
    setSelDoc(null);
    setSelError(null);
    setSelLoading(false);
  }, [athleteId]);

  // STEP 9: contract builders run once per selected document, declared with
  // the other unconditional hooks (BEFORE the early returns below, so the
  // hooks order never changes between renders).
  const riskDocForBuilders = selectedAid === null ? data?.latestAssessment ?? null : selDoc;
  const memoFactors = useMemo(() => buildRiskFactors(riskDocForBuilders), [riskDocForBuilders]);
  const memoSpots = useMemo(
    () => buildHeatmapSpotsFromAssessment(riskDocForBuilders),
    [riskDocForBuilders]
  );
  const memoFindings = useMemo(() => buildFindingsFromAssessment(riskDocForBuilders), [riskDocForBuilders]);

  if (loading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <View style={[{ paddingHorizontal: padH }, { paddingTop: Spacing.lg }]}>
            <SkeletonBlock width={150} height={20} />
          </View>
          <View style={{ paddingHorizontal: padH }}>
            <View style={[container, { paddingVertical: Spacing.md }]}>
              <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: Spacing.md }]}>
                <SkeletonBlock width={72} height={72} radius={36} />
                <View style={{ flex: 1, gap: 8 }}>
                  <SkeletonBlock width="50%" height={22} />
                  <SkeletonBlock width="35%" height={14} />
                </View>
                <SkeletonBlock width={80} height={22} radius={999} />
              </View>
              {[0, 1, 2, 3, 4].map(i => (
                <View key={i} style={{ marginTop: Spacing.lg }}>
                  <SkeletonBlock width={160} height={20} style={{ marginBottom: Spacing.sm }} />
                  <View style={[styles.card, { gap: Spacing.sm }]}>
                    <SkeletonBlock width="70%" height={14} />
                    <SkeletonBlock width="45%" height={14} />
                    {i === 1 ? <SkeletonBlock width="100%" height={120} radius={12} /> : null}
                  </View>
                </View>
              ))}
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

  const athlete = data?.athlete || {};
  const latest = data?.latestAssessment || null;
  const summary = data?.summary || {};
  const history: any[] = Array.isArray(data?.history) ? data.history : [];
  const biometrics = latest?.biometricsBreakdown || null;
  // STEP 8: the Injury Risk section visualizes ONE explicitly selected
  // assessment. LATEST reuses the overview payload; any other chip fetches
  // that assessment's full authorized document (see selectAssessment).
  const riskDoc = selectedAid === null ? latest : selDoc;
  const riskLoading = selectedAid !== null && selLoading;
  const riskError = selectedAid !== null ? selError : null;
  const riskView = resolveAssessmentView({ assessment: riskDoc, loading: riskLoading, error: riskError });
  const riskDocResolved = riskView.assessment;
  // Provenance rule: a specifically selected assessment shows ONLY its own
  // stored result. The athlete-level summary mirror applies to LATEST alone.
  const ownClassification = riskDocResolved?.injuryRiskClassification ?? null;
  const riskPct =
    selectedAid === null
      ? (typeof ownClassification?.riskPercentage === 'number'
        ? ownClassification.riskPercentage
        : typeof summary.injuryRiskPercentage === 'number'
          ? summary.injuryRiskPercentage
          : null)
      : (typeof ownClassification?.riskPercentage === 'number' ? ownClassification.riskPercentage : null);
  const riskLevel =
    selectedAid === null
      ? (ownClassification?.riskStatus ?? summary.injuryRiskLevel ?? null)
      : (ownClassification?.riskStatus ?? null);
  const riskColor = RISK_COLORS[riskLevel] ?? Colors.outline;

  const metricEntries = biometrics
    ? Object.entries(METRIC_LABELS)
        .filter(([k]) => typeof biometrics[k] === 'number')
        .map(([k, label]) => ({ key: k, label, value: biometrics[k] }))
    : [];

  const hasCompletedScore = typeof summary.latestScore === 'number';
  const processingAssessment =
    history.find(h => PROCESSING_STATUSES.includes(String(h.status || ''))) || null;
  const failedAssessment = history.find(h => h.status === 'failed') || null;
  const recentHistory = history.slice(0, 12);

  const pTrend: any[] = Array.isArray(progressData?.chronologicalTrend) ? progressData.chronologicalTrend : [];
  const completedCount = typeof progressData?.completedAssessmentsCount === 'number'
    ? progressData.completedAssessmentsCount
    : pTrend.length;
  const seriesFor = (key: string) => {
    const pts = pTrend.filter((t: any) => typeof t[key] === 'number');
    return { data: pts.map((t: any) => t[key]), labels: pts.map((t: any) => t.date), count: pts.length };
  };
  const scoreSeries = seriesFor('score');
  const speedSeries = seriesFor('speed');
  const powerSeries = seriesFor('power');
  const mqSeries = seriesFor('movementQuality');

  const confidence = typeof riskDocResolved?.aiMetadata?.confidenceScore === 'number' ? riskDocResolved.aiMetadata.confidenceScore : null;
  // Factor cards + heatmap via the shared visualization contract (identical
  // builders the athlete screens use — no separate implementation). They
  // derive from the resolved selection, so loading/error states show nothing
  // stale from a previously selected assessment. STEP 9: computed above with
  // the unconditional hooks; consumed here.
  const factors = memoFactors;
  const heatmapSpots = memoSpots;
  const findings = memoFindings;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} colors={[Colors.secondary]} />
        }
      >
        <View style={[{ paddingHorizontal: padH }, { paddingTop: Spacing.lg }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-back" size={22} color={Colors.onSurface} />
            <Text style={styles.backLabel}>Back to Athletes</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: padH }}>
          <View style={[container, { paddingVertical: Spacing.md }]}>
            {/* Athlete hero */}
            <View style={[styles.heroCard, isMd && styles.heroCardMd]}>
              <View style={[styles.avatarLg, styles.avatarPlaceholder]}>
                <Icon name="person" size={40} color={Colors.onSurfaceVariant} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.athleteName}>{athlete.name ?? 'Athlete'}</Text>
                <Text style={styles.athleteMeta}>
                  {[athlete.primarySport, athlete.tier].filter(Boolean).join(' • ')}
                </Text>
                {athlete.affiliation ? (
                  <Text style={styles.athleteAffiliation}>{athlete.affiliation}</Text>
                ) : null}
              </View>
              <View style={[styles.riskPill, { backgroundColor: `${riskColor}22` }]}>
                <Text style={[styles.riskPillText, { color: riskColor }]}>
                  {riskLevel ? `${riskLevel.toString().toUpperCase()} RISK` : 'NO RISK DATA'}
                </Text>
              </View>
            </View>

            {processingAssessment ? (
              <View style={[styles.banner, { borderColor: 'rgba(178,106,0,0.4)', backgroundColor: 'rgba(178,106,0,0.08)' }]}>
                <Icon name="hourglass-top" size={20} color="#b26a00" />
                <Text style={styles.bannerText}>
                  {processingAssessment.assessmentCode} is currently processing. Results will appear here once completed.
                </Text>
              </View>
            ) : null}
            {failedAssessment ? (
              <View style={[styles.banner, { borderColor: `${Colors.error}55`, backgroundColor: `${Colors.error}14` }]}>
                <Icon name="error-outline" size={20} color={Colors.error} />
                <Text style={styles.bannerText}>
                  Assessment {failedAssessment.assessmentCode} failed on {formatDate(failedAssessment.createdAt)}.
                </Text>
              </View>
            ) : null}

            {/* Latest Assessment */}
            <Text style={styles.sectionTitle}>Latest Assessment</Text>
            {latest ? (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={styles.codeText}>{latest.assessmentCode}</Text>
                    <Text style={styles.cardSub}>
                      {[String(latest.testType || '').replace(/_/g, ' '), formatDate(latest.createdAt)]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: `${STATUS_COLORS[latest.status] ?? Colors.outline}22` }]}>
                    <Text style={[styles.statusChipText, { color: STATUS_COLORS[latest.status] ?? Colors.outline }]}>
                      {String(latest.status || '').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No completed assessments for this athlete yet.</Text>
              </View>
            )}

            {/* Performance Score */}
            <Text style={styles.sectionTitle}>Performance Score</Text>
            <View style={styles.card}>
              {hasCompletedScore ? (
                <View style={isMd ? { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl } : { alignItems: 'center' }}>
                  <CircularScoreGauge score={summary.latestScore} size={168} />
                  <View style={{ flex: 1, marginTop: isMd ? 0 : Spacing.md }}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>PEAK</Text>
                      <Text style={styles.summaryValue}>{summary.peakScore ?? '--'}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>LATEST</Text>
                      <Text style={styles.summaryValue}>{summary.latestScore ?? '--'}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>CHANGE</Text>
                      <Text
                        style={[
                          styles.summaryValue,
                          typeof summary.scoreDifferential === 'number'
                            ? { color: summary.scoreDifferential >= 0 ? Colors.onTertiaryContainer : Colors.error }
                            : null
                        ]}
                      >
                        {typeof summary.scoreDifferential === 'number'
                          ? `${summary.scoreDifferential >= 0 ? '+' : ''}${summary.scoreDifferential}`
                          : '--'}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>COMPLETED</Text>
                      <Text style={styles.summaryValue}>{summary.completedAssessments ?? 0}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.scoreEmpty}>
                  <Icon name="analytics" size={28} color={Colors.outline} />
                  <Text style={styles.emptyInlineText2}>
                    No completed assessments yet. The performance score will appear after the first assessment is completed.
                  </Text>
                </View>
              )}
            </View>

            {/* Injury Risk — finalized shared visualization, bound to the
                explicitly selected assessment (STEP 8). */}
            <Text style={styles.sectionTitle}>Injury Risk</Text>
            <View style={styles.card}>
              {recentHistory.length > 0 ? (
                <View style={{ marginBottom: Spacing.md }}>
                  <Text style={[Typography.labelCaps, { color: Colors.onSurfaceVariant, marginBottom: Spacing.xs }]}>
                    ASSESSED SESSION
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                    <TouchableOpacity
                      testID="coach-assessment-chip-latest"
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedAid === null }}
                      style={[styles.sessionChip, selectedAid === null && styles.sessionChipActive]}
                      activeOpacity={0.8}
                      onPress={() => selectAssessment(null)}
                    >
                      <Text style={[styles.sessionChipText, selectedAid === null && styles.sessionChipTextActive]}>
                        LATEST
                      </Text>
                    </TouchableOpacity>
                    {recentHistory.map((h: any) => {
                      const id = String(h._id || h.id || '');
                      const code = h.assessmentCode || 'SESSION';
                      const active = selectedAid === id;
                      const dot =
                        h.status === 'completed' ? '#009844'
                        : h.status === 'failed' ? Colors.error
                        : '#b26a00';
                      return (
                        <TouchableOpacity
                          key={id || code}
                          testID={`coach-assessment-chip-${code}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Show injury risk for ${code}, status ${h.status || 'unknown'}`}
                          style={[styles.sessionChip, active && styles.sessionChipActive]}
                          activeOpacity={0.8}
                          onPress={() => selectAssessment(id)}
                        >
                          <View style={[styles.sessionDot, { backgroundColor: dot }]} />
                          <Text style={[styles.sessionChipText, active && styles.sessionChipTextActive]}>
                            {code}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
              {riskLoading ? (
                <View style={styles.riskLoading}>
                  <ActivityIndicator size="small" color={Colors.secondary} />
                  <Text style={styles.emptyInlineText2}>Loading selected assessment…</Text>
                </View>
              ) : riskView.status === 'error' ? (
                <View style={styles.riskUnavailable}>
                  <Icon name="error-outline" size={22} color={Colors.error} />
                  <Text style={[styles.emptyInlineText2, { color: Colors.error }]}>
                    {riskView.errorMessage}
                  </Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    activeOpacity={0.85}
                    onPress={() => selectAssessment(selectedAid)}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : riskDocResolved ? (
                <>
                  {riskView.status === 'processing' ? (
                    <View style={[styles.banner, { borderColor: 'rgba(178,106,0,0.4)', backgroundColor: 'rgba(178,106,0,0.08)', marginBottom: Spacing.sm }]}>
                      <Icon name="hourglass-top" size={18} color="#b26a00" />
                      <Text style={styles.bannerText}>
                        {riskDocResolved.assessmentCode} is still processing — injury risk will be available once it completes.
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
                    <Text style={[Typography.labelCaps, { color: riskColor }]}>{(riskLevel ?? '').toUpperCase()} RISK</Text>
                    <Text style={Typography.monoData}>{riskPct != null ? `${riskPct}%` : '--'}</Text>
                  </View>
                  {riskPct != null ? (
                    <BiometricProgressBar label="" value={`${riskPct}%`} percent={riskPct} barColor={riskColor} barHeight={10} showShadow={false} />
                  ) : null}
                  <Text style={styles.riskProvenance}>
                    {`FROM ${riskDocResolved.assessmentCode} • ${formatDate(riskDocResolved.createdAt)}`}
                  </Text>

                  {/* Risk factors */}
                  <View style={styles.factorGrid}>
                    {factors.length === 4 ? (
                      (isMd ? [[factors[0], factors[1]], [factors[2], factors[3]]] : [factors]).map((pair, pi) => (
                      <View key={pi} style={isMd ? styles.factorRow : undefined}>
                        {pair.map(f => (
                          <View key={f.title} style={[styles.factorCard, isMd && { flex: 1 }]}>
                            <View style={styles.factorHead}>
                              <Icon name={f.icon as any} size={16} color={Colors.onSurfaceVariant} />
                              <Text style={styles.factorTitle}>{f.title}</Text>
                              <Text style={styles.factorBadge}>{f.badge}</Text>
                            </View>
                            <BiometricProgressBar
                              label=""
                              value={f.badge}
                              percent={f.percent}
                              barColor={f.percent >= 60 ? Colors.error : f.percent >= 35 ? '#b26a00' : Colors.secondary}
                              barHeight={6}
                              showShadow={false}
                            />
                          </View>
                        ))}
                        {isMd && pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
                      </View>
                      ))
                    ) : (
                      <View style={styles.riskUnavailable}>
                        <Icon name="shield" size={22} color={Colors.outline} />
                        <Text style={styles.emptyInlineText2}>
                          No risk breakdown data recorded for this assessment yet.
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Heatmap / posture — the SAME component athletes use,
                      driven to the selected assessment's state (STEP 8).
                      keyed by selection so marker/finding interaction state
                      never leaks across assessments. */}
                  <Text style={styles.chartCaption}>STRAIN HEATMAP</Text>
                  <PostureHeatmap
                    key={selectedAid ?? 'latest'}
                    height={isMd ? 320 : 260}
                    spots={heatmapSpots}
                    findings={findings}
                    state={heatmapStateForView(riskView.status)}
                    errorMessage={
                      riskView.status === 'failed'
                        ? (typeof riskDocResolved?.errorDetails?.message === 'string'
                            ? riskDocResolved.errorDetails.message
                            : 'Analysis failed for this assessment.')
                        : riskView.errorMessage
                    }
                    emptyMessage="No heatmap data recorded for this assessment."
                  />

                  {/* AI confidence */}
                  {confidence != null ? (
                    <View style={styles.confidenceRow}>
                      <Icon name="verified-user" size={16} color={Colors.secondary} />
                      <Text style={styles.confidenceText}>{`AI CONFIDENCE ${Math.round(confidence)}%`}</Text>
                      <Text style={styles.confidenceModel}>{riskDocResolved.aiMetadata?.modelVersion ?? ''}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.riskUnavailable}>
                  <Icon name="shield" size={22} color={Colors.outline} />
                  <Text style={styles.emptyInlineText2}>
                    {processingAssessment
                      ? `${processingAssessment.assessmentCode} is still processing — injury risk will be available once it completes.`
                      : 'No injury risk result available yet. It is computed when an assessment completes.'}
                  </Text>
                </View>
              )}
            </View>

            {/* Performance Metrics */}
            <Text style={styles.sectionTitle}>Performance Metrics</Text>
            {metricEntries.length > 0 ? (
              <View style={[styles.card, { gap: Spacing.md }]}>
                {metricEntries.map(m => (
                  <BiometricProgressBar
                    key={m.key}
                    label={m.label}
                    value={String(m.value)}
                    percent={Math.max(0, Math.min(100, m.value))}
                    barColor={m.value < 75 ? Colors.error : Colors.secondary}
                    barHeight={8}
                    showShadow={false}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No biomechanical metrics recorded for this athlete yet.</Text>
              </View>
            )}

            {/* Progress */}
            <Text style={styles.sectionTitle}>Progress</Text>
            {completedCount === 0 ? (
              <View style={styles.emptyInline}>
                <Icon name="trending-up" size={26} color={Colors.outline} />
                <Text style={styles.emptyInlineText}>No assessments yet</Text>
              </View>
            ) : completedCount === 1 ? (
              <View style={styles.emptyInline}>
                <Icon name="looks-one" size={26} color={Colors.outline} />
                <Text style={styles.emptyInlineText}>
                  Only one assessment available
                </Text>
                <Text style={styles.emptyInlineSub}>
                  {pTrend[0]?.assessmentCode ? `${pTrend[0].assessmentCode} • Score ${pTrend[0].score ?? '--'} • ${pTrend[0].date ?? ''}` : ''}
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.md }}>
                {/* Previous vs Latest */}
                <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.trendLabel}>PREVIOUS</Text>
                    <Text style={styles.trendValue}>{progressData?.previousScore ?? '--'}</Text>
                  </View>
                  <Icon name="trending-flat" size={26} color={Colors.onSurfaceVariant} />
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.trendLabel}>LATEST</Text>
                    <Text style={[styles.trendValue, { color: Colors.secondary }]}>{progressData?.latestScore ?? '--'}</Text>
                  </View>
                  <View style={[styles.deltaPill, { backgroundColor: (progressData?.scoreDifferential ?? 0) >= 0 ? 'rgba(0,152,68,0.12)' : `${Colors.error}1F` }]}>
                    <Text style={[styles.deltaText, { color: (progressData?.scoreDifferential ?? 0) >= 0 ? '#009844' : Colors.error }]}>
                      {typeof progressData?.scoreDifferential === 'number'
                        ? `${progressData.scoreDifferential >= 0 ? '+' : ''}${progressData.scoreDifferential}`
                        : '--'}
                    </Text>
                  </View>
                </View>

                {/* Score trend */}
                <View style={styles.card}>
                  <Text style={styles.chartCaption}>ASSESSMENT SCORE TREND</Text>
                  <MetricTrendChart data={scoreSeries.data} labels={scoreSeries.labels} height={200} />
                </View>

                {/* Metric trends */}
                {[
                  { label: 'SPEED (m/s)', series: speedSeries },
                  { label: 'POWER (kW/kg)', series: powerSeries },
                  { label: 'MOVEMENT QUALITY', series: mqSeries }
                ].map(m => (
                  <View key={m.label} style={styles.card}>
                    <Text style={styles.chartCaption}>{m.label}</Text>
                    {m.series.count >= 2 ? (
                      <MetricTrendChart data={m.series.data} labels={m.series.labels} height={150} />
                    ) : (
                      <Text style={styles.emptyInlineText2}>
                        {m.series.count === 1 ? 'Only one data point — complete more assessments to see this trend.' : 'No data recorded for this metric yet.'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Assessment History */}
            <Text style={styles.sectionTitle}>Assessment History</Text>
            {history.length === 0 ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No assessment history recorded.</Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {history.length > 1 ? (
                  <Text style={styles.historyHint}>Tap an assessment to view its full details.</Text>
                ) : null}
                {recentHistory.map(h => {
                  const sc = STATUS_COLORS[h.status] ?? Colors.outline;
                  const risk = h.injuryRiskLevel ?? null;
                  const rc = RISK_COLORS[risk] ?? Colors.outline;
                  const viewable = h.status === 'completed';
                  return (
                    <TouchableOpacity
                      key={String(h._id)}
                      style={styles.historyRow}
                      disabled={!viewable}
                      activeOpacity={viewable ? 0.8 : 1}
                      onPress={() => navigation.navigate('AnalysisResults', { assessmentId: h._id })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyCode}>
                          {h.assessmentCode}
                          {viewable ? ' ' : ''}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {[
                            String(h.sport || ''),
                            String(h.testType || '').replace(/_/g, ' '),
                            formatDate(h.createdAt)
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </Text>
                        {h.status === 'completed' && (typeof h.speed === 'number' || typeof h.power === 'number') ? (
                          <Text style={styles.historyMetrics}>
                            {[
                              typeof h.speed === 'number' ? `${h.speed} m/s` : null,
                              typeof h.power === 'number' ? `${h.power} kW/kg` : null
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </Text>
                        ) : null}
                        {h.status !== 'completed' ? (
                          <Text style={styles.historyMetrics}>
                            {h.status === 'failed'
                              ? 'Analysis failed — no results recorded'
                              : PROCESSING_STATUSES.includes(String(h.status))
                                ? 'Processing — results pending'
                                : 'Awaiting analysis'}
                          </Text>
                        ) : null}
                      </View>
                      {risk ? (
                        <View style={[styles.riskPill, { backgroundColor: `${rc}22` }]}>
                          <Text style={[styles.riskPillText, { color: rc }]}>{String(risk).toUpperCase()}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.statusChip, { backgroundColor: `${sc}22` }]}>
                        <Text style={[styles.statusChipText, { color: sc }]}>{String(h.status || '').toUpperCase()}</Text>
                      </View>
                      <Text style={styles.historyScore}>{h.overallScore != null ? h.overallScore : '--'}</Text>
                      {viewable ? (
                        <Icon name="chevron-right" size={18} color={Colors.onSurfaceVariant} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
                {history.length > recentHistory.length ? (
                  <Text style={styles.historyCaption}>
                    Showing the {recentHistory.length} most recent of {history.length} assessments
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  errorText: { ...Typography.bodyMd, color: Colors.error, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  retryText: { ...Typography.labelCaps, color: Colors.onPrimary },
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
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    borderRadius: 16,
    padding: Spacing.md,
    marginTop: Spacing.sm
  },
  heroCardMd: { padding: Spacing.lg },
  avatarLg: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  athleteName: { ...Typography.headlineLg, color: Colors.onSurface },
  athleteMeta: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  athleteAffiliation: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  riskPill: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  riskPillText: { ...Typography.labelCaps, fontSize: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.sm
  },
  bannerText: { ...Typography.bodyMd, color: Colors.onSurface, flex: 1 },
  sectionTitle: { ...Typography.headlineMd, color: Colors.onSurface, marginTop: Spacing.xl, marginBottom: Spacing.md },
  card: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    borderRadius: 16,
    padding: Spacing.md
  },
  codeText: { ...Typography.monoData, fontSize: 15, color: Colors.onSurface },
  cardSub: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 4 },
  statusChip: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  statusChipText: { ...Typography.labelCaps, fontSize: 9 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs
  },
  summaryLabel: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant },
  summaryValue: { fontFamily: 'Geist_700Bold', fontSize: 18, fontWeight: '700', color: Colors.onSurface },
  emptyInline: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: 'center'
  },
  emptyInlineText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
  emptyInlineText2: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    borderRadius: 12,
    padding: Spacing.md
  },
  historyMetrics: { ...Typography.monoData, fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  historyHint: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: Spacing.xs },
  historyCode: { ...Typography.monoData, fontSize: 14, color: Colors.onSurface },
  historyMeta: { ...Typography.bodyMd, fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  historyScore: { fontFamily: 'Geist_700Bold', fontSize: 20, fontWeight: '700', color: Colors.secondary, minWidth: 40, textAlign: 'right' },
  scoreEmpty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  historyCaption: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', paddingTop: Spacing.xs },
  trendLabel: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant, marginBottom: 2 },
  trendValue: { fontFamily: 'Geist_700Bold', fontSize: 26, fontWeight: '700', color: Colors.onSurface },
  deltaPill: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  deltaText: { fontFamily: 'Geist_700Bold', fontSize: 15, fontWeight: '700' },
  chartCaption: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
  emptyInlineSub: { ...Typography.monoData, fontSize: 12, color: Colors.onSurfaceVariant },
  riskProvenance: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginTop: Spacing.sm },
  factorGrid: { marginTop: Spacing.md, gap: Spacing.sm },
  factorRow: { flexDirection: 'row', gap: Spacing.sm },
  factorCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flex: 1
  },
  factorHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  factorTitle: { ...Typography.bodyMd, fontSize: 13, fontWeight: '600', color: Colors.onSurface, flex: 1 },
  factorBadge: { ...Typography.monoData, fontSize: 12, color: Colors.onSurfaceVariant },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.3)'
  },
  confidenceText: { ...Typography.labelCaps, fontSize: 10, color: Colors.secondary },
  confidenceModel: { ...Typography.bodyMd, fontSize: 12, color: Colors.onSurfaceVariant, flex: 1, textAlign: 'right' },
  riskUnavailable: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  riskLoading: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  sessionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLowest
  },
  sessionChipActive: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(87,223,254,0.12)'
  },
  sessionChipText: {
    ...Typography.labelCaps,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.onSurfaceVariant
  },
  sessionChipTextActive: {
    color: Colors.onSurface
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  }
});
