/**
 * ============================================================================
 * TALENTSCOPE RISK-VISUALIZATION DATA CONTRACT (finalized — Step 3)
 * ============================================================================
 * ONE pure, frontend-only structure that feeds the Injury Risk screen,
 * Analysis Results and Coach Dashboard/Overview visualizations.
 *
 * PRINCIPLES (binding):
 *  - Only fields that ALREADY EXIST in the backend/AI response. No invented
 *    values, no per-region fabricated data, no AI calculation on the client.
 *  - The builder below is a 1:1 mapping/enrichment layer: it renames,
 *    clamps and classifies what the server sent — it never computes risk.
 *  - Every value the frontend renders is traceable to one of:
 *      (a) a field stored on the Assessment document,
 *      (b) a documented presentation constant (canonical anatomy lookup,
 *          severity band thresholds, colors),
 *      (c) an explicit null/empty marker.
 *
 * SECTIONS
 *  1. OverallAssessmentRisk   — whole-assessment risk scalars (exists)
 *  2. JointRiskItem[]         — per-joint risk from `heatmapSpots` (exists)
 *  3. VisualizationMetadata   — labels, confidence, canonical placement
 *
 * NULL / UNKNOWN BEHAVIOR
 *  - Missing or non-numeric risk scalars -> `null` (render as "--").
 *  - `heatmapSpots` absent/not an array/empty -> `[]` (honest empty state;
 *    never mock spots).
 *  - Unknown joint names -> placed at the canonical fallback point and marked
 *    `placement: 'fallback'` (the UI can label it "unmapped joint").
 *  - `strainScore` outside 0..100 -> clamped, `clamped: true`.
 *  - `riskColor` invalid/missing -> derived from the severity band, and
 *    `colorSource: 'band'` says so.
 * ============================================================================
 */

/* ---------------------------------------------------------------------------
 * 1. OVERALL ASSESSMENT RISK (source: assessment.injuryRiskClassification)
 * ------------------------------------------------------------------------- */

export type RiskLevel = 'Low' | 'Moderate' | 'High';

/** Normalized whole-assessment risk. Every numeric field is nullable:
 *  null = the backend did not provide a usable number (render "--"). */
export interface OverallAssessmentRisk {
  /** 0..100 — injury-risk percentage. */
  percentage: number | null;
  /** Low | Moderate | High (backend enum). Unknown strings -> null. */
  level: RiskLevel | null;
  /** 0..100 — left/right force-distribution asymmetry. */
  asymmetryScore: number | null;
  /** 0..100 — neural/metabolic fatigue index. */
  fatigueIndex: number | null;
  /** 0..100 — global compressive joint-stress level. */
  jointStress: number | null;
  /** 0..100 — deviation from elite movement baseline. */
  movementDeficiency: number | null;
  /** Which backend surface the values came from. 'profile-mirror' = the
   *  User-level mirror fields the API maintains for dashboards; 'none' =
   *  nothing usable anywhere (render "--" / empty state). */
  source: 'assessment' | 'profile-mirror' | 'none';
}

/** Fallback input shape for the profile mirror (User.currentInjuryRisk* or
 *  the coach /overview summary fields the frontend maps to the same keys). */
export interface RiskProfileFallback {
  currentInjuryRiskPercentage?: unknown;
  currentInjuryRiskLevel?: unknown;
}

/* ---------------------------------------------------------------------------
 * 2. BODY/JOINT-SPECIFIC RISK (source: assessment.heatmapSpots)
 * ------------------------------------------------------------------------- */

export type SeverityBand = 'low' | 'watch' | 'critical';

/** How the marker position on the body map was determined. */
export type MarkerPlacement = 'canonical' | 'fallback';

/** Which source the marker color came from. */
export type MarkerColorSource = 'stored' | 'band';

export interface JointRiskItem {
  /** Backend joint identifier, e.g. "Right Knee", "Lumbar" (verbatim). */
  joint: string;
  /** 0..100 strain score (clamped). Raw value preserved in rawStrainScore. */
  strainScore: number;
  /** Original stored value before clamping (equals strainScore when valid). */
  rawStrainScore: number | null;
  /** True when the stored value was outside 0..100 and had to be clamped. */
  clamped: boolean;
  /** Severity band derived from thresholds — presentation only, not a metric. */
  band: SeverityBand;
  /** Marker color. `stored` = backend riskColor; `band` = derived fallback. */
  color: string;
  colorSource: MarkerColorSource;
  /** Canonical body-map coordinates in the 0..100 / 0..200 viewBox space. */
  cx: number;
  cy: number;
  /** canonical = matched by joint name; fallback = unknown joint name. */
  placement: MarkerPlacement;
  /** 0..100 confidence if the backend supplied one for this spot; else null. */
  confidence: number | null;
  /** Warnings whose warningType mentions this joint (verbatim backend data). */
  relatedWarnings: string[];
}

