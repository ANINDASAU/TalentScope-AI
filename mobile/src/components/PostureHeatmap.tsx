import React, { useId, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity
} from 'react-native';
import Svg, { Line, Circle, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../theme/colors';
import {
  buildRiskVisualization,
  BAND_COLORS,
  BAND_LABELS,
  RiskVisualizationData,
  SeverityBand
} from '../services/riskVisualization';

/**
 * Back-compat view-model shapes consumed by this component's call-sites.
 * Everything is produced by the finalized contract (riskVisualization.ts):
 * no mock/default risk data lives here anymore.
 */
export interface HeatmapSpot {
  cx: number;
  cy: number;
  severity: SeverityBand; // 'low' | 'watch' | 'critical'
  pulse?: boolean;
  joint?: string;
  strainScore?: number;
  /** warningType titles from the contract that mention this joint (verbatim). */
  linkedWarningTitles?: string[];
}

export interface PostureFinding {
  tagColor: string;
  tagText: string;
  title: string;
  description: string;
}

export type BodyHeatmapStatus = 'ready' | 'loading' | 'processing' | 'error';

interface PostureHeatmapProps {
  imageUrl?: string;
  spots?: HeatmapSpot[];
  findings?: PostureFinding[];
  height?: number;
  /** Diagram state overlay. Defaults to 'ready'. */
  state?: BodyHeatmapStatus;
  /** Shown when state === 'error'. */
  errorMessage?: string | null;
  /** Retry action for the error overlay. */
  onRetry?: () => void;
  /** Empty-state caption override (ready + no spots). */
  emptyMessage?: string;
  /** Show the severity legend under the diagram. Defaults to true. */
  showLegend?: boolean;
}

const GLOW_RADIUS: Record<SeverityBand, number> = {
  critical: 8,
  watch: 6,
  low: 4
};

const DOT_RADIUS: Record<SeverityBand, number> = {
  critical: 2.5,
  watch: 2,
  low: 1.5
};

export interface HeatmapLegendItem {
  band: SeverityBand;
  label: string;
  color: string;
  count: number;
}

/**
 * Pure legend derivation: one row per severity band present in the spots.
 * Bands with zero markers are omitted (no "×0" noise).
 */
export const buildLegendItems = (spots: HeatmapSpot[]): HeatmapLegendItem[] => {
  const list = Array.isArray(spots) ? spots : [];
  return (['critical', 'watch', 'low'] as SeverityBand[])
    .map(band => ({
      band,
      label: BAND_LABELS[band],
      color: BAND_COLORS[band],
      count: list.filter(s => s.severity === band).length
    }))
    .filter(item => item.count > 0);
};

/* ---------------------------------------------------------------------------
 * STEP 6 — interaction view-models (pure; selection itself is view state).
 * ------------------------------------------------------------------------- */

/** Stable per-render key for a marker: joint + position + index, so two
 *  markers on the same joint (or unlabeled joints) never collide. */
export const getSpotKey = (spot: HeatmapSpot, index: number): string =>
  `${spot?.joint ?? 'unlabeled'}@${Math.round(spot?.cx ?? 0)}x${Math.round(spot?.cy ?? 0)}::${index}`;

export interface SpotDetailView {
  key: string;
  /** Joint label, honest fallback when the backend sent none. */
  title: string;
  /** e.g. "62/100", "--/100" when the backend sent no score. */
  scoreText: string;
  band: SeverityBand;
  bandLabel: string;
  bandColor: string;
  /** Verbatim linked warning titles from the contract (may be empty). */
  linkedWarningTitles: string[];
}

/** Callout content for a tapped marker — data display only, no computation. */
export const buildSpotDetail = (spot: HeatmapSpot, index: number): SpotDetailView => ({
  key: getSpotKey(spot, index),
  title: spot?.joint ?? 'Unlabeled joint',
  scoreText: typeof spot?.strainScore === 'number' ? `${Math.round(spot.strainScore)}/100` : '--/100',
  band: spot.severity,
  bandLabel: BAND_LABELS[spot.severity],
  bandColor: BAND_COLORS[spot.severity],
  linkedWarningTitles: Array.isArray(spot?.linkedWarningTitles)
    ? spot.linkedWarningTitles.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : []
});

/** Legend tap-toggle: tapping the active band clears the filter. */
export const toggleBand = (
  activeBand: SeverityBand | null,
  band: SeverityBand
): SeverityBand | null => (activeBand === band ? null : band);

/** Controlled-or-uncontrolled state hook shared by diagram + legend.
 *  The setter identity is stable (useCallback) so memoized children that
 *  receive it don't re-render on parent state changes (STEP 9). */
function useControlled<T>(controlled: T | undefined, initial: T): [T, (v: T) => void] {
  const [internal, setInternal] = useState<T>(initial);
  const set = React.useCallback((v: T) => setInternal(v), []);
  return [controlled !== undefined ? controlled : internal, set];
}

/**
 * Severity legend row. Renders nothing when no markers exist.
 * Rows are tappable: selecting a band isolates its markers in the diagram.
 */
export function HeatmapLegend({
  spots,
  overlay = false,
  activeBand = null,
  onSelectBand
}: {
  spots: HeatmapSpot[];
  overlay?: boolean;
  activeBand?: SeverityBand | null;
  onSelectBand?: (band: SeverityBand | null) => void;
}) {
  const items = useMemo(() => buildLegendItems(spots), [spots]);
  if (items.length === 0) return null;
  return (
    <View style={[styles.legendRow, overlay && styles.legendRowOverlay]}>
      {items.map(item => {
        const active = activeBand === item.band;
        return (
          <TouchableOpacity
            key={item.band}
            testID={`heatmap-legend-${item.band}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Isolate ${item.label} markers, ${item.count}`}
            activeOpacity={0.7}
            onPress={() => onSelectBand?.(toggleBand(activeBand ?? null, item.band))}
            style={[styles.legendItem, active && { backgroundColor: `${item.color}2e`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}
          >
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendText, overlay && styles.legendTextOverlay]}>
              {`${item.label} ×${item.count}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const BONES: Array<[number, number, number, number, string?]> = [
  [50, 20, 50, 60],
  [50, 60, 35, 100],
  [50, 60, 65, 100],
  [35, 100, 35, 160, 'dash'],
  [65, 100, 65, 160]
];

/** Stable empty array for the no-hit-targets path (no per-render alloc). */
const EMPTY_TARGETS: Array<{ index: number; spot: HeatmapSpot; left: number; top: number; size: number }> = [];

const DEFAULT_BODY_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuANgj0jkdtaUH_izPbl9zsISt5xS__REbAj4fCzlQ8kQlfM4FkvQSJRy-tEx8tDZ0a2LbRtD9o9Pnn-Ok6l_QhXsb8qxxoHqlxyKnPCq8v9XiU0WPcRI-mCiFVq5hY4Urc0AxJ4UA6AQ8sDnC067qiwvlurOCQMMMtRxk10TYTCFlgv8oXGEt5GO7S9mz2SfgHr-c4Kzbv1S_ic2JA736AONkjIAYuKzMpLSyXzfE8DFAx3_Uuf6RGhSHKdn416c1jtwoidkD6LoCY';

interface BodyHeatmapProps {
  imageUrl?: string;
  spots?: HeatmapSpot[];
  /** Fixed diagram height. Omit to flex-fill the parent. */
  height?: number;
  state?: BodyHeatmapStatus;
  errorMessage?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  /** Controlled selection (marker index). Omit for uncontrolled. */
  selectedIndex?: number | null;
  /** Fires on marker tap (index) and on dismiss (null). */
  onSelectSpot?: (index: number | null) => void;
  /** Controlled band isolate filter. Omit for uncontrolled. */
  activeBand?: SeverityBand | null;
  /** Fires on legend/filter band change. */
  onBandChange?: (band: SeverityBand | null) => void;
}

/**
 * Diagram-only heatmap: body image + fixed skeleton + severity-proportional
 * heat glow + risk dots, with loading/processing/error/empty overlays.
 * STEP 6: markers are tappable (detail callout), bands are isolatable
 * (non-matching markers dim). Selection is view state only — the
 * underlying contract data is never altered.
 * Used standalone (compact embed) and inside the full PostureHeatmap card.
 */
export function BodyHeatmap({
  imageUrl = DEFAULT_BODY_IMAGE,
  spots,
  height,
  state = 'ready',
  errorMessage,
  onRetry,
  emptyMessage = 'NO JOINT STRAIN DATA',
  selectedIndex: controlledSelection,
  onSelectSpot,
  activeBand: controlledBand,
  onBandChange
}: BodyHeatmapProps) {
  const rawId = useId();
  const gid = useMemo(() => String(rawId).replace(/[^a-zA-Z0-9_-]/g, ''), [rawId]);
  const safeSpots: HeatmapSpot[] = Array.isArray(spots) ? spots : [];
  const hasJointData = safeSpots.length > 0;
  const showLoading = state === 'loading';
  const showProcessing = state === 'processing';
  const showError = state === 'error';
  const interactive = state === 'ready' && hasJointData;

  const [internalSelection, setInternalSelection] = useControlled<number | null>(
    controlledSelection, null
  );
  const [internalBand, setInternalBand] = useControlled<SeverityBand | null>(
    controlledBand, null
  );
  // A selection pointing past the current list (data refreshed underneath)
  // is dropped rather than showing a stale joint.
  const selectedIndex =
    internalSelection !== null && internalSelection < safeSpots.length
      ? internalSelection
      : null;

  const emitSelection = (index: number | null) => {
    setInternalSelection(index);
    onSelectSpot?.(index);
  };
  const emitBand = (band: SeverityBand | null) => {
    setInternalBand(band);
    onBandChange?.(band);
  };
  const toggleSpot = (index: number) =>
    emitSelection(selectedIndex === index ? null : index);

  const selectedDetail = useMemo(
    () => (selectedIndex !== null ? buildSpotDetail(safeSpots[selectedIndex], selectedIndex) : null),
    [selectedIndex, safeSpots]
  );

  // STEP 6: press targets are real pressables overlaid on the diagram.
  // (Responder props on SVG nodes are ignored on web — taps must live on
  // pressable views.) Geometry mirrors the Svg meet-fit below exactly:
  // viewBox 0..100 / 0..200, uniformly scaled + centered in the box.
  // STEP 9: memoized on (box, spots identity) so taps/selections don't
  // re-run the layout math, and no new array is allocated per render.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const hitTargets = useMemo(() => {
    if (!interactive || box === null || box.w <= 0 || box.h <= 0) return EMPTY_TARGETS;
    const scale = Math.min(box.w / 100, box.h / 200);
    const ox = (box.w - 100 * scale) / 2;
    const oy = (box.h - 200 * scale) / 2;
    const HIT = 40;
    return safeSpots.map((spot, i) => ({
      index: i,
      spot,
      left: ox + spot.cx * scale - HIT / 2,
      top: oy + spot.cy * scale - HIT / 2,
      size: HIT
    }));
  }, [interactive, box, safeSpots]);

  return (
    <View
      style={[styles.diagram, height != null ? { height } : { flex: 1 }]}
      accessibilityRole="image"
      accessibilityLabel={
        hasJointData
          ? `Body joint heatmap with ${safeSpots.length} marked ${safeSpots.length === 1 ? 'region' : 'regions'}`
          : 'Body joint heatmap, no strain data'
      }
      onLayout={e => {
        const { width, height: h } = e.nativeEvent.layout;
        setBox(prev => (prev && prev.w === width && prev.h === h ? prev : { w: width, h: h }));
      }}
    >
      <Image source={{ uri: imageUrl }} style={styles.bodyImage} resizeMode="contain" />
      <Svg
        viewBox="0 0 100 200"
        style={[StyleSheet.absoluteFill, styles.skeleton]}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          {(Object.keys(BAND_COLORS) as SeverityBand[]).map(band => (
            <RadialGradient key={`${gid}-${band}`} id={`${gid}-${band}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={BAND_COLORS[band]} stopOpacity={0.6} />
              <Stop offset="100%" stopColor={BAND_COLORS[band]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {BONES.map(([x1, y1, x2, y2, style], i) => (
          <Line
            key={`bone-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={style === 'dash' ? '#ba1a1a' : '#57dffe'}
            strokeWidth={0.5}
            strokeDasharray={style === 'dash' ? '2' : undefined}
          />
        ))}
        {hasJointData
          ? safeSpots.map((spot, i) => {
              const dimmed = internalBand !== null && spot.severity !== internalBand;
              const selected = selectedIndex === i;
              const dotR = DOT_RADIUS[spot.severity] ?? 1.5;
              return (
                <G
                  key={getSpotKey(spot, i)}
                  opacity={dimmed ? 0.22 : 1}
                >
                  <Circle
                    cx={spot.cx}
                    cy={spot.cy}
                    r={GLOW_RADIUS[spot.severity] ?? 4}
                    fill={`url(#${gid}-${spot.severity})`}
                  />
                  <Circle
                    cx={spot.cx}
                    cy={spot.cy}
                    r={dotR}
                    fill={BAND_COLORS[spot.severity] ?? '#ffffff'}
                    stroke={spot.severity === 'critical' ? 'none' : '#57dffe'}
                    strokeWidth={0.5}
                  />
                  {selected ? (
                    <Circle
                      cx={spot.cx}
                      cy={spot.cy}
                      r={dotR + 2}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={0.8}
                    />
                  ) : null}
                  {/* Fat-finger guard: invisible hit target around small dots. */}
                  <Circle cx={spot.cx} cy={spot.cy} r={9} fill="transparent" />
                </G>
              );
            })
          : null}
      </Svg>
      {hitTargets.map(t => (
        <TouchableOpacity
          key={`hit-${t.index}`}
          testID={`heatmap-marker-${t.index}`}
          accessibilityRole="button"
          accessibilityLabel={`${t.spot?.joint ?? 'Unlabeled joint'}, strain ${typeof t.spot?.strainScore === 'number' ? Math.round(t.spot.strainScore) : 'unknown'} of 100, ${BAND_LABELS[t.spot.severity]}. Activate for details.`}
          activeOpacity={0.6}
          onPress={() => toggleSpot(t.index)}
          style={[
            styles.hitTarget,
            { left: t.left, top: t.top, width: t.size, height: t.size, borderRadius: t.size / 2 }
          ]}
        />
      ))}
      {showLoading ? (
        <View style={styles.stateOverlay} accessibilityRole="progressbar" accessibilityLabel="Loading joint heatmap">
          <ActivityIndicator size="small" color={Colors.secondary} />
          <Text style={styles.stateText}>LOADING HEATMAP</Text>
        </View>
      ) : null}
      {showProcessing ? (
        <View style={styles.stateOverlay} accessibilityRole="progressbar" accessibilityLabel="Analysis in progress, heatmap pending">
          <ActivityIndicator size="small" color={Colors.secondary} />
          <Text style={styles.stateText}>ANALYSIS IN PROGRESS</Text>
        </View>
      ) : null}
      {showError ? (
        <View style={styles.stateOverlay} accessibilityRole="alert" accessibilityLabel="Heatmap error">
          <Icon name="error-outline" size={20} color={Colors.error} />
          <Text style={[styles.stateText, { color: Colors.error }]}>
            {errorMessage || 'Heatmap unavailable. Please try again.'}
          </Text>
          {onRetry ? (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={onRetry}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Retry loading the heatmap"
            >
              <Text style={styles.retryBtnText}>RETRY</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!showLoading && !showProcessing && !showError && !hasJointData ? (
        <View style={styles.noDataOverlay}>
          <Text style={styles.noDataText}>{emptyMessage}</Text>
        </View>
      ) : null}
      {selectedDetail !== null ? (
        <View
          style={styles.callout}
          testID="heatmap-callout"
          accessibilityRole="summary"
          accessibilityLabel={`Joint details: ${selectedDetail.title}, strain ${selectedDetail.scoreText}, ${selectedDetail.bandLabel}`}
        >
          <View style={styles.calloutHeader}>
            <View style={[styles.calloutBandDot, { backgroundColor: selectedDetail.bandColor }]} />
            <Text style={styles.calloutTitle} numberOfLines={1}>{selectedDetail.title}</Text>
            <TouchableOpacity
              testID="heatmap-callout-close"
              accessibilityRole="button"
              accessibilityLabel="Dismiss joint details"
              onPress={() => emitSelection(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.calloutClose}>CLOSE</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calloutMetaRow}>
            <Text style={styles.calloutScore}>STRAIN {selectedDetail.scoreText}</Text>
            <Text style={[styles.calloutBand, { color: selectedDetail.bandColor }]}>
              {selectedDetail.bandLabel}
            </Text>
          </View>
          <Text style={styles.calloutWarning} numberOfLines={2}>
            {selectedDetail.linkedWarningTitles.length > 0
              ? `Linked finding: ${selectedDetail.linkedWarningTitles[0]}${selectedDetail.linkedWarningTitles.length > 1 ? ` (+${selectedDetail.linkedWarningTitles.length - 1} more)` : ''}`
              : 'No linked warning recorded for this joint.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function PostureHeatmap({
  imageUrl = DEFAULT_BODY_IMAGE,
  spots,
  findings,
  height = 400,
  state = 'ready',
  errorMessage,
  onRetry,
  emptyMessage,
  showLegend = true,
  selectedIndex: controlledSelection,
  onSelectSpot,
  activeBand: controlledBand,
  onBandChange
}: PostureHeatmapProps & {
  selectedIndex?: number | null;
  onSelectSpot?: (index: number | null) => void;
  activeBand?: SeverityBand | null;
  onBandChange?: (band: SeverityBand | null) => void;
}) {
  // HONEST EMPTY STATE: no mock fallbacks — when a call-site passes nothing
  // (or explicitly empty data) we render the diagram with no markers.
  const safeSpots: HeatmapSpot[] = Array.isArray(spots) ? spots : [];
  const safeFindings: PostureFinding[] = Array.isArray(findings)
    ? findings
    : [
        {
          tagColor: Colors.onSurfaceVariant,
          tagText: 'NO DATA',
          title: 'No joint-level data',
          description: 'No joint strain data was recorded for this assessment.'
        }
      ];
  const hasJointData = safeSpots.length > 0;
  const [selection, setSelection] = useControlled<number | null>(controlledSelection, null);
  const [band, setBand] = useControlled<SeverityBand | null>(controlledBand, null);
  const handleSelect = (index: number | null) => {
    setSelection(index);
    onSelectSpot?.(index);
  };
  const handleBand = (b: SeverityBand | null) => {
    setBand(b);
    onBandChange?.(b);
  };
  // Titles of warnings linked to the selected marker — their finding cards
  // get a highlight ring so the diagram and the list stay visibly connected.
  const selectedLinkedTitles: string[] = useMemo(
    () =>
      selection !== null && safeSpots[selection]
        ? (safeSpots[selection].linkedWarningTitles ?? [])
        : [],
    [selection, safeSpots]
  );

  return (
    <View>
      <View style={[styles.card, { height }]}>
        <View style={[styles.bodyColumn, { width: height / 2 }]}>
          <View style={styles.glow} />
          <BodyHeatmap
            imageUrl={imageUrl}
            spots={safeSpots}
            height={height}
            state={state}
            errorMessage={errorMessage}
            onRetry={onRetry}
            emptyMessage={emptyMessage}
            selectedIndex={selection}
            onSelectSpot={handleSelect}
            activeBand={band}
            onBandChange={handleBand}
          />
        </View>
        <View style={styles.findingsColumn}>
          {safeFindings.map((finding, i) => {
            const linked = selectedLinkedTitles.includes(finding.title);
            return (
              <View
                key={i}
                testID={linked ? 'heatmap-finding-linked' : undefined}
                style={[
                  styles.findingCard,
                  { borderLeftColor: finding.tagColor },
                  linked && styles.findingCardLinked
                ]}
              >
                <Text style={[styles.findingTag, { color: finding.tagColor }]}>{finding.tagText}</Text>
                <Text style={styles.findingTitle}>{finding.title}</Text>
                <Text style={styles.findingDescription}>{finding.description}</Text>
              </View>
            );
          })}
        </View>
      </View>
      {showLegend && hasJointData ? (
        <View style={styles.legendWrap}>
          <HeatmapLegend spots={safeSpots} activeBand={band} onSelectBand={handleBand} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  bodyColumn: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  glow: {
    position: 'absolute',
    width: '80%',
    height: '40%',
    borderRadius: 999,
    backgroundColor: Colors.primaryContainer,
    opacity: 0.15
  },
  diagram: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hitTarget: {
    position: 'absolute',
    backgroundColor: 'transparent'
  },
  bodyImage: {
    height: '100%',
    width: '100%',
    opacity: 0.75
  },
  skeleton: {
    opacity: 0.85
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: Spacing.md
  },
  stateText: {
    ...Typography.labelCaps,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.onSurfaceVariant,
    textAlign: 'center'
  },
  retryBtn: {
    marginTop: 2,
    backgroundColor: Colors.error,
    borderRadius: 6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs
  },
  retryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#ffffff'
  },
  noDataOverlay: {
    position: 'absolute',
    bottom: Spacing.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3
  },
  noDataText: {
    ...Typography.labelCaps,
    fontSize: 8,
    letterSpacing: 1.2,
    color: Colors.outline
  },
  callout: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    bottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.5)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: 2
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  calloutBandDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  calloutTitle: {
    flex: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.onSurface
  },
  calloutClose: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.onSurfaceVariant
  },
  calloutMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm
  },
  calloutScore: {
    ...Typography.labelCaps,
    fontSize: 9,
    letterSpacing: 1,
    color: Colors.onSurfaceVariant
  },
  calloutBand: {
    ...Typography.labelCaps,
    fontSize: 9,
    letterSpacing: 1
  },
  calloutWarning: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.onSurfaceVariant
  },
  legendWrap: {
    alignItems: 'center',
    paddingTop: Spacing.sm
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.md
  },
  legendRowOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  legendText: {
    ...Typography.labelCaps,
    fontSize: 8,
    letterSpacing: 1,
    color: Colors.onSurfaceVariant
  },
  legendTextOverlay: {
    color: '#ffffff'
  },
  findingsColumn: {
    flex: 1,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.md,
    gap: Spacing.md
  },
  findingCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: Spacing.sm
  },
  findingCardLinked: {
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    backgroundColor: Colors.surfaceContainer
  },
  findingTag: {
    ...Typography.labelCaps,
    fontSize: 10,
    marginBottom: 4
  },
  findingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface
  },
  findingDescription: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2
  }
});

/**
 * Build the component's spot view-model STRICTLY through the finalized
 * contract (riskVisualization.ts). The raw assessment is the single input;
 * positions/severity/colors come from the contract's documented rules.
 */
export const buildHeatmapSpotsFromAssessment = (a: any): HeatmapSpot[] => {
  const data: RiskVisualizationData = buildRiskVisualization(a);
  return data.joints.map(j => ({
    cx: j.cx,
    cy: j.cy,
    severity: j.band,
    joint: j.joint,
    strainScore: j.strainScore,
    linkedWarningTitles: [...j.relatedWarnings]
  }));
};

export const buildFindingsFromAssessment = (a: any): PostureFinding[] => {
  const data: RiskVisualizationData = buildRiskVisualization(a);
  const mapped = data.warnings.map((w): PostureFinding => {
    const sev = w.severity;
    const detailText = w.detail ?? '';
    const detailLower = detailText.toLowerCase();
    // Same de-duplication rule as the contract's insight builder: never
    // repeat a phase/angle the stored detail sentence already states.
    const mentionsPhase = !!w.phase && detailLower.includes(String(w.phase).toLowerCase());
    const mentionsAngle = detailText.includes('°');
    const showPhase = !!w.phase && w.phase !== 'landing phase' && !mentionsPhase;
    const showAngle = w.angleDeviationDeg != null && w.angleDeviationDeg !== 0 && !mentionsAngle;
    return {
      tagText:
        sev === 'Critical'
          ? 'CRITICAL WARNING'
          : sev === 'Low'
            ? 'MINOR FINDING'
            : 'MODERATE WARNING',
      tagColor:
        sev === 'Critical'
          ? Colors.error
          : sev === 'Low'
            ? Colors.secondary
            : '#b9740f',
      title: w.warningType,
      description: `${detailText}${showPhase ? ` Detected during ${w.phase}.` : ''}${
        showAngle
          ? ` (${Math.abs(w.angleDeviationDeg as number)}° deviation)`
          : ''
      }`
    };
  });
  if (mapped.length === 0) {
    return [
      {
        tagColor: Colors.onSurfaceVariant,
        tagText: 'NO FINDINGS',
        title: 'No posture findings recorded',
        description: 'No critical biomechanical warnings were detected for this assessment.'
      }
    ];
  }
  return mapped;
};
