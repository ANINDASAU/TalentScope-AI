import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import SkeletonOverlay from '../../components/SkeletonOverlay';
import { createAssessment, updateAssessmentStatus, getProfile } from '../../services/api';
import { useIsOnline } from '../../hooks/useConnectivity';
import {
  addQueuedAssessment,
  getQueuedAssessments,
  removeQueuedAssessment,
  updateQueuedAssessment,
  QueuedAssessment,
  QueuedSyncStatus
} from '../../services/assessmentQueue';
import { retryFailedSync, subscribeSyncEvents } from '../../services/syncEngine';
import { saveRecording, assertEnoughStorageForRecording } from '../../services/storageManager';
import { loadSessionUser } from '../../services/session';

const CAMERA_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCPfv8hPZ4F0uI7AhmV451JN0RxNDOP-pH5hhtnjfAoi0wNI_ZSFfcDnJQQLINwM6BzFJ8Wuo6S75rwi_BPzF3y6PErI8hr_HKlti0Dl_vjSREIKqS9I8mY_IH9tK3ZsB77emud_f_cqZ60Q6cnWIHK8Wh84MH57cmKzxTLZjFIkZ9_sPbQxbt9oOiC_Jgz6YnhNPZJ-DD_a-O-V5h_46UN_yDzBThw3zexTROYykcTVftjKs8RSuafFVZ-SxI_whXe5-siJMMM9mg';

const TEST_TYPES = [
  {
    value: 'unilateral_squat',
    label: 'Unilateral Squat',
    blurb:
      'Analyzing biomechanical efficiency and joint alignment during single-leg loading cycles.'
  },
  {
    value: 'sprint_acceleration',
    label: 'Sprint Acceleration',
    blurb: 'Measuring drive-phase mechanics, stride power and ground contact timing.'
  },
  {
    value: 'countermovement_jump',
    label: 'Countermovement Jump',
    blurb: 'Tracking lower-body explosiveness, eccentric braking and landing control.'
  },
  {
    value: 'agility_t_drill',
    label: 'Agility T-Drill',
    blurb: 'Capturing change-of-direction speed, deceleration quality and lateral stability.'
  },
  {
    value: 'landing_mechanics',
    label: 'Landing Mechanics',
    blurb: 'Evaluating knee valgus, trunk posture and force absorption on impact.'
  },
  {
    value: 'posture_alignment',
    label: 'Posture Alignment',
    blurb: 'Assessing static alignment, spinal neutrality and bilateral symmetry.'
  }
];

const SPORTS = ['Athletics', 'Football', 'Basketball', 'Cricket', 'Badminton', 'Tennis'];

const VALIDATIONS = [
  {
    icon: 'light-mode' as const,
    iconColor: Colors.secondary,
    iconBg: 'rgba(87,223,254,0.2)',
    label: 'LIGHTING',
    value: 'Optimal (840 lx)'
  },
  {
    icon: 'straighten' as const,
    iconColor: Colors.onTertiaryContainer,
    iconBg: 'rgba(74,225,118,0.2)',
    label: 'DISTANCE',
    value: '3.2 m - Perfect'
  },
  {
    icon: 'devices' as const,
    iconColor: Colors.primary,
    iconBg: 'rgba(218,226,253,0.35)',
    label: 'HARDWARE',
    value: 'AI-NPU Active'
  }
];

const STEPS = [
  {
    title: 'Positioning',
    text: 'Stand inside the dashed frame. Ensure your full body is visible from head to toe.'
  },
  {
    title: 'The Movement',
    text: 'Perform 5 slow, controlled unilateral squats on each leg. Wait for the beep.'
  },
  {
    title: 'Completion',
    text: 'Step out of frame to finalize processing. Results are ready in under 10 seconds.'
  }
];

const LIVE_METRICS = [
  { label: 'HIP ANGLE', value: '172.4°', color: '#ffffff' },
  { label: 'LATERAL SWAY', value: '0.02 m', color: Colors.secondaryFixed },
  { label: 'HEART RATE', value: '94 BPM', color: '#ffffff' },
  { label: 'STABILITY', value: '98.2%', color: Colors.tertiaryFixed }
];

