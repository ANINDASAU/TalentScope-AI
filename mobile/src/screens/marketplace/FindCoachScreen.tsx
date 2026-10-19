import React, { useEffect, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions, StyleSheet } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';
import { getCoaches } from '../../services/api';

const PACKAGES = [
  {
    label: 'FOUNDATION',
    price: '$49',
    dark: false,
    features: [
      { text: '3 AI Assessments/mo', included: true },
      { text: 'Public Marketplace Access', included: true },
      { text: 'Elite Biometric Tracking', included: false }
    ],
    cta: 'Select Foundation'
  },
  {
    label: 'ELITE PERFORMANCE',
    price: '$199',
    dark: true,
    features: [
      { text: 'Unlimited AI Assessments', included: true },
      { text: '1-on-1 Strategy Session', included: true },
      { text: 'Full Biometric Dashboard', included: true }
    ],
    cta: 'Get Elite Access'
  },
  {
    label: 'TEAM / PRO',
    price: '$499',
    dark: false,
    features: [
      { text: 'Multi-Athlete Monitoring', included: true },
      { text: 'Custom AI Integration', included: true },
      { text: 'Dedicated Support API', included: true }
    ],
    cta: 'Contact Enterprise'
  }
];

const SPORT_OPTIONS = ['All Sports', 'Football / Soccer', 'Athletics', 'Swimming', 'Strength & Conditioning'];
const EXP_OPTIONS = ['Any Years', '5+ Years', '10+ Years', 'Professional Only'];