/** Warning entries (verbatim from assessment.criticalWarnings, normalized). */
export interface RiskWarningItem {
  warningType: string;
  /** Low | Moderate | Critical (backend enum; unknown -> null). */
  severity: 'Low' | 'Moderate' | 'Critical' | null;
  /** Deviation angle in degrees, when provided. */
  angleDeviationDeg: number | null;
  /** Movement phase label, e.g. "landing phase". */
  phase: string | null;
  /** Human-readable detail sentence (backend text). */
  detail: string | null;
}

/* ---------------------------------------------------------------------------
 * 3. OPTIONAL VISUALIZATION METADATA
 * ------------------------------------------------------------------------- */

export interface VisualizationMetadata {
  /** Labels for headers — all optional, null when absent. */
  assessmentCode: string | null;
  testType: string | null;
  sport: string | null;
  completedAt: string | null;
  /** 0..100 model confidence; 0 sent by the manual-review finalize path
   *  is normalized to null ("manual review" — no AI confidence to show). */
  aiConfidence: number | null;
  aiModelVersion: string | null;
  /** Optional kinematic angle chips (real stored fields only). */
  kinematics: {
    kneeFlexionAngleDeg: number | null;
    spineAngleDeg: number | null;
    hipAsymmetryPercentage: number | null;
    ankleDorsiflexionAngleDeg: number | null;
  };
  /** Backend AI insight sentences (verbatim). */
  insights: string[];
}

/** The complete visualization payload. */
export interface RiskVisualizationData {
  overall: OverallAssessmentRisk;
  joints: JointRiskItem[];
  warnings: RiskWarningItem[];
  meta: VisualizationMetadata;
  /** True when the assessment document carried no heatmap spots at all —
   *  the honest empty-state signal for the UI. */
  hasJointLevelData: boolean;
}

/* ---------------------------------------------------------------------------
 * PRESENTATION CONSTANTS (documented; not measured data)
 * ------------------------------------------------------------------------- */

/** Canonical anatomy positions in the PostureHeatmap 100x200 viewBox.
 *  Keys are lowercase keyword fragments; resolution is by first keyword hit.
 *  This is LABEL PLACEMENT on a standard body diagram — the joint's
 *  strainScore is the data; the position is presentation.
 *  Off-center limb bases mirror the fixed BONES skeleton endpoints so that
 *  "right X" and "left X" resolve to opposite legs in front-view convention
 *  (screen-left = athlete's right). */
const CANONICAL_JOINT_POSITIONS: Record<string, [number, number]> = {
  // head/neck
  head: [50, 20], neck: [50, 26],
  // torso
  spine: [50, 60], lumbar: [50, 75], back: [50, 62], core: [50, 66], pelvic: [50, 78], pelvis: [50, 78], hip: [50, 82],
  // shoulders/arms
  shoulder: [50, 32], elbow: [35, 58], wrist: [32, 80], arm: [36, 60],
  // knees/ankles/feet (base = left-leg skeleton endpoint; mirrored per side)
  knee: [35, 100], patella: [35, 100],
  ankle: [35, 160], foot: [35, 168], feet: [35, 168], heel: [35, 164],
  // sides (prefixed "left "/"right " are mirrored around x=50)
  left: [-1, -1], right: [-1, -1] // handled specially below
};

/** Fallback point for joint names that match nothing. */
const FALLBACK_POSITION: [number, number] = [50, 96];

/** Severity-band thresholds for strainScore (presentation classification of
 *  an existing value; NOT a new risk metric). Mirrors the thresholds already
 *  used by buildHeatmapSpotsFromAssessment. */
export const SEVERITY_THRESHOLDS = {
  /** strainScore >= criticalAt          -> 'critical' */
  criticalAt: 70,
  /** strainScore >= watchAt  (and <crit) -> 'watch'    */
  watchAt: 40
  /** otherwise                          -> 'low'      */
} as const;

export const BAND_COLORS: Record<SeverityBand, string> = {
  low: '#4ade80',
  watch: '#faad14',
  critical: '#ff4d4f'
};

