import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import CircularScoreGauge from '../../components/CircularScoreGauge';
import { BodyHeatmap, HeatmapLegend, buildHeatmapSpotsFromAssessment } from '../../components/PostureHeatmap';
import type { SeverityBand } from '../../services/riskVisualization';
import { getProfile, getLatestAssessment, getAssessmentById, getAssessmentHistory } from '../../services/api';
import {
  resolveAssessmentView,
  heatmapStateForView
} from '../../services/assessmentView';
import {
  buildRiskVisualization,
  buildRiskFactors,
  buildRiskInsights,
  buildExerciseList,
  RiskFactorView,
  RiskInsightView,
  ExerciseView
} from '../../services/riskVisualization';

const POSE_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA7j8p7NlraUHdQtInbPd90itWAhI1-i8THBDHNUPzFgAKBjxgJ_P6DxAugRfksr0tx75GYq2zDxH-fyuOOTtJoHTHazf4hSuQBsDJXW4Q01aJjFvpqcSmXFSfgiaRJr6osJvUp5KohAumvIpBN4JX6HP4QT8q4rGmWMtlp3n7Buf-2XU2DPTK2j95qk2vXe7TPYtOtf_Cs4lcpsHIRpwClppGuY4UYbwmA9kLWsPaY99UF1fI-Z61x3h6pOhIQgrklAKQd0skVbKY';

type Insight = {
  icon: 'error' | 'warning' | 'check-circle';
  color: string;
  title: string;
  body: string;
};

/** Semantic tone -> screen icon/color tokens (presentation only). */
const INSIGHT_STYLE: Record<RiskInsightView['tone'], { icon: Insight['icon']; color: string }> = {
  critical: { icon: 'error', color: Colors.error },
  warning: { icon: 'warning', color: Colors.secondary },
  ok: { icon: 'check-circle', color: Colors.secondary }
};