export default function FindCoachScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const isXL = width >= 1280;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

  const grid = (nodes: React.ReactNode[], cols: number, gap: number) => {
    if (cols <= 1) return <View style={{ gap }}>{nodes}</View>;
    const rows: React.ReactNode[][] = [];
    for (let i = 0; i < nodes.length; i += cols) rows.push(nodes.slice(i, i + cols));
    return (
      <View>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap, marginBottom: ri < rows.length - 1 ? gap : 0 }}>
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

  const [sport, setSport] = useState(SPORT_OPTIONS[0]);
  const [experience, setExperience] = useState(EXP_OPTIONS[0]);
  const [location, setLocation] = useState('');
  const [priceRange, setPriceRange] = useState(50);
  const [searchQuery, setSearchQuery] = useState('');
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCoaches = async (opts?: { search?: string; specialty?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCoaches({
        search: opts?.search?.trim() || undefined,
        specialty: opts?.specialty && opts.specialty !== SPORT_OPTIONS[0] ? opts.specialty : undefined
      });
      setCoaches(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load coaches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoaches();
  }, []);

  const applyFilters = () => loadCoaches({ search: searchQuery, specialty: sport });

  const displayedCards = coaches.map(c => ({
    id: c._id,
    img: typeof c.avatar === 'string' && c.avatar ? c.avatar : null,
    rating: c.rating != null ? String(c.rating) : null,
    specialty: (c.title || (Array.isArray(c.specialties) && c.specialties[0]) || '').toUpperCase(),
    name: c.name || 'Coach',
    exp: c.experienceYears != null ? `${c.experienceYears}+ Years of Experience` : null,
    price: c.hourlyRate != null && c.hourlyRate !== '' ? String(c.hourlyRate) : null,
    quote: c.bio ? `"${c.bio}"` : null,
    tags: Array.isArray(c.specialties) ? c.specialties.slice(0, 3) : []
  }));

  return (
    <View style={[styles.root, isLg && { flexDirection: 'row' }]}>
      {isLg && <SideNav navigation={navigation} />}
      <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.brand}>TalentScope AI</Text>
        <View style={styles.headerSearch}>
          <Icon name="search" size={18} color={Colors.onSurfaceVariant} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={applyFilters}
            returnKeyType="search"
            placeholder="Search experts..."
            placeholderTextColor="rgba(118,119,125,0.6)"
            style={styles.headerSearchInput}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: isLg ? Spacing.xl : 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: padH }}>
        <View style={container}>
        {/* Hero */}
        <View
          style={[
            styles.heroSection,
            isMd && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: Spacing.md, marginBottom: Spacing.xl }
          ]}
        >
          <View style={{ flexShrink: 1 }}>
            <Text style={[Typography.labelCaps, { color: Colors.secondary, marginBottom: Spacing.xs }]}>ELITE NETWORK</Text>
            <Text style={[Typography.displayHero, !isMd && { fontSize: 36, lineHeight: 42, letterSpacing: -1.4 }]}>
              Discover High Performance.
            </Text>
            <Text
              style={[
                Typography.bodyLg,
                { color: Colors.onSurfaceVariant, marginTop: Spacing.base },
                isMd ? { maxWidth: 576 } : { fontSize: 16, lineHeight: 25 }
              ]}
            >
              Access verified AI-enhanced coaches specializing in elite biometrics and professional performance optimization.
            </Text>
          </View>
        </View>

        {/* Filter Bar */}
        <View style={[styles.filterBar, { marginTop: isMd ? 0 : Spacing.lg }]}>
          <View style={isMd ? { flex: 1, minWidth: 200 } : { width: '47%', flexGrow: 1 }}>
            <Text style={styles.filterLabel}>SPORT CATEGORY</Text>
            <OptionSelector
              options={SPORT_OPTIONS}
              value={sport}
              onChange={v => {
                setSport(v);
                loadCoaches({ search: searchQuery, specialty: v });
              }}
            />
          </View>
          <View style={isMd ? { flex: 1, minWidth: 200 } : { width: '47%', flexGrow: 1 }}>
            <Text style={styles.filterLabel}>LOCATION</Text>
            <View style={styles.locationWrap}>
              <Icon name="location-on" size={16} color={Colors.onSurfaceVariant} />
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Search city..."
                placeholderTextColor={Colors.onSurfaceVariant}
                style={styles.locationInput}
              />
            </View>
          </View>
          <View style={isMd ? { flex: 1, minWidth: 200 } : { width: '47%', flexGrow: 1 }}>
            <Text style={styles.filterLabel}>EXPERIENCE</Text>
            <OptionSelector options={EXP_OPTIONS} value={experience} onChange={setExperience} />
          </View>
          <View style={isMd ? { flex: 1, minWidth: 200 } : { width: '47%', flexGrow: 1 }}>
            <Text style={styles.filterLabel}>PRICE RANGE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
              <Text style={styles.priceSymbol}>$</Text>
              <View style={styles.rangeTrack}>
                <TouchableOpacity style={[styles.rangeFillTouch, { width: `${priceRange}%` }]} onPress={() => setPriceRange(p => Math.min(p + 10, 100))}>
                  <View style={[styles.rangeThumb, { left: `${Math.max(priceRange - 4, 0)}%` }]} />
                </TouchableOpacity>
              </View>
              <Text style={styles.priceSymbol}>$$$</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85} onPress={applyFilters}>
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>

        {/* Coach Cards */}
        <View style={{ marginTop: Spacing.lg }}>
          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.md }]}>Loading coaches…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Icon name="cloud-off" size={40} color={Colors.outline} />
              <Text style={[Typography.headlineMd, { marginTop: Spacing.md }]}>Couldn't load coaches</Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>{error}</Text>
              <TouchableOpacity style={[styles.applyBtn, { alignSelf: 'center', marginTop: Spacing.lg }]} activeOpacity={0.85} onPress={() => loadCoaches({ search: searchQuery, specialty: sport })}>
                <Text style={styles.applyBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : displayedCards.length === 0 ? (
            <View style={styles.stateCard}>
              <Icon name="person-search" size={40} color={Colors.outline} />
              <Text style={[Typography.headlineMd, { marginTop: Spacing.md }]}>No coaches available yet</Text>
              <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
                Check back soon or try a different search.
              </Text>
            </View>
          ) : (
            grid(
              displayedCards.map(c => (
                <View key={c.id} style={styles.coachCard}>
                  <View>
                    {c.img ? (
                      <Image source={{ uri: c.img }} style={[styles.coachImage, isMd && { height: 256 }]} />
                    ) : (
                      <View style={[styles.coachImage, styles.coachImagePlaceholder, isMd && { height: 256 }]}>
                        <Icon name="person" size={56} color={Colors.onSurfaceVariant} />
                      </View>
                    )}
                    {c.rating && (
                      <View style={styles.ratingPill}>
                        <Icon name="star" size={15} color={Colors.secondary} />
                        <Text style={styles.ratingText}>{c.rating}</Text>
                      </View>
                    )}
                    {(c.specialty || c.name) && (
                      <View style={styles.nameGradient}>
                        {c.specialty ? (
                          <Text style={[Typography.labelCaps, { fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.85)' }]}>
                            {c.specialty}
                          </Text>
                        ) : null}
                        <Text style={styles.coachName}>{c.name}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ padding: Spacing.md, gap: Spacing.md }}>
                    {(c.exp || c.price) && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        {c.exp ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                            <Icon name="history-edu" size={20} color={Colors.onSurfaceVariant} />
                            <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, fontSize: 14 }]}>{c.exp}</Text>
                          </View>
                        ) : (
                          <View />
                        )}
                        {c.price && (
                          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={styles.price}>{c.price}</Text>
                            {!c.price.includes('/') && <Text style={styles.perHour}>/hr</Text>}
                          </View>
                        )}
                      </View>
                    )}
                    {c.quote && <Text style={styles.quote}>{c.quote}</Text>}
                    {c.tags.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                        {c.tags.map(t => (
                          <View key={t} style={styles.tagPill}>
                            <Text style={styles.tagText}>{t.toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingTop: Spacing.base }}>
                      <TouchableOpacity
                        style={styles.detailsBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('CoachProfile', { coachId: c.id })}
                      >
                        <Text style={styles.detailsBtnText}>See Details</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.bookBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('CoachProfile', { coachId: c.id })}
                      >
                        <Text style={styles.bookBtnText}>Book Consultation</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )),
              isXL ? 3 : isMd ? 2 : 1,
              Spacing.gutter
            )
          )}
        </View>

        {/* Membership Packages */}
        <View style={{ marginTop: Spacing.xl }}>
          <Text style={isMd ? Typography.headlineLg : Typography.headlineLgMobile}>Membership Packages</Text>
          <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant, marginTop: Spacing.xs }]}>
            Scalable elite performance coaching for every level of professional development.
          </Text>
          <View style={{ marginTop: Spacing.lg }}>
            {grid(
              PACKAGES.map(p => (
                <View
                  key={p.label}
                  style={[
                    p.dark ? styles.packageDark : styles.packageLight,
                    isMd && { padding: Spacing.lg },
                    p.dark && isMd && { transform: [{ scale: 1.05 }] }
                  ]}
                >
                {p.dark && <View style={styles.packageGlow} />}
                <Text style={[Typography.labelCaps, { letterSpacing: 3.2, marginBottom: Spacing.md, color: p.dark ? Colors.secondaryFixedDim : Colors.onSurfaceVariant }]}>
                  {p.label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.lg }}>
                  <Text
                    style={[
                      p.dark ? styles.packagePriceDark : styles.packagePrice,
                      isMd && { fontSize: 48, lineHeight: 53 }
                    ]}
                  >
                    {p.price}
                  </Text>
                  <Text style={[Typography.bodyMd, { marginLeft: 4, color: p.dark ? Colors.onPrimaryContainer : Colors.onSurfaceVariant }]}>
                    /mo
                  </Text>
                </View>
                {p.features.map(f => (
                  <View key={f.text} style={[styles.packageFeatureRow, !f.included && { opacity: 0.4 }]}>
                    <Icon
                      name={f.included ? (p.dark ? 'verified' : 'check-circle') : 'cancel'}
                      size={19}
                      color={p.dark ? Colors.secondaryFixed : f.included ? Colors.secondary : Colors.outline}
                    />
                    <Text style={[Typography.bodyMd, { flex: 1 }, p.dark && { color: '#ffffff' }]}>{f.text}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.packageBtn, p.dark ? styles.packageBtnDarkSolid : styles.packageBtnOutline]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.packageBtnText, p.dark ? { color: '#ffffff' } : {}]}>{p.cta}</Text>
                </TouchableOpacity>
              </View>
              )),
              isMd ? 3 : 1,
              Spacing.md
            )}
          </View>
        </View>
        </View>
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function SideNav({ navigation }: any) {
  const items = [
    { icon: 'dashboard' as const, label: 'Home', route: 'Home' },
    { icon: 'analytics' as const, label: 'Analysis', route: null },
    { icon: 'monitor-heart' as const, label: 'Injuries', route: null },
    { icon: 'trending-up' as const, label: 'Progress', route: 'Progress' },
    { icon: 'person-search' as const, label: 'Find Personal Coach', route: null, active: true },
    { icon: 'admin-panel-settings' as const, label: 'Admin', route: null }
  ];
  return (
    <View style={styles.sideNav}>
      <View style={{ gap: Spacing.xs, flexGrow: 1 }}>
        {items.map(item => (
          <TouchableOpacity
            key={item.label}
            disabled={!item.route}
            onPress={() => item.route && navigation.navigate(item.route)}
            style={[styles.sideNavItem, item.active && styles.sideNavItemActive]}
          >
            <Icon name={item.icon} size={22} color={item.active ? Colors.onSecondaryContainer : Colors.onSurfaceVariant} />
            <Text style={[Typography.bodyMd, item.active && { color: Colors.onSecondaryContainer, fontWeight: '600' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ gap: Spacing.xs, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(198,198,205,0.15)' }}>
        <View style={styles.sideNavItem}>
          <Icon name="settings" size={22} color={Colors.onSurfaceVariant} />
          <Text style={Typography.bodyMd}>Settings</Text>
        </View>
        <View style={styles.sideNavItem}>
          <Icon name="help" size={22} color={Colors.onSurfaceVariant} />
          <Text style={Typography.bodyMd}>Help</Text>
        </View>
      </View>
    </View>
  );
}

function OptionSelector({
  options,
  value,
  onChange
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(options[(options.indexOf(value) + 1) % options.length])}
      style={styles.selectBox}
      activeOpacity={0.8}
    >
      <Text style={styles.selectValue} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="expand-more" size={18} color={Colors.onSurfaceVariant} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  sideNav: {
    width: 256,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: 'rgba(198,198,205,0.15)',
    padding: Spacing.md,
    gap: Spacing.sm
  },
  sideNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 8
  },
  sideNavItemActive: {
    backgroundColor: Colors.secondaryContainer
  },
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
  brand: { ...Typography.headlineMd, fontSize: 20, lineHeight: 26, letterSpacing: -0.8, color: Colors.primary },
  headerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    width: 160
  },
  headerSearchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.onSurface, padding: 0 },
  heroSection: { paddingTop: Spacing.lg },
  filterBar: {
    marginTop: Spacing.lg,
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 12,
    padding: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4
  },
  filterLabel: { ...Typography.labelCaps, fontSize: 9, color: Colors.onSurfaceVariant, marginBottom: Spacing.xs },
  selectBox: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.base
  },
  selectValue: { ...Typography.bodyMd, fontSize: 14, color: Colors.onSurface, flexShrink: 1 },
  locationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm
  },
  locationInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.onSurface, paddingVertical: Spacing.base },
  rangeTrack: {
    flex: 1,
    height: 24,
    justifyContent: 'center'
  },
  rangeFillTouch: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'transparent'
  },
  rangeThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.secondary
  },
  priceSymbol: { ...Typography.bodyMd, fontSize: 14, color: Colors.onSurfaceVariant },
  applyBtn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.base
  },
  applyBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: '#ffffff' },
  coachCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4
  },
  coachImage: { width: '100%', height: 220 },
  coachImagePlaceholder: {
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12
  },
  ratingPill: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs
  },
  ratingText: { ...Typography.monoData },
  nameGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  coachName: { ...Typography.headlineMd, color: '#ffffff', marginTop: 2 },
  price: { fontFamily: 'Geist_600SemiBold', fontSize: 22, fontWeight: '700', color: Colors.primary },
  perHour: { ...Typography.bodyMd, fontSize: 14, color: Colors.onSurfaceVariant },
  quote: { ...Typography.bodyMd, fontStyle: 'italic', fontSize: 14, lineHeight: 21, color: Colors.onSurfaceVariant },
  tagPill: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 999
  },
  tagText: { fontSize: 11, fontFamily: 'Inter_700Bold', fontWeight: '700', color: Colors.onSurfaceVariant },
  detailsBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailsBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.primary },
  bookBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bookBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', color: Colors.onPrimary },
  packageLight: {
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.2)',
    borderRadius: 12,
    padding: Spacing.lg > 48 ? 32 : 24
  },
  packageDark: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.lg > 48 ? 32 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8
  },
  packageGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0,104,122,0.25)'
  },
  packagePrice: { ...Typography.displayHero, fontSize: 40, lineHeight: 46, color: Colors.primary },
  packagePriceDark: { ...Typography.displayHero, fontSize: 40, lineHeight: 46, color: '#ffffff' },
  packageFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.sm
  },
  packageBtn: {
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.base
  },
  packageBtnOutline: { borderWidth: 2, borderColor: Colors.primary },
  packageBtnDarkSolid: { backgroundColor: Colors.secondary },
  packageBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, fontWeight: '700', color: Colors.primary }
});