export const BAND_LABELS: Record<SeverityBand, string> = {
  low: 'LOW STRAIN',
  watch: 'WATCH',
  critical: 'CRITICAL'
};

/* ---------------------------------------------------------------------------
 * INTERNAL HELPERS — pure normalization, no risk computation
 * ------------------------------------------------------------------------- */

const asNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const clamp01to100 = (v: number): { value: number; clamped: boolean } =>
  v < 0 ? { value: 0, clamped: true } : v > 100 ? { value: 100, clamped: true } : { value: v, clamped: false };

const asRiskLevel = (v: unknown): RiskLevel | null =>
  v === 'Low' || v === 'Moderate' || v === 'High' ? v : null;

const asWarningSeverity = (v: unknown): 'Low' | 'Moderate' | 'Critical' | null =>
  v === 'Low' || v === 'Moderate' || v === 'Critical' ? v : null;

const bandForStrain = (s: number): SeverityBand =>
  s >= SEVERITY_THRESHOLDS.criticalAt ? 'critical'
    : s >= SEVERITY_THRESHOLDS.watchAt ? 'watch'
    : 'low';

const isValidHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

/**
 * Resolve a joint name to canonical body-map coordinates.
 * "left X"/"right X" mirror the X position of X around the diagram center
 * (50). Unknown names -> fallback point with placement: 'fallback'.
 */
export const resolveJointPosition = (jointName: string): { cx: number; cy: number; placement: MarkerPlacement } => {
  const raw = String(jointName || '').trim();
  const lower = raw.toLowerCase();
  const sideMatch = lower.match(/^(left|right)[\s-]+(.+)$/);
  if (sideMatch) {
    const side = sideMatch[1]; // 'left' | 'right'
    const rest = sideMatch[2];
    const key = Object.keys(CANONICAL_JOINT_POSITIONS).find(k => rest.includes(k));
    if (key) {
      const [bx, by] = CANONICAL_JOINT_POSITIONS[key];
      // mirror the base position around the diagram center (x=50)
      const cx = side === 'left' ? Math.max(bx, 100 - bx) : Math.min(bx, 100 - bx);
      return { cx, cy: by, placement: 'canonical' };
    }
  }
  const key = Object.keys(CANONICAL_JOINT_POSITIONS).find(k => lower.includes(k) && k !== 'left' && k !== 'right');
  if (key) {
    const [cx, cy] = CANONICAL_JOINT_POSITIONS[key];
    return { cx, cy, placement: 'canonical' };
  }
  return { cx: FALLBACK_POSITION[0], cy: FALLBACK_POSITION[1], placement: 'fallback' };
};

/* ---------------------------------------------------------------------------
 * THE BUILDER — maps the raw Assessment API response to the contract.
 * `raw` is the assessment document exactly as returned by /assessments/*
 * or embedded in /athletes/dashboard or /coaches/me/athletes/:id/overview.
 * ------------------------------------------------------------------------- */
