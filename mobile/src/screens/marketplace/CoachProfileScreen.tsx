import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import { getCoaches, getCoachById, bookConsultation } from '../../services/api';

export default function CoachProfileScreen({ navigation, route }: any) {
  const scrollRef = useRef<ScrollView>(null);
  const [coach, setCoach] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const coachId: string | undefined = route?.params?.coachId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    try {
      let data: any = null;
      if (coachId) {
        const res = await getCoachById(coachId);
        data = res?.data || null;
      } else {
        const res = await getCoaches();
        const list = Array.isArray(res?.data) ? res.data : [];
        data = list[0] || null;
      }
      if (data) {
        setCoach(data);
      } else {
        setCoach(null);
        setNotFound(true);
      }
    } catch (e: any) {
      setCoach(null);
      setLoadError(e?.message || 'Failed to load coach profile');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    load();
  }, [load]);

  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: 1440 };

  const submitBooking = async () => {
    if (!coach?._id || submitting) return;
    setSubmitting(true);
    setBookingError(null);
    setBookingSuccess(null);
    try {
      await bookConsultation({
        coachId: coach._id,
        athleteNotes: bookingNotes.trim() || undefined,
        scheduledDate: bookingDate.trim() ? bookingDate.trim() : null
      });
      setBookingSuccess(`Request sent to ${coach.name}`);
      setBookingNotes('');
      setBookingDate('');
    } catch (e: any) {
      setBookingError(e?.message || 'Failed to send booking request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <StatusBar />
        <ProfileHeader navigation={navigation} avatarUri={null} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.secondary} />
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.md }]}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  if (notFound || !coach) {
    return (
      <View style={styles.root}>
        <StatusBar />
        <ProfileHeader navigation={navigation} avatarUri={null} />
        <View style={[styles.centerState, { paddingHorizontal: padH }]}>
          <View style={[Glass, styles.stateCard]}>
            <Icon name="person-search" size={40} color={Colors.outline} />
            <Text style={[Typography.headlineMd, { marginTop: Spacing.md }]}>No coach available</Text>
            <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
              We couldn't find this coach's profile.
            </Text>
            <TouchableOpacity style={styles.retryBtn} activeOpacity={0.85} onPress={() => navigation.goBack()}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.root}>
        <StatusBar />
        <ProfileHeader navigation={navigation} avatarUri={null} />
        <View style={[styles.centerState, { paddingHorizontal: padH }]}>
          <View style={[Glass, styles.stateCard]}>
            <Icon name="cloud-off" size={40} color={Colors.outline} />
            <Text style={[Typography.headlineMd, { marginTop: Spacing.md }]}>Couldn't load profile</Text>
            <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} activeOpacity={0.85} onPress={load}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const photoUri = typeof coach.avatar === 'string' && coach.avatar ? coach.avatar : null;
  const title = coach.title || '';
  const rating = coach.rating != null ? String(coach.rating) : null;
  const reviewsCount = coach.reviewsCount != null && coach.reviewsCount > 0 ? String(coach.reviewsCount) : null;
  const experienceYears = coach.experienceYears != null ? `${coach.experienceYears}+ Years of Experience` : null;
  const affiliation = coach.affiliation || null;
  const bio = coach.bio || null;
  const credentials = Array.isArray(coach.credentials) ? coach.credentials.filter(Boolean) : [];
  const specialties = Array.isArray(coach.specialties) ? coach.specialties.filter(Boolean) : [];
  const hourlyRate = coach.hourlyRate != null && coach.hourlyRate !== '' ? String(coach.hourlyRate) : null;

  const photoBlock = (
    <View style={[styles.heroPhotoWrap, isLg && { width: '100%' }]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.heroPhoto} />
      ) : (
        <View style={[styles.heroPhoto, styles.heroPhotoPlaceholder]}>
          <Icon name="person" size={72} color={Colors.onSurfaceVariant} />
        </View>
      )}
      {coach.verified && (
        <View style={[styles.eliteBadge, isLg && { bottom: -16, right: -16 }]}>
          <Icon name="verified" size={14} color={Colors.onSecondaryContainer} />
          <Text style={styles.eliteBadgeText}>VERIFIED COACH</Text>
        </View>
      )}
    </View>
  );

  const infoBlock = (
    <>
      {title ? (
        <Text style={[Typography.labelCaps, { fontSize: 11, letterSpacing: 2.4, color: Colors.secondary }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <Text style={[Typography.displayHero, !isLg && { fontSize: 34, lineHeight: 40, letterSpacing: -1.4 }, !isLg && { marginTop: 4 }]}>
        {coach.name}
      </Text>
      {(affiliation || rating || experienceYears) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.base }}>
          {affiliation && <MetaChip icon="location-on" text={affiliation} />}
          {rating && <MetaChip icon="star" text={rating} bold suffix={reviewsCount ? `(${reviewsCount} reviews)` : undefined} />}
          {experienceYears && <MetaChip icon="workspace-premium" text={experienceYears} />}
        </View>
      )}
      {bio && (
        <Text
          style={[
            Typography.bodyLg,
            { color: Colors.onSurfaceVariant, marginTop: Spacing.md },
            isLg ? { maxWidth: 672 } : { fontSize: 16, lineHeight: 25 }
          ]}
        >
          {bio}
        </Text>
      )}
      {specialties.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md }}>
          {specialties.slice(0, 4).map(s => (
            <View key={s} style={styles.certChip}>
              <Text style={styles.certChipText}>{s.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
        <TouchableOpacity style={styles.bookAssessmentBtn} activeOpacity={0.85} onPress={() => submitBooking()} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Text style={styles.bookAssessmentText}>Book Consultation</Text>
              <Icon name="calendar-today" size={18} color="#ffffff" />
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.portfolioBtn}
          activeOpacity={0.85}
          onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Text style={styles.portfolioText}>Book Consultation</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const bioCard = bio ? (
    <SectionCard label="BIOGRAPHY">
      <Text style={styles.proseParagraph}>{bio}</Text>
    </SectionCard>
  ) : null;

  const experienceCard =
    Array.isArray(coach.experience) && coach.experience.length > 0 ? (
      <SectionCard label="PROFESSIONAL EXPERIENCE">
        <View style={{ gap: Spacing.md }}>
          {coach.experience.map((e: any, i: number) => (
            <View key={`${e.role}-${i}`} style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.timelineDot, i === 0 && styles.timelineDotActive]} />
                <View style={styles.timelineLine} />
              </View>
              <View style={{ flex: 1, paddingBottom: Spacing.sm }}>
                <Text style={styles.timelineRole}>{e.role}</Text>
                {e.period ? (
                  <Text style={[Typography.labelCaps, { fontSize: 10, color: Colors.secondary, marginTop: 4 }]}>
                    {String(e.period).toUpperCase()}
                  </Text>
                ) : null}
                {e.body ? (
                  <Text style={[Typography.bodyMd, { fontSize: 14, color: Colors.onSurfaceVariant, marginTop: Spacing.sm }]}>
                    {e.body}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </SectionCard>
    ) : null;

  const bookingCard = (
    <View style={styles.bookingCard}>
      <Text style={[Typography.labelCaps, { color: 'rgba(255,255,255,0.6)', marginBottom: Spacing.md }]}>BOOK A CONSULTATION</Text>
      {hourlyRate && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.md }}>
          <Text style={{ fontFamily: 'Geist_600SemiBold', fontSize: 26, fontWeight: '700', color: '#ffffff' }}>{hourlyRate}</Text>
          {!hourlyRate.includes('/') && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>/hr</Text>}
        </View>
      )}
      <TextInput
        value={bookingDate}
        onChangeText={setBookingDate}
        placeholder="Preferred date (YYYY-MM-DD)"
        placeholderTextColor="rgba(255,255,255,0.5)"
        style={styles.bookingInput}
      />
      <TextInput
        value={bookingNotes}
        onChangeText={setBookingNotes}
        placeholder="Notes for the coach (goals, injuries, availability)…"
        placeholderTextColor="rgba(255,255,255,0.5)"
        multiline
        numberOfLines={3}
        style={[styles.bookingInput, { height: 80, paddingTop: Spacing.base, textAlignVertical: 'top' }]}
      />
      {bookingSuccess && (
        <View style={styles.bookingFeedbackRow}>
          <Icon name="check-circle" size={16} color="#8FF0A4" />
          <Text style={[styles.slotNote, { marginTop: 0, flex: 1, textAlign: 'left', color: '#8FF0A4' }]}>{bookingSuccess}</Text>
        </View>
      )}
      {bookingError && (
        <View style={styles.bookingFeedbackRow}>
          <Icon name="error-outline" size={16} color="#FFB4AB" />
          <Text style={[styles.slotNote, { marginTop: 0, flex: 1, textAlign: 'left', color: '#FFB4AB' }]}>{bookingError}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.sessionBtn, submitting && { opacity: 0.6 }]}
        activeOpacity={0.85}
        onPress={submitBooking}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color={Colors.onSecondary} />
        ) : (
          <Text style={styles.sessionBtnText}>{bookingSuccess ? 'Request Sent' : 'Request Booking'}</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.slotNote}>The coach will confirm your requested slot.</Text>
    </View>
  );

  const pricingCard = hourlyRate ? (
    <SectionCard label="PRICING">
      <View style={styles.pricingRowWrap}>
        <View style={styles.pricingRow}>
          <View style={{ flex: 1 }}>
            <Text style={Typography.headlineMd}>1-on-1 Consultation</Text>
            <Text style={styles.pricingNote}>Direct consultation request with {coach.name}.</Text>
          </View>
          <Text style={styles.pricingValue}>{hourlyRate}</Text>
        </View>
      </View>
    </SectionCard>
  ) : null;

  const certificationsCard =
    credentials.length > 0 ? (
      <SectionCard label="CERTIFICATIONS">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {credentials.map(cert => (
            <View key={cert} style={styles.certChip}>
              <Text style={styles.certChipText}>{cert.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </SectionCard>
    ) : null;

  return (
    <View style={styles.root}>
      <StatusBar />
      <ProfileHeader navigation={navigation} avatarUri={photoUri} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: isLg ? Spacing.xl : 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: padH }}>
          <View style={container}>
            {/* Hero */}
            {isLg ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.gutter, paddingVertical: Spacing.xl }}>
                <View style={{ flex: 4 }}>{photoBlock}</View>
                <View style={{ flex: 8 }}>{infoBlock}</View>
              </View>
            ) : (
              <>
                <View style={{ paddingTop: Spacing.lg, flexDirection: 'row', gap: Spacing.md }}>{photoBlock}</View>
                <View style={{ marginTop: Spacing.md }}>{infoBlock}</View>
              </>
            )}

            {/* Bento Grid */}
            {isLg ? (
              <View style={{ flexDirection: 'row', gap: Spacing.gutter, marginTop: Spacing.lg, alignItems: 'flex-start' }}>
                <View style={{ flex: 8, gap: Spacing.gutter }}>
                  {bioCard}
                  {experienceCard}
                </View>
                <View style={{ flex: 4, gap: Spacing.gutter }}>
                  {bookingCard}
                  {pricingCard}
                  {certificationsCard}
                </View>
              </View>
            ) : (
              <>
                <View style={{ marginTop: Spacing.xl, gap: Spacing.gutter }}>
                  {bioCard}
                  {experienceCard}
                </View>
                <View style={{ marginTop: Spacing.gutter, gap: Spacing.gutter }}>
                  {bookingCard}
                  {pricingCard}
                  {certificationsCard}
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileHeader({ navigation, avatarUri }: { navigation: any; avatarUri: string | null }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>TalentScope AI</Text>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={18} color={Colors.onSurfaceVariant} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.headerAvatar} />
      ) : (
        <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
          <Icon name="person" size={22} color={Colors.onSurfaceVariant} />
        </View>
      )}
    </View>
  );
}

function MetaChip({ icon, text, bold, suffix }: { icon: keyof typeof Icon.glyphMap; text: string; bold?: boolean; suffix?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={17} color={Colors.onSurfaceVariant} />
      <Text style={[Typography.bodyMd, { fontSize: 14 }, bold && { fontFamily: 'Inter_700Bold', fontWeight: '700' }]}>
        {text}
        {suffix ? <Text style={{ opacity: 0.6, fontSize: 13 }}> {suffix}</Text> : null}
      </Text>
    </View>
  );
}

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={[Glass, styles.sectionCard]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)'
  },
  brand: { ...Typography.headlineMd, letterSpacing: -0.8, color: Colors.primary },
  backText: { fontFamily: 'Inter_500Medium', fontSize: 14, fontWeight: '500', color: Colors.onSurfaceVariant },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarPlaceholder: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stateCard: { borderRadius: 12, padding: Spacing.lg, alignItems: 'center', width: '100%', maxWidth: 420 },
  retryBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base,
    marginTop: Spacing.lg
  },
  retryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.onSecondary },
  heroPhotoWrap: { width: '55%' },
  heroPhoto: { aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(198,198,205,0.2)' },
  heroPhotoPlaceholder: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eliteBadge: {
    position: 'absolute',
    bottom: -12,
    right: -12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5
  },
  eliteBadgeText: { ...Typography.labelCaps, fontSize: 11, color: Colors.onSecondaryContainer },
  sectionCard: { borderRadius: 12, padding: Spacing.md },
  sectionLabel: { ...Typography.labelCaps, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
  proseParagraph: { ...Typography.bodyMd, lineHeight: 26, color: Colors.onSurfaceVariant },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.outline },
  timelineDotActive: { backgroundColor: Colors.secondary, shadowColor: Colors.secondary, shadowOpacity: 0.25, shadowRadius: 6 },
  timelineLine: { width: 1, flex: 1, minHeight: 48, backgroundColor: 'rgba(198,198,205,0.35)', marginVertical: 4 },
  timelineRole: { ...Typography.headlineMd, fontSize: 19, lineHeight: 25 },
  bookingCard: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8
  },
  bookingInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    marginBottom: Spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#ffffff'
  },
  bookingFeedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sessionBtn: {
    width: '100%',
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.base,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.base
  },
  sessionBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700', color: Colors.onSecondary },
  slotNote: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.sm },
  pricingRowWrap: {},
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  pricingNote: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 },
  pricingValue: { ...Typography.headlineMd, fontSize: 20, lineHeight: 26, fontFamily: 'Geist_600SemiBold', fontWeight: '700' },
  certChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)'
  },
  certChipText: { fontSize: 12, fontFamily: 'Inter_700Bold', fontWeight: '700' },
  bookAssessmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.sm + 2
  },
  bookAssessmentText: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700', color: Colors.onPrimary },
  portfolioBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: Colors.secondary,
    borderRadius: 8,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  portfolioText: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700', color: Colors.secondary }
});
