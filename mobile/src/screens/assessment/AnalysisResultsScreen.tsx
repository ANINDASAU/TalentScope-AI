import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import CircularScoreGauge from '../../components/CircularScoreGauge';
import BiometricProgressBar from '../../components/BiometricProgressBar';
import PostureHeatmap, { HeatmapSpot, PostureFinding, buildHeatmapSpotsFromAssessment as buildHeatmapSpots, buildFindingsFromAssessment as buildFindings } from '../../components/PostureHeatmap';
import {
  getAssessmentById,
  getLatestAssessment,
  saveAssessmentResults,
  markAssessmentCompleted
} from '../../services/api';
import { deleteVideoForServerId } from '../../services/storageManager';
import { useIsOnline } from '../../hooks/useConnectivity';

const PROCESSING_STATUSES = ['created', 'pending', 'uploading', 'processing'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  created: { bg: 'rgba(198,198,205,0.3)', text: Colors.onSurfaceVariant },
  pending: { bg: 'rgba(198,198,205,0.3)', text: Colors.onSurfaceVariant },
  uploading: { bg: 'rgba(87,223,254,0.2)', text: Colors.secondaryFixedDim },
  processing: { bg: 'rgba(87,223,254,0.2)', text: Colors.secondaryFixedDim },
  completed: { bg: 'rgba(74,225,118,0.2)', text: Colors.onTertiaryContainer },
  failed: { bg: 'rgba(186,26,26,0.15)', text: Colors.error }
};

const formatValue = (v: any): string =>
  v === null || v === undefined || v === '' ? '--' : String(v);