export const buildRiskVisualization = (raw: any, profileFallback?: RiskProfileFallback | null): RiskVisualizationData => {
  // Accept both: Assessment-document shape (injuryRiskClassification) and
  // coach injury-risk endpoint shape ({ risk: { level, percentage, ... } }).
  // This shape-normalization is the only mapping — no values are computed.
  const coachRisk = raw?.risk && typeof raw.risk === 'object' ? raw.risk : null;
  const cls = raw?.injuryRiskClassification ?? (
    coachRisk ? {
      riskStatus: coachRisk.level,
      riskPercentage: coachRisk.percentage,
      asymmetryScore: coachRisk.asymmetryScore,
      fatigueIndex: coachRisk.fatigueIndex,
      jointStress: coachRisk.jointStress,
      movementDeficiency: coachRisk.movementDeficiency
    } : null
  );

  // Profile-mirror fallback for the two gauge fields only (matches the
  // screens' long-standing behavior: assessment value wins, else the mirror).
  const mirrorPct = asNumber(profileFallback?.currentInjuryRiskPercentage);
  const mirrorLevel = asRiskLevel(profileFallback?.currentInjuryRiskLevel);
  const pct = asNumber(cls?.riskPercentage) ?? mirrorPct;
  const lvl = asRiskLevel(cls?.riskStatus) ?? mirrorLevel;

  const overall: OverallAssessmentRisk = {
    percentage: pct,
    level: lvl,
    asymmetryScore: asNumber(cls?.asymmetryScore),
    fatigueIndex: asNumber(cls?.fatigueIndex),
    jointStress: asNumber(cls?.jointStress),
    movementDeficiency: asNumber(cls?.movementDeficiency),
    source: cls != null ? 'assessment' : (pct !== null || lvl !== null) ? 'profile-mirror' : 'none'
  };

  const rawWarnings: any[] = Array.isArray(raw?.criticalWarnings) ? raw.criticalWarnings : [];
  const warnings: RiskWarningItem[] = rawWarnings.map(w => ({
    warningType: typeof w?.warningType === 'string' ? w.warningType : 'Finding',
    severity: asWarningSeverity(w?.severity),
    angleDeviationDeg: asNumber(w?.angleDeviationDeg),
    phase: typeof w?.phase === 'string' && w.phase.trim() ? w.phase : null,
    detail: typeof w?.detail === 'string' ? w.detail : null
  }));

  const rawSpots: any[] = Array.isArray(raw?.heatmapSpots) ? raw.heatmapSpots : [];
  const joints: JointRiskItem[] = rawSpots.map(s => {
    const jointName = typeof s?.joint === 'string' && s.joint.trim() ? s.joint : 'Unlabeled joint';
    const rawStrain = asNumber(s?.strainScore);
    const { value, clamped } = rawStrain === null
      ? { value: 0, clamped: true } // unusable score -> 0 + clamped flag (honest)
      : clamp01to100(rawStrain);
    const band = bandForStrain(value);
    const storedColor = isValidHexColor(s?.riskColor) ? s.riskColor.trim() : null;
    const { cx, cy, placement } = resolveJointPosition(jointName);
    const lower = jointName.toLowerCase();
    return {
      joint: jointName,
      strainScore: value,
      rawStrainScore: rawStrain,
      clamped,
      band,
      color: storedColor ?? BAND_COLORS[band],
      colorSource: storedColor ? 'stored' : 'band',
      cx, cy, placement,
      confidence: asNumber(s?.confidence),
      relatedWarnings: warnings
        .filter(w => {
          const t = w.warningType.toLowerCase().replace(/[^a-z]/g, '');
          const target = lower.replace(/[^a-z]/g, '');
          // exact-ish containment either way; guard against near-empty keys
          if (target.length > 2 && t.length > 2) {
            return t.includes(target) || target.includes(t);
          }
          return false;
        })
        .map(w => w.warningType)
    };
  });

  const kin = raw?.jointKinematics ?? null;
  const meta: VisualizationMetadata = {
    assessmentCode:
      (typeof raw?.assessmentCode === 'string' && raw.assessmentCode.trim()) ||
      (typeof raw?.lastAssessmentCode === 'string' && raw.lastAssessmentCode.trim()) || // coach endpoint alias
      null,
    testType: typeof raw?.testType === 'string' ? raw.testType : null,
    sport: typeof raw?.sport === 'string' ? raw.sport : null,
    completedAt:
      (typeof raw?.completedAt === 'string' && raw.completedAt.trim()) ||
      (typeof raw?.evaluatedAt === 'string' && raw.evaluatedAt.trim()) || // coach endpoint alias
      null,
    aiConfidence: (() => {
      const c = asNumber(raw?.aiMetadata?.confidenceScore);
      // 0 means "no model confidence" (manual-review finalize path)
      return c !== null && c > 0 ? c : null;
    })(),
    aiModelVersion: typeof raw?.aiMetadata?.modelVersion === 'string' ? raw.aiMetadata.modelVersion : null,
    kinematics: {
      kneeFlexionAngleDeg: asNumber(kin?.kneeFlexionAngle),
      spineAngleDeg: asNumber(kin?.spineAngle),
      hipAsymmetryPercentage: asNumber(kin?.hipAsymmetryPercentage),
      ankleDorsiflexionAngleDeg: asNumber(kin?.ankleDorsiflexionAngle)
    },
    insights: Array.isArray(raw?.aiInsights)
      ? raw.aiInsights.filter((i: unknown) => typeof i === 'string')
      : []
  };

  return {
    overall,
    joints,
    warnings,
    meta,
    hasJointLevelData: joints.length > 0
  };
};

/* ---------------------------------------------------------------------------
 * REUSABLE VIEW-MODEL BUILDERS (Step 4)
 * These power the Injury Risk screen AND the Coach Dashboard athlete overview
 * (plus any future risk view). Same raw response -> identical output:
 * pure functions, no React, no backend calls, no risk computation.
 * ------------------------------------------------------------------------- */

export type FactorIcon = 'balance' | 'bolt' | 'fitness-center' | 'speed';