export default function InjuryRiskScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [latest, setLatest] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  /** Selected assessment ID. Null = latest completed assessment. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Monotonic fetch token: a late response from a previous selection
   *  must never overwrite the newly selected assessment (no stale viz). */
  const requestRef = useRef(0);

  // STEP 7: every visualization on this screen belongs to ONE explicitly
  // selected assessment ID. Switching clears the previous document FIRST
  // (loading/error outputs carry no document), then fetches the new one.
  const loadSelection = useCallback(async (id: string | null) => {
    const req = ++requestRef.current;
    setLoading(true);
    setError(null);
    setLatest(null);
    setSelectedSpot(null);
    setActiveBand(null);
    try {
      const [profileRes, histRes] = await Promise.all([getProfile(), getAssessmentHistory()]);
      if (requestRef.current !== req) return;
      setProfile(profileRes?.user || profileRes?.data || null);
      setHistory(Array.isArray(histRes?.data) ? histRes.data.slice(0, 12) : []);
      const docRes = id ? await getAssessmentById(id) : await getLatestAssessment();
      if (requestRef.current !== req) return;
      setLatest(docRes?.data ?? null);
    } catch (e: any) {
      if (requestRef.current !== req) return;
      setError(e);
    } finally {
      if (requestRef.current === req) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSelection(null);
  }, [loadSelection]);

  const selectAssessment = (id: string | null) => {
    setSelectedId(id);
    loadSelection(id);
  };

  // The resolved view is the single source of truth below: `activeDoc` is
  // null in loading/error states, so stale data can never render.
  const view = resolveAssessmentView({ assessment: latest, loading, error });
  const activeDoc = view.assessment;

  // ---- risk data: all mapping lives in the finalized visualization
  // contract (services/riskVisualization); this screen only renders it. ----
  // NOTE: everything derives from `activeDoc` (the resolved selection), so
  // loading/error renders can never show the previous assessment's data.
  // The profile mirror fallback applies ONLY to ready/empty views: a
  // processing/failed/errored selection must never borrow a number that
  // does not belong to it.
  const vizDoc = view.status === 'ready' || view.status === 'empty' ? activeDoc : null;
  const vizProfile = view.status === 'ready' || view.status === 'empty' ? (profile ?? undefined) : undefined;
  // STEP 9: contract runs once per (doc, profile) — not once per render.
  const viz = useMemo(() => buildRiskVisualization(vizDoc, vizProfile), [vizDoc, vizProfile]);
  const riskPct: number | null = viz.overall.percentage;
  const riskLevel: string | null = viz.overall.level;

  const factors: RiskFactorView[] = useMemo(() => buildRiskFactors(activeDoc), [activeDoc]);

  const insights: Insight[] = useMemo(
    () =>
      buildRiskInsights(activeDoc).map(ins => ({
        icon: INSIGHT_STYLE[ins.tone].icon,
        color: INSIGHT_STYLE[ins.tone].color,
        title: ins.title,
        body: ins.body
      })),
    [activeDoc]
  );

  const exercises: ExerciseView[] = useMemo(() => buildExerciseList(activeDoc), [activeDoc]);

  const kinematics = viz.meta.kinematics;
  const hasKinematics =
    kinematics.kneeFlexionAngleDeg !== null || kinematics.spineAngleDeg !== null;

  // Contract-driven heatmap markers for the body diagram (Step 5).
  const heatmapSpots = useMemo(() => buildHeatmapSpotsFromAssessment(activeDoc), [activeDoc]);
  // STEP 6: diagram + overlay legend share one selection/filter state so a
  // legend tap isolates markers and a marker tap shows its joint callout.
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [activeBand, setActiveBand] = useState<SeverityBand | null>(null);

  const grid = (nodes: React.ReactNode[], cols: number, gap: number) => {
    if (cols <= 1) return <View style={{ gap }}>{nodes}</View>;
    const rows: React.ReactNode[][] = [];
    for (let i = 0; i < nodes.length; i += cols) rows.push(nodes.slice(i, i + cols));
    return (
      <View>
        {rows.map((row, ri) => (
          <View
            key={ri}
            style={{ flexDirection: 'row', gap, marginBottom: ri < rows.length - 1 ? gap : 0 }}
          >
            {row.map((node, ci) => (
              <View key={ci} style={{ flex: 1 }}>
                {node}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderFactor = (f: RiskFactorView) => (
    <View key={f.title} style={[styles.factorCard, isMd && { width: '100%' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={styles.factorIconBox}>
          <Icon name={f.icon} size={26} color={Colors.secondary} />
        </View>
        <Text style={styles.factorBadge}>{f.badge}</Text>
      </View>
      <Text style={styles.factorTitle}>{f.title}</Text>
      <Text style={styles.factorBody}>{f.body}</Text>
      <View style={styles.factorTrack}>
        <View style={[styles.factorFill, { width: `${Math.min(Math.max(f.percent, 0), 100)}%` }]} />
      </View>
    </View>
  );

  const renderExercise = (ex: ExerciseView) => (
    <TouchableOpacity key={ex.name} style={[styles.exerciseCard, isMd && { width: '100%' }]} activeOpacity={0.8}>
      <View style={styles.exerciseIconBox}>
        <Icon name="fitness-center" size={26} color={Colors.secondary} />
      </View>
      <View>
        <Text style={styles.exerciseName}>{ex.name}</Text>
        <Text style={styles.exerciseDetail}>{ex.detail}</Text>
      </View>
    </TouchableOpacity>
  );

  const gaugeCard = (
    <View style={[styles.card, isMd && { flex: 1, justifyContent: 'center' }]}>
      <View style={styles.riskTopAccent} />
      <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.outline, textAlign: 'center', marginBottom: Spacing.md }]}>
        OVERALL RISK STATUS
      </Text>
      {riskPct === null ? (
        <View style={styles.gaugeEmpty}>
          <Text style={[styles.riskScore, { fontSize: 44 }]}>--</Text>
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.base }]}>
            {view.status === 'processing'
              ? `Analysis is still running for ${activeDoc?.assessmentCode || 'this assessment'}. Results appear here automatically.`
              : view.status === 'failed'
                ? `Analysis failed${activeDoc?.assessmentCode ? ` for ${activeDoc.assessmentCode}` : ''}. ${typeof activeDoc?.errorDetails?.message === 'string' ? activeDoc.errorDetails.message : ''}`.trim()
                : view.status === 'error'
                  ? 'This assessment could not be loaded.'
                  : 'Complete an assessment to compute injury risk'}
          </Text>
          {view.status === 'empty' ? (
            <TouchableOpacity
              style={styles.emptyBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Assess' })}
            >
              <Text style={styles.emptyBtnText}>Start Assessment</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <CircularScoreGauge size={192} strokeWidth={12} score={riskPct} progressColor={Colors.onTertiaryContainer} rotate>
            <Text style={styles.riskScore}>{riskPct}%</Text>
            <Text style={styles.riskScoreLabel}>PREDICTION SCORE</Text>
          </CircularScoreGauge>
          {riskLevel && (
            <View
              style={[
                styles.lowPill,
                riskLevel === 'High' && styles.highPill,
                riskLevel === 'Moderate' && styles.moderatePill
              ]}
            >
              <Text style={[styles.lowPillText, riskLevel !== 'Low' && { color: Colors.onSurface }]}>{riskLevel}</Text>
            </View>
          )}
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: Spacing.base, marginTop: Spacing.md }]}>
            {activeDoc
              ? `Based on ${activeDoc.testType ? String(activeDoc.testType).replace(/_/g, ' ') : 'your most recent'} assessment ${activeDoc.assessmentCode || ''}`.trim()
              : 'Based on your most recent completed assessment.'}
          </Text>
        </>
      )}
    </View>
  );

  const biometricCard = (
    <View style={[styles.biometricCard, isLg && { flex: 1 }]}>
      <View style={styles.overlayTagWrap}>
        <Text style={styles.overlayTag}>BIOMETRIC OVERLAY</Text>
        <HeatmapLegend
          spots={heatmapSpots}
          overlay
          activeBand={activeBand}
          onSelectBand={setActiveBand}
        />
      </View>
      <View style={styles.metricChipsRow}>
        <View style={styles.metricChip}>
          <Text style={styles.metricChipLabel}>KNEE ANGLE</Text>
          <Text style={styles.metricChipValue}>
            {kinematics.kneeFlexionAngleDeg !== null ? `${kinematics.kneeFlexionAngleDeg}°` : '--'}
          </Text>
        </View>
        <View style={styles.metricChip}>
          <Text style={styles.metricChipLabel}>SPINE ANGLE</Text>
          <Text style={styles.metricChipValue}>
            {kinematics.spineAngleDeg !== null ? `${kinematics.spineAngleDeg}°` : '--'}
          </Text>
        </View>
      </View>
      <View style={styles.poseArea}>
        <BodyHeatmap
          imageUrl={POSE_IMG}
          spots={heatmapSpots}
          state={heatmapStateForView(view.status)}
          errorMessage={
            view.status === 'failed'
              ? (typeof activeDoc?.errorDetails?.message === 'string'
                  ? activeDoc.errorDetails.message
                  : 'Analysis failed for this assessment.')
              : view.errorMessage
          }
          onRetry={view.status === 'error' ? () => loadSelection(selectedId) : undefined}
          emptyMessage={
            !activeDoc
              ? 'COMPLETE AN ASSESSMENT TO SEE YOUR JOINT HEATMAP'
              : 'NO JOINT STRAIN RECORDED FOR THIS ASSESSMENT'
          }
          selectedIndex={selectedSpot}
          onSelectSpot={setSelectedSpot}
          activeBand={activeBand}
          onBandChange={setActiveBand}
        />
      </View>
    </View>
  );

  const insightsCard = (
    <View style={[styles.card, styles.insightsAlign, isLg && { flex: 1 }]}>
      <Text style={[Typography.headlineMd, { fontSize: 20, lineHeight: 26, marginBottom: Spacing.md }]}>
        Preventive Insights
      </Text>
      {insights.length ? (
        <View style={{ gap: Spacing.md }}>
          {insights.map(ins => (
            <View key={ins.title} style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Icon name={ins.icon} size={18} color={ins.color} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>{ins.title}</Text>
                <Text style={styles.insightBody}>{ins.body}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.dashedPlaceholder, { alignSelf: 'stretch' }]}>
          <Text style={styles.emptyBody}>No critical warnings recorded in the selected assessment.</Text>
        </View>
      )}
    </View>
  );

  const STATUS_DOT: Record<string, string> = {
    completed: '#009844',
    failed: Colors.error,
    processing: '#b26a00',
    uploading: Colors.secondary,
    pending: '#b26a00',
    created: '#b26a00'
  };

  // STEP 7: explicit assessment picker. Every chip carries its own ID, so
  // the heatmap below always belongs to the visibly selected assessment.
  const selectorBar = history.length > 0 ? (
    <View style={{ marginBottom: Spacing.xs }}>
      <Text style={[Typography.labelCaps, { color: Colors.onSurfaceVariant, marginBottom: Spacing.xs }]}>
        ASSESSED SESSION
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
        <TouchableOpacity
          testID="assessment-chip-latest"
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === null }}
          style={[styles.sessionChip, selectedId === null && styles.sessionChipActive]}
          activeOpacity={0.8}
          onPress={() => selectAssessment(null)}
        >
          <Text style={[styles.sessionChipText, selectedId === null && styles.sessionChipTextActive]}>
            LATEST
          </Text>
        </TouchableOpacity>
        {history.map((h: any) => {
          const id = String(h._id || h.id || '');
          const code = h.assessmentCode || 'SESSION';
          const active = selectedId === id;
          return (
            <TouchableOpacity
              key={id || code}
              testID={`assessment-chip-${code}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Show injury risk for ${code}, status ${h.status || 'unknown'}`}
              style={[styles.sessionChip, active && styles.sessionChipActive]}
              activeOpacity={0.8}
              onPress={() => selectAssessment(id)}
            >
              <View style={[styles.sessionDot, { backgroundColor: STATUS_DOT[h.status] || Colors.outline }]} />
              <Text style={[styles.sessionChipText, active && styles.sessionChipTextActive]}>
                {code}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  const eliteCard = (
    <View style={styles.eliteCard}>
      <View style={styles.eliteWatermark}>
        <Icon name="medical-services" size={130} color="rgba(255,255,255,0.1)" />
      </View>
      <Text style={[Typography.labelCaps, { color: Colors.secondaryContainer, marginBottom: Spacing.xs }]}>
        TALENTSCOPE AI ELITE
      </Text>
      <Text style={[Typography.headlineMd, { fontSize: 20, lineHeight: 26, marginBottom: Spacing.base }]}>
        Customized Protocols
      </Text>
      <Text style={styles.eliteBody}>
        Unlock medical-grade corrective programs tailored to your specific biomechanical profile.
      </Text>
      <TouchableOpacity
        style={styles.viewExercisesBtn}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
      >
        <Text style={styles.viewExercisesText}>Find a Coach</Text>
      </TouchableOpacity>
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
              {isMd ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.labelCaps, { color: Colors.secondary, marginBottom: Spacing.xs }]}>
                      PERFORMANCE INSIGHTS
                    </Text>
                    <Text style={[Typography.headlineLg, { color: Colors.primary }]}>Injury Risk Analysis</Text>
                    <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: 4, maxWidth: 576 }]}>
                      AI-driven biometric screening of musculoskeletal vulnerabilities and load-bearing fatigue markers.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <TouchableOpacity style={[styles.exportBtn, { flex: 0, paddingHorizontal: Spacing.md }]} activeOpacity={0.85}>
                      <Icon name="download" size={18} color={Colors.onSurface} />
                      <Text style={styles.exportText}>Export Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.consultBtn, { flex: 0, paddingHorizontal: Spacing.md }]}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
                    >
                      <Icon name="support-agent" size={18} color={Colors.onSecondaryContainer} />
                      <Text style={styles.consultText}>Coach Consultation</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[Typography.labelCaps, { color: Colors.secondary, marginBottom: Spacing.xs }]}>
                    PERFORMANCE INSIGHTS
                  </Text>
                  <Text style={[Typography.headlineLgMobile, { color: Colors.primary }]}>Injury Risk Analysis</Text>
                  <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: 4 }]}>
                    AI-driven biometric screening of musculoskeletal vulnerabilities and load-bearing fatigue markers.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                    <TouchableOpacity style={styles.exportBtn} activeOpacity={0.85}>
                      <Icon name="download" size={18} color={Colors.onSurface} />
                      <Text style={styles.exportText}>Export Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.consultBtn}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
                    >
                      <Icon name="support-agent" size={18} color={Colors.onSecondaryContainer} />
                      <Text style={styles.consultText}>Coach Consultation</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            <View style={{ paddingHorizontal: padH, gap: Spacing.gutter }}>
              {view.status === 'error' && (
                <View style={styles.errorBanner}>
                  <Icon name="error-outline" size={18} color={Colors.error} />
                  <Text style={styles.errorText}>{view.errorMessage}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => loadSelection(selectedId)} activeOpacity={0.85}>
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectorBar}

              {isMd ? (
                <>
                  <View style={{ flexDirection: 'row', gap: Spacing.gutter, alignItems: 'stretch' }}>
                    <View style={{ flex: isLg ? 4 : 5 }}>{gaugeCard}</View>
                    <View style={{ flex: isLg ? 8 : 7 }}>
                      {factors.length ? (
                        grid(factors.map(renderFactor), 2, Spacing.gutter)
                      ) : (
                        <View style={[styles.card, { justifyContent: 'center' }]}>
                          <Text style={styles.emptyBody}>No injury risk breakdown available yet.</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {isLg ? (
                    <View style={{ flexDirection: 'row', gap: Spacing.gutter, alignItems: 'stretch' }}>
                      <View style={{ flex: 8 }}>{biometricCard}</View>
                      <View style={{ flex: 4, gap: Spacing.gutter }}>
                        {insightsCard}
                        {eliteCard}
                      </View>
                    </View>
                  ) : (
                    <>
                      {biometricCard}
                      <View style={{ gap: Spacing.gutter }}>
                        {insightsCard}
                        {eliteCard}
                      </View>
                    </>
                  )}

                  {exercises.length > 0 && (
                    <View style={{ marginTop: Spacing.base }}>
                      {grid(exercises.map(renderExercise), 3, Spacing.gutter)}
                    </View>
                  )}
                </>
              ) : (
                <>
                  {gaugeCard}

                  {factors.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.gutter }}>
                      {factors.map(renderFactor)}
                    </View>
                  ) : (
                    <View style={styles.dashedPlaceholder}>
                      <Text style={styles.emptyBody}>No injury risk breakdown available yet.</Text>
                    </View>
                  )}

                  {biometricCard}

                  <View style={{ gap: Spacing.gutter }}>
                    {insightsCard}
                    {eliteCard}
                  </View>

                  {exercises.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.gutter, marginTop: Spacing.base }}>
                      {exercises.map(renderExercise)}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
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
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 8,
    paddingVertical: Spacing.sm
  },
  exportText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  consultBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 8,
    paddingVertical: Spacing.sm
  },
  consultText: { fontFamily: 'Inter_700Bold', fontSize: 14, fontWeight: '700', color: Colors.onSecondaryContainer },
  card: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4
  },
  insightsAlign: { alignItems: 'flex-start' },
  riskTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Colors.onTertiaryContainer
  },
  riskScore: { ...Typography.displayHero, fontSize: 44, lineHeight: 50, letterSpacing: -1.6, color: Colors.primary },
  riskScoreLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginTop: Spacing.xs },
  gaugeEmpty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8
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
  },
  retryBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: 6
  },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700', color: '#ffffff' },
  lowPill: {
    backgroundColor: 'rgba(0,152,68,0.1)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    marginTop: Spacing.sm
  },
  moderatePill: { backgroundColor: 'rgba(230,179,25,0.15)' },
  highPill: { backgroundColor: 'rgba(186,26,26,0.12)' },
  lowPillText: { ...Typography.headlineMd, fontSize: 20, lineHeight: 26, fontWeight: '700', color: Colors.onTertiaryContainer },
  factorCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3
  },
  factorIconBox: {
    padding: Spacing.base,
    borderRadius: 10,
    backgroundColor: 'rgba(87,223,254,0.2)'
  },
  factorBadge: { ...Typography.monoData, color: Colors.onTertiaryContainer },
  factorTitle: { ...Typography.headlineMd, fontSize: 19, lineHeight: 25, marginTop: Spacing.base, marginBottom: Spacing.xs },
  factorBody: { ...Typography.bodyMd, fontSize: 13, lineHeight: 20, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
  factorTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden'
  },
  factorFill: { height: '100%', backgroundColor: Colors.onTertiaryContainer, borderRadius: 999 },
  biometricCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4
  },
  overlayTagWrap: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm
  },
  overlayTag: {
    ...Typography.labelCaps,
    fontSize: 10,
    color: Colors.outline,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.25)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 6
  },
  metricChipsRow: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    zIndex: 10,
    flexDirection: 'row',
    gap: Spacing.sm
  },
  metricChip: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.25)',
    borderRadius: 6,
    padding: Spacing.sm
  },
  metricChipLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.outline },
  metricChipValue: { ...Typography.headlineMd, fontSize: 18, lineHeight: 24, color: Colors.primary, marginTop: 2 },
  poseArea: { flex: 1, backgroundColor: Colors.surfaceContainer },
  insightTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700', color: Colors.primary },
  insightBody: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  eliteCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8
  },
  eliteWatermark: { position: 'absolute', right: -32, bottom: -32, transform: [{ rotate: '12deg' }] },
  eliteBody: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.7)', maxWidth: 240 },
  viewExercisesBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
    marginTop: Spacing.lg
  },
  viewExercisesText: { fontFamily: 'Inter_700Bold', fontSize: 14, fontWeight: '700', color: Colors.onSecondaryContainer },
  exerciseCard: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    padding: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3
  },
  exerciseIconBox: {
    width: 72,
    height: 72,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(87,223,254,0.2)'
  },
  exerciseName: { fontFamily: 'Inter_700Bold', fontSize: 14, fontWeight: '700', color: Colors.primary, flexShrink: 1 },
  exerciseDetail: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  emptyBody: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant, textAlign: 'center' }
});