const formatDate = (iso: any): string => {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const clampPercent = (v: any): number => {
  const n = typeof v === 'number' && !Number.isNaN(v) ? v : 0;
  return Math.min(Math.max(n, 0), 100);
};

const buildBiometrics = (a: any) => {
  const b = a?.biometricsBreakdown || {};
  const pctRow = (label: string, v: any) => ({
    label,
    value: typeof v === 'number' ? `${Math.round(v)}%` : '--',
    unit: '',
    percent: clampPercent(v),
    bar: clampPercent(v) < 75 ? Colors.error : Colors.secondary
  });
  return [
    pctRow('Movement Quality', b.movementQuality),
    pctRow('Joint Alignment', b.jointAlignment),
    pctRow('Landing Mechanics', b.landingMechanics),
    pctRow('Balance Stability', b.balanceStability),
    {
      label: 'Speed (Sprint)',
      value: typeof b.sprintSpeed === 'number' ? String(b.sprintSpeed) : '--',
      unit: 'm/s',
      percent: clampPercent(typeof b.sprintSpeed === 'number' ? b.sprintSpeed * 10 : 0),
      bar: Colors.onTertiaryContainer
    },
    {
      label: 'Power Output',
      value: typeof b.powerOutput === 'number' ? String(b.powerOutput) : '--',
      unit: 'kW/kg',
      percent: clampPercent(typeof b.powerOutput === 'number' ? b.powerOutput * 50 : 0),
      bar: Colors.onTertiaryContainer
    },
    pctRow('Endurance Index', b.enduranceIndex),
    pctRow('Core Tension', b.coreTension)
  ];
};

const REC_ICONS: Record<string, any> = {
  High: 'priority-high',
  Medium: 'fitness-center',
  Low: 'alt-route'
};

export default function AnalysisResultsScreen({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const online = useIsOnline();

  const assessmentIdParam: string | undefined = route?.params?.assessmentId;
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  /** STEP 7 race guard: a late response for a previous assessment ID must
   *  never overwrite the newly selected one. */
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const req = ++requestRef.current;
    try {
      setLoadError(null);
      let data: any = null;
      if (assessmentIdParam) {
        const res = await getAssessmentById(assessmentIdParam);
        data = res?.data ?? null;
      } else {
        const res = await getLatestAssessment();
        data = res?.data ?? null;
      }
      if (requestRef.current !== req) return;
      setAssessment(data);
    } catch (e) {
      if (requestRef.current !== req) return;
      // Clear any previous document: error outputs carry no stale data.
      setAssessment(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load assessment');
    } finally {
      if (requestRef.current === req) setLoading(false);
    }
  }, [assessmentIdParam]);

  useEffect(() => {
    setLoading(true);
    // STEP 7: never display the previous assessment while the newly
    // selected one is loading (covers ID changes and manual reloads).
    setAssessment(null);
    setFinalizeError(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!assessment || !PROCESSING_STATUSES.includes(assessment.status)) return undefined;
    // Poll only while actually processing AND reachable: an offline tab
    // burns battery retrying a request that cannot succeed (STEP 9).
    if (!online) return undefined;
    const interval = setInterval(() => {
      load();
    }, 5000);
    return () => clearInterval(interval);
  }, [assessment, load, online]);

  const finalizeReview = async () => {
    if (!assessment?._id || finalizing) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await saveAssessmentResults(assessment._id, {
        status: 'completed',
        recommendations: [],
        criticalWarnings: [],
        heatmapSpots: [],
        aiMetadata: {
          confidenceScore: 0,
          modelVersion: 'manual-review',
          analysisTimestamp: new Date().toISOString()
        }
      });
      await markAssessmentCompleted(assessment._id);
      // Fully synchronized: the server just confirmed completion, so cleanup
      // is allowed — drop the queue entry and remove the local video file
      // (no longer required after confirmed completion)
      try {
        await deleteVideoForServerId(assessment._id, { confirmCompleted: true });
      } catch {}
      await load();
    } catch (e) {
      setFinalizeError(e instanceof Error ? e.message : 'Failed to finalize review');
    } finally {
      setFinalizing(false);
    }
  };

  const goToAssessTab = () => {
    navigation.navigate('MainTabs', { screen: 'Assess' });
  };

  const status = assessment?.status;
  const isProcessing = !!assessment && PROCESSING_STATUSES.includes(status);
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';
  const statusColors = STATUS_COLORS[status] || STATUS_COLORS.created;
  const overallScore = typeof assessment?.overallScore === 'number' ? assessment.overallScore : null;
  const comparison =
    typeof assessment?.previousScoreComparison === 'number' && assessment.previousScoreComparison !== 0
      ? assessment.previousScoreComparison
      : null;
  // STEP 9: contract runs once per document — declared BEFORE the early
  // returns below (hooks must run unconditionally), not once per render.
  const heatmapSpots = useMemo(() => buildHeatmapSpots(assessment), [assessment]);
  const findings = useMemo(() => buildFindings(assessment), [assessment]);

  if (loading && !assessment) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centeredText}>Loading assessment…</Text>
      </View>
    );
  }

  if (!assessment) {
    // STEP 7: a targeted ID that fails (invalid, not found, unauthorized,
    // API failure) is "unavailable" — distinct from having no assessments.
    const targeted = !!assessmentIdParam;
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingHorizontal: padH }]}>
          <Text style={styles.brand}>TalentScope AI</Text>
        </View>
        <View style={[styles.centered, { paddingHorizontal: padH }]}>
          <Icon name={targeted ? 'error-outline' : 'insights'} size={64} color={targeted ? Colors.error : Colors.onSurfaceVariant} />
          <Text style={[Typography.headlineLgMobile, { color: targeted ? Colors.error : Colors.primary, marginTop: Spacing.md }]}>
            {targeted ? 'Assessment unavailable' : 'No assessments yet'}
          </Text>
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm }]}>
            {targeted
              ? (loadError || 'This assessment could not be loaded.')
              : 'Start your first assessment session to see performance analysis here.'}
          </Text>
          <TouchableOpacity style={styles.primaryActionBtn} activeOpacity={0.85} onPress={goToAssessTab}>
            <Text style={styles.primaryActionText}>GO TO ASSESSMENT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const headerMeta = (
    <>
      <View>
        <Text style={[isMd ? Typography.headlineLg : Typography.headlineLgMobile, { color: Colors.primary }]}>
          Performance Analysis Results
        </Text>
        <Text style={[Typography.bodyLg, { fontSize: 16, color: Colors.onSurfaceVariant }]}>
          Session ID: #{formatValue(assessment.assessmentCode)} • Created {formatDate(assessment.createdAt)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm }}>
          <View style={[styles.statusChip, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusText, { color: statusColors.text }]}>{String(status || 'unknown').toUpperCase()}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: 'rgba(198,198,205,0.25)' }]}>
            <Text style={[styles.statusText, { color: Colors.onSurfaceVariant }]}>
              {formatValue(assessment.sport)} • {formatValue(assessment.testType).replace(/_/g, ' ')}
            </Text>
          </View>
          {isCompleted ? (
            <View style={[styles.statusChip, { backgroundColor: 'rgba(198,198,205,0.25)' }]}>
              <Text style={[styles.statusText, { color: Colors.onSurfaceVariant }]}>
                Completed {formatDate(assessment.completedAt)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {!isProcessing && !isFailed ? (
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <TouchableOpacity style={[styles.shareBtn, isMd && { flexGrow: 0 }]} activeOpacity={0.85}>
            <Icon name="share" size={18} color={Colors.onSurface} />
            <Text style={styles.shareText}>Share Results</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.downloadBtn, isMd && { flexGrow: 0 }]} activeOpacity={0.85}>
            <Icon name="download" size={18} color="#ffffff" />
            <Text style={styles.downloadText}>Download Report</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  if (isProcessing) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingHorizontal: padH }]}>
          <Text style={styles.brand}>TalentScope AI</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.pageHeader, { paddingHorizontal: padH }, isMd && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
            {headerMeta}
          </View>
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX, paddingHorizontal: padH }}>
            <View style={styles.card}>
              <ActivityIndicator size="large" color={Colors.secondaryFixedDim} />
              <Text style={[Typography.headlineMd, { color: Colors.primary, marginTop: Spacing.lg, textAlign: 'center' }]}>
                Analysis in progress
              </Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.sm }]}>
                Assessment {formatValue(assessment.assessmentCode)} is currently{' '}
                <Text style={{ fontWeight: '700' }}>{formatValue(status)}</Text>. This screen refreshes automatically.
              </Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.md }]}>
                No automated analysis pipeline is connected yet. Once you have reviewed the recorded session, finalize
                it below — this stores a real completed record in the database.
              </Text>
              <View style={{ marginTop: Spacing.lg }}>
                <PostureHeatmap state="processing" spots={[]} findings={[]} height={320} />
              </View>
              {finalizeError ? <Text style={styles.inlineError}>{finalizeError}</Text> : null}
              <TouchableOpacity
                style={[styles.finalizeBtn, finalizing && styles.disabledBtn]}
                activeOpacity={0.85}
                disabled={finalizing}
                onPress={finalizeReview}
              >
                {finalizing ? (
                  <ActivityIndicator size="small" color={Colors.onPrimary} />
                ) : (
                  <Icon name="task-alt" size={20} color={Colors.onPrimary} />
                )}
                <Text style={styles.finalizeBtnText}>{finalizing ? 'FINALIZING…' : 'FINALIZE REVIEW'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryLink} disabled={finalizing} onPress={goToAssessTab}>
                <Text style={styles.secondaryLinkText}>Start another assessment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isFailed) {
    const errDetails = assessment.errorDetails || {};
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingHorizontal: padH }]}>
          <Text style={styles.brand}>TalentScope AI</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.pageHeader, { paddingHorizontal: padH }, isMd && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }]}>
            {headerMeta}
          </View>
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX, paddingHorizontal: padH }}>
            <View style={[styles.card, { alignItems: 'flex-start' }]}>
              <Icon name="error-outline" size={48} color={Colors.error} />
              <Text style={[Typography.headlineMd, { color: Colors.error, marginTop: Spacing.md }]}>
                Assessment failed
              </Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                Code: {formatValue(errDetails.code)}
              </Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
                {formatValue(errDetails.message)}
              </Text>
              {errDetails.failedStep ? (
                <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
                  Failed step: {formatValue(errDetails.failedStep)} • {formatDate(errDetails.occurredAt)}
                </Text>
              ) : null}
              <View style={{ marginTop: Spacing.lg, alignSelf: 'stretch' }}>
                <PostureHeatmap
                  state="error"
                  spots={[]}
                  findings={[]}
                  height={320}
                  errorMessage={formatValue(errDetails.message)}
                  onRetry={load}
                />
              </View>
              <TouchableOpacity style={[styles.finalizeBtn, { marginTop: Spacing.lg }]} activeOpacity={0.85} onPress={goToAssessTab}>
                <Icon name="refresh" size={20} color={Colors.onPrimary} />
                <Text style={styles.finalizeBtnText}>START A NEW ASSESSMENT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const biometrics = buildBiometrics(assessment);
  const recommendations = Array.isArray(assessment.recommendations) ? assessment.recommendations : [];
  const aiInsights = Array.isArray(assessment.aiInsights) ? assessment.aiInsights.filter(Boolean) : [];

  const scoreCard = (
    <View style={[styles.card, { alignItems: 'center' }]}>
      <Text style={[Typography.labelCaps, { color: Colors.onSurfaceVariant, marginBottom: Spacing.md }]}>
        OVERALL PERFORMANCE
      </Text>
      <CircularScoreGauge size={192} strokeWidth={10} score={clampPercent(overallScore)}>
        <Text style={styles.scoreNumber}>{overallScore === null ? '--' : Math.round(overallScore)}</Text>
        <Text style={styles.scoreMax}>/ 100</Text>
      </CircularScoreGauge>
      {comparison !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md }}>
          <Icon
            name={comparison >= 0 ? 'trending-up' : 'trending-down'}
            size={14}
            color={comparison >= 0 ? Colors.onTertiaryContainer : Colors.error}
          />
          <Text
            style={[
              styles.deltaText,
              comparison < 0 && { color: Colors.error }
            ]}
          >
            {`${comparison >= 0 ? '+' : ''}${comparison}% from last session`}
          </Text>
        </View>
      ) : (
        <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.md }]}>
          No comparison data yet
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.metaValue}>{formatValue(assessment.percentileRank)}</Text>
          <Text style={styles.metaLabel}>PERCENTILE</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.metaValue}>{typeof assessment.speed === 'number' ? `${assessment.speed} m/s` : '--'}</Text>
          <Text style={styles.metaLabel}>SPEED</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.metaValue}>{typeof assessment.power === 'number' ? `${assessment.power} kW/kg` : '--'}</Text>
          <Text style={styles.metaLabel}>POWER</Text>
        </View>
      </View>
    </View>
  );

  const biometricsCard = (
    <View style={[styles.card, isMd && { backgroundColor: Colors.surfaceContainerLowest }]}>
      <Text style={[Typography.labelCaps, { color: Colors.onSurfaceVariant, marginBottom: Spacing.lg }]}>
        DETAILED BIOMETRICS
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
        {biometrics.map(b => (
          <View key={b.label} style={[{ width: '47%', flexGrow: 1 }, isMd && { width: undefined, flex: 1 }]}>
            <BiometricProgressBar
              label={b.label}
              value={b.value}
              unit={b.unit || undefined}
              unitColor={Colors.onSurfaceVariant}
              percent={b.percent}
              barColor={b.bar}
              barHeight={4}
            />
          </View>
        ))}
      </View>
    </View>
  );

  const heatmapCard = (
    <View style={[styles.card, { padding: Spacing.md }]}>
      <Text style={[Typography.labelCaps, { color: Colors.onSurfaceVariant, marginBottom: Spacing.md }]}>
        POSTURE ERROR HEATMAP
      </Text>
      <PostureHeatmap
        key={assessment._id || assessment.assessmentCode}
        state={
          isProcessing ? 'processing'
          : isFailed || loadError ? 'error'
          : 'ready'
        }
        errorMessage={loadError}
        onRetry={load}
        emptyMessage="No heatmap data recorded for this session."
        height={isMd ? 400 : 420}
        spots={heatmapSpots}
        findings={findings}
      />
    </View>
  );

  const recommendationsCard = (
    <View style={styles.recommendationsCard}>
      <View style={styles.glowBlob} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg }}>
        <Icon name="psychology" size={22} color={Colors.secondaryContainer} />
        <Text style={[Typography.labelCaps, { color: Colors.secondaryFixed }]}>AI RECOMMENDATIONS</Text>
      </View>
      {recommendations.length > 0 ? (
        <View style={{ gap: Spacing.md }}>
          {recommendations.map((r: any, i: number) => (
            <View key={`${r.title}-${i}`} style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View style={styles.recIconBox}>
                <Icon name={REC_ICONS[r.priority] || 'fitness-center'} size={20} color={Colors.onPrimaryContainer} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recTitle}>
                  {formatValue(r.title)}
                  {r.sets || r.reps ? ` (${[r.sets, r.reps].filter(Boolean).join(' · ')})` : ''}
                </Text>
                <Text style={styles.recBody}>{formatValue(r.desc)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[Typography.bodyMd, { color: Colors.onPrimaryContainer }]}>
          No recommendations recorded for this session yet.
        </Text>
      )}
      {aiInsights.length > 0 ? (
        <View style={{ marginTop: Spacing.lg }}>
          <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.secondaryFixed, marginBottom: Spacing.sm }]}>
            INSIGHTS
          </Text>
          {aiInsights.map((s: string, i: number) => (
            <Text key={i} style={[Typography.bodyMd, { fontSize: 13, color: Colors.onPrimaryContainer, marginTop: 4 }]}>
              • {s}
            </Text>
          ))}
        </View>
      ) : null}
      {hasInjuryRisk(assessment) ? (
        <View style={{ marginTop: Spacing.lg }}>
          <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.secondaryFixed, marginBottom: Spacing.sm }]}>
            INJURY RISK
          </Text>
          <Text style={[Typography.bodyMd, { fontSize: 14, fontWeight: '700', color: '#ffffff' }]}>
            {formatValue(assessment.injuryRiskClassification.riskStatus)} ·{' '}
            {typeof assessment.injuryRiskClassification.riskPercentage === 'number'
              ? `${assessment.injuryRiskClassification.riskPercentage}%`
              : '--'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <Text style={styles.brand}>TalentScope AI</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.pageHeader,
            { paddingHorizontal: padH },
            isMd && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }
          ]}
        >
          {headerMeta}
        </View>

        <View
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: CONTAINER_MAX,
            paddingHorizontal: padH,
            gap: Spacing.gutter
          }}
        >
          {isMd ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: Spacing.gutter }}>
                <View style={{ flex: 1 }}>{scoreCard}</View>
                <View style={{ flex: 2 }}>{biometricsCard}</View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: Spacing.gutter }}>
                <View style={{ flex: 7 }}>{heatmapCard}</View>
                <View style={{ flex: 5 }}>{recommendationsCard}</View>
              </View>
            </>
          ) : (
            <>
              {scoreCard}
              {biometricsCard}
              {heatmapCard}
              {recommendationsCard}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const hasInjuryRisk = (a: any): boolean => {
  const r = a?.injuryRiskClassification;
  return !!r && typeof r === 'object' && (r.riskStatus !== undefined || r.riskPercentage !== undefined);
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  centeredText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginTop: Spacing.md },
  inlineError: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.md
  },
  primaryActionBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base
  },
  primaryActionText: { ...Typography.labelCaps, letterSpacing: 2.2, color: Colors.onPrimary },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4
  },
  statusText: { ...Typography.labelCaps, fontSize: 10, letterSpacing: 1.2 },
  header: {
    paddingTop: 44,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.marginMobile,
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  brand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary },
  pageHeader: {
    paddingHorizontal: Spacing.marginMobile,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md
  },
  shareBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base
  },
  shareText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.onSurface },
  downloadBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base
  },
  downloadText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#ffffff' },
  card: {
    backgroundColor: Glass.backgroundColor,
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
  emptySection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl
  },
  finalizeBtn: {
    marginTop: Spacing.xl,
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base
  },
  finalizeBtnText: { ...Typography.labelCaps, letterSpacing: 2.2, color: Colors.onPrimary },
  disabledBtn: { opacity: 0.6 },
  secondaryLink: { marginTop: Spacing.md, alignSelf: 'center', padding: Spacing.xs },
  secondaryLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, fontWeight: '600', color: Colors.primary },
  scoreNumber: { ...Typography.displayHero, color: Colors.onSurface },
  scoreMax: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant },
  metaValue: { ...Typography.headlineMd, fontSize: 16, lineHeight: 22, color: Colors.onSurface },
  metaLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginTop: 2 },
  deltaText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.onTertiaryContainer },
  recommendationsCard: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 12,
    padding: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6
  },
  glowBlob: {
    position: 'absolute',
    top: -32,
    right: -32,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.secondary,
    opacity: 0.2
  },
  recIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(224,227,229,0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: '#ffffff' },
  recBody: { fontSize: 13, lineHeight: 19, color: Colors.onPrimaryContainer, marginTop: 4 }
});