export interface RiskFactorView {
  key: 'asymmetry' | 'fatigue' | 'jointStress' | 'movementDeficiency';
  icon: FactorIcon;
  title: string;
  body: string;
  /** e.g. "8/100" when measured, "--/100" when not (render as-is). */
  badge: string;
  /** 0..100 measured value, 0 when unmeasured (bar shows empty). */
  percent: number;
  /** False when the backend did not provide this scalar. */
  hasData: boolean;
}

const FACTOR_DEFS: Array<{
  key: RiskFactorView['key'];
  icon: FactorIcon;
  title: string;
  body: string;
  value: (o: OverallAssessmentRisk) => number | null;
}> = [
  {
    key: 'asymmetry', icon: 'balance', title: 'Asymmetry',
    body: 'Left-to-right force distribution in kinetic chain transitions.',
    value: o => o.asymmetryScore
  },
  {
    key: 'fatigue', icon: 'bolt', title: 'Fatigue',
    body: 'Neural drive efficiency and metabolic recovery index.',
    value: o => o.fatigueIndex
  },
  {
    key: 'jointStress', icon: 'fitness-center', title: 'Joint Stress',
    body: 'Compressive load monitoring at knees, ankles, and lumbar.',
    value: o => o.jointStress
  },
  {
    key: 'movementDeficiency', icon: 'speed', title: 'Movement Deficiency',
    body: 'Kinetic deviations from elite-level performance baselines.',
    value: o => o.movementDeficiency
  }
];

/**
 * Four factor cards from the overall block. Returns [] ONLY when the
 * assessment carries no classification object at all (mirrors both screens'
 * long-standing empty behavior); when the block exists, all four cards are
 * returned with per-field hasData flags (--/0 rendering for missing scalars).
 * Screens render icon/title/body/badge/percent verbatim.
 */
export const buildRiskFactors = (raw: any, profileFallback?: RiskProfileFallback | null): RiskFactorView[] => {
  const { overall } = buildRiskVisualization(raw, profileFallback);
  const coachRisk = raw?.risk && typeof raw.risk === 'object' ? raw.risk : null;
  const hasClassification = raw?.injuryRiskClassification != null || coachRisk != null;
  if (!hasClassification) return [];
  return FACTOR_DEFS.map(d => {
    const v = d.value(overall);
    return {
      key: d.key, icon: d.icon, title: d.title, body: d.body,
      badge: `${v !== null ? v : '--'}/100`,
      percent: v !== null ? v : 0,
      hasData: v !== null
    };
  });
};

export type InsightTone = 'critical' | 'warning' | 'ok';

export interface RiskInsightView {
  /** Semantic tone; screens map to their icon + color tokens. */
  tone: InsightTone;
  title: string;
  body: string;
}

/**
 * Preventive-insights list from stored criticalWarnings (verbatim text).
 * tone: 'critical' for Critical, 'ok' for Low, 'warning' otherwise.
 */
export const buildRiskInsights = (raw: any): RiskInsightView[] => {
  const { warnings } = buildRiskVisualization(raw);
  return warnings.map(w => {
    const detailText = w.detail ?? '';
    const detailLower = detailText.toLowerCase();
    // Never repeat what the stored detail sentence already says: the phase
    // and angle fragments are appended only when the detail omits them.
    const mentionsPhase = !!w.phase && detailLower.includes(String(w.phase).toLowerCase());
    const mentionsAngle = detailText.includes('°');
    const angle = w.angleDeviationDeg !== null && w.angleDeviationDeg !== 0 && !mentionsAngle
      ? ` (${Math.abs(w.angleDeviationDeg)}° deviation)` : '';
    const phase = w.phase && !mentionsPhase ? ` • Detected during ${w.phase}` : '';
    return {
      tone: w.severity === 'Critical' ? 'critical' : w.severity === 'Low' ? 'ok' : 'warning',
      title: w.warningType || 'Finding',
      body: `${detailText}${phase}${angle}`
    };
  });
};

export interface ExerciseView {
  name: string;
  detail: string;
}

/**
 * Corrective-exercise list from stored recommendations (verbatim fields).
 */
export const buildExerciseList = (raw: any): ExerciseView[] => {
  const recs: any[] = Array.isArray(raw?.recommendations) ? raw.recommendations : [];
  return recs.map((r: any) => ({
    name: typeof r?.title === 'string' ? r.title : 'Exercise',
    detail: `${r?.sets || '3 Sets'} • ${r?.reps || '15 Reps'}${r?.priority ? ` • ${r.priority} priority` : ''}`
  }));
};