export default function StartAssessmentScreen({ navigation }: any) {
  const [recording, setRecording] = useState(false);
  const [testType, setTestType] = useState(TEST_TYPES[0].value);
  const [sport, setSport] = useState(SPORTS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const isOnline = useIsOnline();
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState<{ pendingCount: number } | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [queueItems, setQueueItems] = useState<QueuedAssessment[]>([]);
  const [retrying, setRetrying] = useState(false);
  const createdKeyRef = useRef('');
  /**
   * How the in-progress recording must be finished. 'offline' is STICKY: a
   * recording started offline is saved locally even if connectivity returns
   * mid-recording (otherwise the capture would be silently discarded).
   */
  const recordingModeRef = useRef<'online' | 'offline' | null>(null);
  /** Double-submit guard for the local save path */
  const savingRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const [elapsedMs, setElapsedMs] = useState(0);
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;

  const selectedTest = TEST_TYPES.find(t => t.value === testType) || TEST_TYPES[0];

  useEffect(() => {
    let active = true;
    // Offline-safe athlete reference from cached session
    loadSessionUser()
      .then(u => {
        if (active && u?._id) setAthleteId(String(u._id));
      })
      .catch(() => {});
    (async () => {
      try {
        const res = await getProfile();
        const user = res?.data?.user ?? res?.data ?? res?.user ?? {};
        const uid = user?._id ? String(user._id) : null;
        const primarySport = user?.primarySport;
        if (active && typeof primarySport === 'string' && primarySport.trim()) {
          const match = SPORTS.find(s => s.toLowerCase() === primarySport.toLowerCase());
          if (match) setSport(match);
        }
        if (active && uid) setAthleteId(uid);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, []);

  // Pending-sync badge count + live sync status list
  const refreshQueue = useCallback(() => {
    getQueuedAssessments()
      .then(q => {
        setQueueItems(q);
        setPendingSyncCount(q.filter(x => x.syncStatus !== 'completed').length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshQueue();
    const unsub = subscribeSyncEvents(() => refreshQueue());
    const iv = setInterval(refreshQueue, 10000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [refreshQueue, isOnline]);

  const failedCount = queueItems.filter(q => q.syncStatus === 'failed').length;

  const onManualRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryFailedSync();
    } finally {
      setRetrying(false);
      refreshQueue();
    }
  };

  /**
   * Status copy (Phase 8). The chip is the short label; the body is
   * the user-facing state message. A locally-saved assessment is NEVER
   * described as analyzed/completed.
   */
  const syncChipFor = (status: QueuedSyncStatus): { text: string; color: string } => {
    switch (status) {
      case 'uploading': return { text: 'UPLOADING', color: Colors.secondary };
      case 'processing': return { text: 'PROCESSING', color: Colors.secondary };
      case 'completed': return { text: 'SYNCED', color: '#009844' };
      case 'failed': return { text: 'FAILED', color: Colors.error };
      default: return { text: 'WAITING', color: '#b26a00' };
    }
  };

  const syncMessageFor = (item: QueuedAssessment, online: boolean): string => {
    switch (item.syncStatus) {
      case 'uploading':
        return 'Uploading assessment…';
      case 'processing':
        return 'Assessment uploaded. Analysis in progress.';
      case 'completed':
        return 'Assessment synced.';
      case 'failed':
        return item.error || 'Synchronization failed.';
      default: // pending
        return online
          ? 'Queued for upload…'
          : 'Assessment saved. It will sync when you\u2019re back online.';
    }
  };

  useEffect(() => {
    if (!recording) return undefined;
    const interval = setInterval(() => setElapsedMs(ms => ms + 100), 100);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const finishOfflineSave = async () => {
    if (savingRef.current) return; // double-submit guard (rapid STOP taps)
    savingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!athleteId) throw new Error('Athlete profile not loaded yet. Please retry.');
      if (!createdKeyRef.current) createdKeyRef.current = `${athleteId}:${testType}:${Date.now()}`;

      // 1. Queue the entry first (durable, idempotency-keyed).
      const entry = await addQueuedAssessment({
        athleteId,
        sport,
        testType,
        category: sport,
        idempotencyKey: createdKeyRef.current
      });
      // 2. Persist the recording via storageManager: atomic write, stable
      //    filename derived from the entry key + localId, integrity verified.
      const saved = await saveRecording(entry.idempotencyKey, entry.localId, {
        kind: 'talentscope-offline-recording',
        recordedAt: new Date().toISOString(),
        durationMs: elapsedMs,
        sport,
        testType
      });
      if (saved.ok && saved.uri) {
        await updateQueuedAssessment(entry.localId, { localVideoUri: saved.uri });
      } else if (saved.error && saved.error !== 'insufficient_storage') {
        // Recording could not be persisted: keep the queue entry metadata-only
        // (sync still possible) but surface the failure honestly.
        setError(`Assessment saved, but the recording could not be stored (${saved.message || 'unknown error'}). It will sync without video data.`);
      } else if (saved.error === 'insufficient_storage') {
        // Not enough space to keep any recording: roll back the queue entry so
        // the user does not end up with a phantom "saved" assessment.
        await removeQueuedAssessment(entry.localId);
        throw new Error(saved.message || 'Not enough storage on this device.');
      }

      const q = await getQueuedAssessments();
      const pending = q.filter(x => x.syncStatus !== 'completed').length;
      setPendingSyncCount(pending);
      setQueueItems(q); // show the pending-sync card immediately (offline there are no sync events to trigger refresh)
      // Clear status: SAVED LOCALLY ONLY — not analyzed, not completed.
      setOfflineSaved({ pendingCount: pending });
      setRecording(false);
      setElapsedMs(0);
      recordingModeRef.current = null;
    } catch (e) {
      setRecording(false);
      setElapsedMs(0);
      recordingModeRef.current = null;
      const msg = e instanceof Error ? e.message : 'Local save failed';
      setError(
        msg.includes('Duplicate')
          ? 'This assessment is already saved offline.'
          : `Offline save failed: ${msg}`
      );
    } finally {
      savingRef.current = false;
      setSubmitting(false);
    }
  };

  const startAssessment = async () => {
    if (submitting) return;
    setError(null);

    // OFFLINE: never attempt the API — record locally and queue for sync
    if (!isOnline) {
      if (!athleteId) {
        setError('Profile still loading. Please try again in a moment.');
        return;
      }
      setSubmitting(true);
      try {
        // Fail fast: check available storage BEFORE the user records something
        // that cannot be stored (insufficient space surfaces up-front).
        await assertEnoughStorageForRecording();
        createdKeyRef.current = `${athleteId}:${testType}:${Date.now()}`;
        recordingModeRef.current = 'offline';
        setInfo('Offline — this assessment will be saved to your device and synced later');
        setRecording(true);
        setElapsedMs(0);
      } catch (e: any) {
        setError(e?.message || 'Not enough storage on this device. Free up space and try again.');
        recordingModeRef.current = null;
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const created = await createAssessment({
        sport,
        testType,
        category: sport,
        videoUrl: null
      });
      const assessmentId = created?.data?._id;
      if (!assessmentId) {
        throw new Error('Assessment was created but no identifier was returned');
      }
      await updateAssessmentStatus(assessmentId, 'processing');
      setRecording(false);
      setElapsedMs(0);
      recordingModeRef.current = null;
      navigation.navigate('AnalysisResults', { assessmentId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start assessment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStopRecording = () => {
    // A recording STARTED offline is finished offline (sticky mode): network
    // returning mid-recording must not discard the capture or hit the API.
    if (recording && recordingModeRef.current === 'offline') {
      void finishOfflineSave();
      return;
    }
    setRecording(false);
    setElapsedMs(0);
    recordingModeRef.current = null;
  };

  /** User explicitly cancels the in-progress assessment: discard it entirely
   *  (nothing queued, nothing stored, no server call). */
  const onCancelRecording = () => {
    if (submitting) return;
    setRecording(false);
    setElapsedMs(0);
    recordingModeRef.current = null;
    createdKeyRef.current = '';
    setInfo(null);
    setError(null);
  };

  const formatTime = () => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    const cs = String(Math.floor((elapsedMs % 1000) / 10)).padStart(2, '0');
    return `${mm}:${ss}.${cs}`;
  };

  const cameraCard = (
    <View style={[styles.cameraCard, isMd && { aspectRatio: 16 / 9 }]}>
      <Image source={{ uri: CAMERA_IMG }} style={styles.cameraImage} />
      <SkeletonOverlay variant="camera" animate />
      <View style={styles.guideWrap}>
        <View style={[styles.guideBox, recording && styles.guideBoxActive]}>
          <View style={styles.alignPill}>
            <Text style={styles.alignPillText}>ALIGN CENTER</Text>
          </View>
        </View>
      </View>

      <View style={styles.statusColumn}>
        {!isOnline ? (
          <View style={styles.offlineBadge}>
            <Icon name="wifi-off" size={12} color="#ffffff" />
            <Text style={styles.offlineBadgeText}>OFFLINE MODE</Text>
          </View>
        ) : null}
        <View style={styles.glassBadge}>
          <Icon name="videocam" size={14} color={Colors.secondary} />
          <Text style={styles.badgeText}>LIVE FEED: 1080P</Text>
        </View>
        <View style={styles.glassBadge}>
          <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />
          <Text style={styles.badgeText}>{submitting ? 'CREATING SESSION...' : 'AI PROCESSING ACTIVE'}</Text>
        </View>
      </View>
      <View style={styles.timerBadge}>
        <Icon name="timer" size={14} color="#ffffff" />
        <Text style={styles.timerText}>{formatTime()}</Text>
      </View>

      <View style={styles.controlBar}>
        <View>
          <Text style={styles.detectionLabel}>DETECTION STATUS</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="check-circle" size={16} color={Colors.tertiaryFixed} />
              <Text style={styles.detectionOk}>BODY FOUND</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="cancel" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.detectionOff}>FLOOR VISIBLE</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <TouchableOpacity
            style={[styles.circleGlassBtn, submitting && styles.disabled]}
            disabled={submitting}
            onPress={recording ? onCancelRecording : onStopRecording}
            accessibilityLabel={recording ? 'Cancel assessment' : 'Restart assessment'}
          >
            <Icon name={recording ? 'close' : 'refresh'} size={22} color={recording ? Colors.error : Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={submitting}
            onPress={() => (recording ? onStopRecording() : startAssessment())}
            style={[styles.recordBtn, recording && styles.recordBtnStop, submitting && styles.disabled]}
          >
            <Animated.View
              style={[
                styles.recordDot,
                recording && { borderRadius: 2, backgroundColor: Colors.error, opacity: pulse }
              ]}
            />
            <Text style={styles.recordBtnText}>
              {submitting ? 'STARTING...' : recording ? 'STOP' : 'RECORD'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.circleGlassBtn}>
            <Icon name="settings" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.fpsLabel}>FPS</Text>
            <Text style={styles.fpsValue}>60</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const offlineSavedCard = offlineSaved ? (
    <View style={[styles.cameraCard, styles.savedCard, isMd && { aspectRatio: undefined }]}>
      <Icon name="save" size={44} color={Colors.secondaryFixed ?? Colors.secondary} />
      <Text style={styles.savedTitle}>ASSESSMENT SAVED OFFLINE</Text>
      <Text style={styles.savedBody}>
        Assessment saved. It will sync when you're back online.{'\n'}It has not been analyzed yet — results
        will appear once it syncs and analysis finishes.
      </Text>
      <View style={styles.savedPill}>
        <Text style={styles.savedPillText}>
          WAITING FOR SYNC • {offlineSaved.pendingCount} PENDING
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.recordBtn, submitting && styles.disabled]}
        disabled={submitting}
        onPress={() => setOfflineSaved(null)}
      >
        <Text style={styles.recordBtnText}>RECORD ANOTHER</Text>
      </TouchableOpacity>
    </View>
  ) : null;


  const validationGrid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md }}>
      {VALIDATIONS.map(v => (
        <View key={v.label} style={[styles.validationCard, isMd && { flex: 1, minWidth: 0 }]}>
          <View style={[styles.validationIconBox, { backgroundColor: v.iconBg }]}>
            <Icon name={v.icon} size={24} color={v.iconColor} />
          </View>
          <View>
            <Text style={styles.validationLabel}>{v.label}</Text>
            <Text style={styles.validationValue}>{v.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const assessmentCard = (
    <View style={styles.infoCard}>
      <Text style={styles.currentLabel}>CURRENT ASSESSMENT</Text>

      <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm }]}>
        TEST TYPE
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.xs }}
      >
        {TEST_TYPES.map(t => {
          const active = t.value === testType;
          return (
            <TouchableOpacity
              key={t.value}
              disabled={submitting}
              onPress={() => setTestType(t.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text
        style={[
          Typography.labelCaps,
          { fontSize: 10, color: Colors.onSurfaceVariant, marginTop: Spacing.md, marginBottom: Spacing.sm }
        ]}
      >
        SPORT
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        {SPORTS.map(s => {
          const active = s === sport;
          return (
            <TouchableOpacity
              key={s}
              disabled={submitting}
              onPress={() => setSport(s)}
              style={[styles.sportChip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[isMd ? Typography.headlineLg : Typography.headlineLgMobile, { marginTop: Spacing.lg }]}>
        {selectedTest.label}
      </Text>
      <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.sm, lineHeight: 26 }]}>
        {selectedTest.blurb} Your session is stored with a unique code and tracked end-to-end.
      </Text>
      <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
        {STEPS.map((step, i) => (
          <View key={step.title} style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={styles.stepNumberCircle}>
              <Text style={styles.stepNumberText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const biometricsCard = (
    <View style={styles.biometricsCard}>
      <View style={styles.biometricWatermark}>
        <Icon name="analytics" size={96} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.biometricsLabel}>LIVE BIOMETRICS</Text>
      {isMd ? (
        <View>
          {[0, 2].map(row => (
            <View
              key={row}
              style={{
                flexDirection: 'row',
                gap: Spacing.md,
                marginBottom: row === 0 ? Spacing.md : 0
              }}
            >
              {LIVE_METRICS.slice(row, row + 2).map(m => (
                <View key={m.label} style={{ flex: 1 }}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.metricsGrid}>
          {LIVE_METRICS.map(m => (
            <View key={m.label}>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.historicalDivider}>
        <TouchableOpacity
          style={[styles.historicalBtn, submitting && styles.disabled]}
          disabled={submitting}
          onPress={startAssessment}
        >
          <Text style={styles.historicalBtnText}>
            {submitting ? 'STARTING SESSION...' : 'START RECORDING SESSION'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const reliabilityCard = (
    <View style={[styles.infoCard, isMd && { backgroundColor: Glass.backgroundColor, borderColor: Glass.borderColor }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
        <Text style={styles.cardCapsLabel}>RELIABILITY SCORE</Text>
        <Text style={styles.reliabilityValue}>EXCELLENT</Text>
      </View>
      <View style={styles.reliabilityTrack}>
        <View style={[styles.reliabilityFill, { width: '92%' }]} />
      </View>
      <Text style={styles.reliabilityNote}>
        Calculated based on lighting, motion blur, and skeleton confidence intervals.
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md }}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.brand}>TalentScope AI</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="arrow-back-ios" size={13} color={Colors.onSurfaceVariant} />
            <Text style={styles.backLabel}>BACK TO ANALYTICS</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerRecordBtn, submitting && styles.disabled]}
          activeOpacity={0.85}
          disabled={submitting}
          onPress={() => (recording ? onStopRecording() : startAssessment())}
        >
          <Text style={styles.headerRecordText}>
            {submitting ? 'STARTING...' : recording ? 'STOP RECORDING' : 'START ASSESSMENT'}
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { marginHorizontal: padH }]}>
          <Icon name="error-outline" size={18} color={Colors.onError} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={18} color={Colors.onError} />
          </TouchableOpacity>
        </View>
      ) : null}

      {info && !error && !offlineSaved ? (
        <View style={[styles.offlineHint, { marginHorizontal: padH }]}>
          <Icon name="wifi-off" size={14} color={Colors.onSurfaceVariant} />
          <Text style={styles.offlineHintText}>{info}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.body,
          { paddingHorizontal: padH },
          isMd && { alignSelf: 'center', width: '100%', maxWidth: CONTAINER_MAX, paddingBottom: Spacing.xl }
        ]}
      >
        {queueItems.length > 0 ? (
          <View style={styles.syncCard}>
            <View style={styles.syncHeader}>
              <Text style={styles.syncTitle}>{`PENDING SYNC (${pendingSyncCount})`}</Text>
              {failedCount > 0 ? (
                <TouchableOpacity
                  style={[styles.retrySyncBtn, retrying && styles.disabled]}
                  disabled={retrying}
                  onPress={onManualRetry}
                >
                  <Icon name="refresh" size={14} color={Colors.onSecondary} />
                  <Text style={styles.retrySyncText}>{retrying ? 'RETRYING...' : 'RETRY SYNC'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.syncSubtitle}>
              {isOnline ? 'Connected — syncing automatically' : 'Offline — assessments will sync when connected'}
            </Text>
            {queueItems.map(item => {
              const chip = syncChipFor(item.syncStatus);
              const message = syncMessageFor(item, isOnline);
              const isFailedRow = item.syncStatus === 'failed';
              return (
                <View key={item.localId} style={styles.syncRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.syncRowTitle}>
                      {[String(item.testType || '').replace(/_/g, ' '), item.sport].filter(Boolean).join(' • ')}
                    </Text>
                    <Text
                      style={isFailedRow ? styles.syncRowError : styles.syncRowMessage}
                      numberOfLines={2}
                    >
                      {message}
                    </Text>
                  </View>
                  <View style={[styles.statusChipSm, { backgroundColor: `${chip.color}22` }]}>
                    <Text style={[styles.statusChipSmText, { color: chip.color }]}>{chip.text}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        {isLg ? (
          <View style={{ flexDirection: 'row', gap: Spacing.gutter, alignItems: 'flex-start' }}>
            <View style={{ flex: 2, gap: Spacing.md }}>
              {offlineSaved ? offlineSavedCard : cameraCard}
              {validationGrid}
            </View>
            <View style={{ flex: 1, gap: Spacing.gutter }}>
              {assessmentCard}
              {biometricsCard}
              {reliabilityCard}
            </View>
          </View>
        ) : (
          <>
            {offlineSaved ? offlineSavedCard : cameraCard}
            {validationGrid}
            {assessmentCard}
            {biometricsCard}
            {reliabilityCard}
          </>
        )}
      </View>

      {isLg && (
        <View style={styles.desktopFooter}>
          <View style={{ gap: Spacing.xs }}>
            <Text style={styles.footerBrand}>TalentScope AI</Text>
            <Text style={styles.footerCopy}>© 2024 TalentScope AI. Professional Grade Performance Analysis.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.lg }}>
            {['Privacy Policy', 'Terms of Service', 'AI Ethics', 'Contact Support'].map(l => (
              <Text key={l} style={styles.footerLink}>
                {l}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 44,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.marginMobile,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  brand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary, lineHeight: 28 },
  backLabel: { ...Typography.labelCaps, fontSize: 11, letterSpacing: 1.4, color: Colors.onSurfaceVariant },
  headerRecordBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base
  },
  headerRecordText: { ...Typography.labelCaps, letterSpacing: 2.2, color: Colors.onPrimary },
  offlineHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md
  },
  offlineHintText: { ...Typography.bodyMd, fontSize: 13, color: Colors.onSurfaceVariant },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3
  },
  offlineBadgeText: { ...Typography.labelCaps, fontSize: 9, color: Colors.onPrimary },
  savedCard: { alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  syncCard: {
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg
  },
  syncHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  syncTitle: { ...Typography.headlineMd, fontSize: 16, color: Colors.onSurface },
  retrySyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36
  },
  retrySyncText: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSecondary },
  syncSubtitle: { ...Typography.bodyMd, fontSize: 12, color: Colors.onSurfaceVariant, marginBottom: Spacing.sm },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.3)',
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs
  },
  syncRowTitle: { ...Typography.bodyMd, fontWeight: '600', color: Colors.onSurface, flex: 1 },
  syncRowError: { ...Typography.bodyMd, fontSize: 11, color: Colors.error },
  syncRowMessage: { ...Typography.bodyMd, fontSize: 11, color: Colors.onSurfaceVariant },
  statusChipSm: { borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  statusChipSmText: { ...Typography.labelCaps, fontSize: 9 },
  savedTitle: { ...Typography.headlineMd, color: Colors.onSurface, textAlign: 'center' },
  savedBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', maxWidth: 420 },
  savedPill: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs
  },
  savedPillText: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSecondaryContainer },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm
  },
  errorBannerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.onError },
  disabled: { opacity: 0.6 },
  body: {
    flex: 1,
    padding: Spacing.marginMobile,
    paddingBottom: 120,
    gap: Spacing.md
  },
  cameraCard: {
    aspectRatio: 16 / 10,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden'
  },
  cameraImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6
  },
  guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guideBox: {
    width: '33%',
    height: '75%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(172,237,255,0.4)',
    borderRadius: 12,
    alignItems: 'center',
    paddingTop: 32
  },
  guideBoxActive: { borderColor: Colors.secondaryFixed, borderStyle: 'solid' },
  alignPill: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: 999
  },
  alignPillText: { ...Typography.labelCaps, fontSize: 10, letterSpacing: 1.8, color: Colors.onSecondaryContainer },
  statusColumn: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    gap: Spacing.sm
  },
  glassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Glass.backgroundColor,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs
  },
  badgeText: { ...Typography.labelCaps, fontSize: 10, letterSpacing: 1.2, color: Colors.onSurface },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.tertiaryFixedDim },
  timerBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.error,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs
  },
  timerText: { ...Typography.monoData, color: '#ffffff' },
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)'
  },
  detectionLabel: {
    ...Typography.labelCaps,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: Spacing.xs
  },
  detectionOk: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700', color: Colors.tertiaryFixed },
  detectionOff: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  circleGlassBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Glass.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center'
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8
  },
  recordBtnStop: { backgroundColor: Colors.secondaryFixed },
  recordDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error },
  recordBtnText: { ...Typography.headlineMd, fontSize: 20, lineHeight: 26, color: '#000000' },
  fpsLabel: { ...Typography.labelCaps, fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  fpsValue: { ...Typography.headlineMd, color: '#ffffff', textAlign: 'right', fontSize: 20, lineHeight: 26 },
  validationCard: {
    flexGrow: 1,
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    padding: Spacing.md
  },
  validationIconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  validationLabel: { ...Typography.labelCaps, fontSize: 10, color: Colors.onSurfaceVariant },
  validationValue: { ...Typography.headlineMd, fontSize: 16, lineHeight: 22, color: Colors.primary, marginTop: 2 },
  infoCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    padding: Spacing.md
  },
  currentLabel: {
    ...Typography.labelCaps,
    letterSpacing: 3.2,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.md
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLowest
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { ...Typography.labelCaps, fontSize: 11, letterSpacing: 1, color: Colors.onSurfaceVariant },
  chipTextActive: { color: Colors.onPrimary },
  sportChip: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 999,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceContainerLowest
  },
  stepNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumberText: { ...Typography.monoData, color: Colors.onPrimary },
  stepTitle: { ...Typography.headlineMd, fontSize: 16, lineHeight: 22, color: Colors.primary, marginBottom: Spacing.xs },
  stepBody: { ...Typography.bodyMd, fontSize: 14, color: Colors.onSurfaceVariant },
  biometricsCard: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    overflow: 'hidden'
  },
  biometricWatermark: { position: 'absolute', top: 0, right: 0, padding: Spacing.md, opacity: 0.5 },
  biometricsLabel: { ...Typography.labelCaps, letterSpacing: 3.2, color: Colors.onPrimaryContainer, marginBottom: Spacing.md },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md
  },
  metricLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.onPrimaryContainer },
  metricValue: { ...Typography.headlineMd, fontSize: 19, lineHeight: 26, marginTop: 2 },
  historicalDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md
  },
  historicalBtn: {
    width: '100%',
    paddingVertical: Spacing.base,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  historicalBtnText: { ...Typography.labelCaps, letterSpacing: 2.2, color: '#ffffff' },
  cardCapsLabel: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSurfaceVariant },
  reliabilityValue: { ...Typography.monoData, color: Colors.secondary, fontFamily: 'Inter_700Bold' },
  reliabilityTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden'
  },
  reliabilityFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 999 },
  reliabilityNote: {
    ...Typography.bodyMd,
    fontSize: 12,
    fontStyle: 'italic',
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.sm
  },
  desktopFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.marginDesktop,
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.1)'
  },
  footerBrand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary },
  footerCopy: { ...Typography.bodyMd, fontSize: 14, color: Colors.onSurfaceVariant, opacity: 0.8 },
  footerLink: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, opacity: 0.8 }
});
