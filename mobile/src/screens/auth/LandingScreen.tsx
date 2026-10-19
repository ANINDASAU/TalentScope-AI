import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
  StyleSheet
} from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Glass } from '../../theme/colors';
import { CONTAINER_MAX } from '../../theme/useResponsive';

const HERO_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBnymycV9YWbRrW5SvkuftYaeRke_TiuUq84zQsa-ZXbca4rWGWwe7fjiiOKQti7cT9Guco6ETSBsIjh-ttRGzr4BHr43CRQtgE5C0zO7LQB3qIptAEGrMKNSfFNop_1aQwuiMTAY3b6Svy3jICOPUSPHioCmRI4x5U_ERdXBKwtt444ao1bMJPcv_VW-0b3DVb8nVXaIhJen9ZCRqNVaAWfhmRwr7DTajHLouujNQp2eNOp8G9kTasKkt7zOODt4pu7GUqQ8UA5ik';

const COACH_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCWwQVOTVc9mSmJLWAqaOxQvbXdt6ZIKCvoaQxhdZitLlz4VVjM05VQFkqbkIXWzGiy5KhaGQbAptRi81d8KZIvP7L0R5k1jEoD68IOZ5xMmWQQXg652_CCjWzt8TQekYBqOdzRorQ19LEl6MchRMflMuGrp5eIdfe-LtPZDJTO-tt72XGuDBspayA-XtegCoFdy_HLS_EsCdO29csNBlGW0EEKvMsvhOhRFlHe8v4FA_ufUxo8-I6hzWJyNkeSANgASwpYu9ymTC4',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDQI1V_T74fpWkTUySm6PPa6dcWV6zgdTGAF91MT_uiDrQurwZONZIUnphVMybGl3r7KefWXTA8GkfwaFtqDlZbHeS31d10DwIvmFsIO0VI_nHCVFd7E52TanVTvKYjGAfyaraozyvup1ZvqqgVUv4d-osloRms9KAivo4tpCTRJL_cX3_2YXEjUfomTzkzRnGU0whATXDQkiq4MAnR_OaVzQ1CI2qwSCoY9wkemkAZI6dT3Yfna3iWhacSMjO-NZP1bBguEPnBJkk',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAj4O6vSKQU3zqSkY1CaiA_LgOiUNHlHc5o-z3apKirbhvdYcjDaYDtWzNm8UheC-gdXLZqvOZy1Xm5GKAfFIA2Jiy4ieVj3Q1i-f-yi9rIhiPdOFTl-FoC6ZB_A47UIOg0xy3g2qipK6mJuJEyRjaRqERjI59a7sR8Y5FgySQSmkm7ZWYZLb1gTxry7_P50J8YHgFaWxIQVsFAeSeXYVDJjJ4xWgPOSKZWWPN83tNPDYlFvnRF_IHYNoAlqSaUptxh39OU55BBvpI'
];

const DEV_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBzGP4JiBfbWSJAcyWfVUwQF-mWDJZE4qBqruSSZiihnqOOtDOilhlFZn7H0Fh4AjFHCyON9HyM8iMrOzTp7WCq-qNZpFmxy0zmr5Hc5w21JG2yCjdK-oP0uEPlJPBS2cpLF5TaYZIzQPwODzcSf0Xa0ycbELRxPQIHVdXy5CZdSpxvn2Y0ZA_LhkwoG4-1qLtwcuzP8nbqsXGhGaS4ulS4gtOZfwrbIiEDREwI1Yb10fzylIFqSSDJUlTFm79-fi5gTQnCMhKWBO4',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD70YD-O80r3q2HHpFrgeuixtnJAcwGBQkpOsDzGbdLzdYov1CcMOJq10nx96gUAr3vlZgwlXhE9yvzFuAvL5y-50hlEMaEty6d-2OFmZLuTZ3liLVb-GSgsLuikO5bZouSoM22EavjveeIaSsIpK-FrvsuTcV2E2lPt0TzzhE_daA26F1eLAB-pZLKGoFuWlJl3Ab91kFAc2X4IPBPDznsAJk4x93ftczhFv4LUhtKXbrkak2pvf5PtCtW1P_NpB7yzSa48eCE3us',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCLMbC5KAUGTat-B13x8VVimJPe_1zHGxWDPNvLO6jc9qN8J4zfFfCWbkVFY226VxDGw-YXIQNHmPJtc2JmGNI5HAIdBwxhxpEnWcuT-9abp_iiyiz3qgENbkboYMKmprj0SzQdLEu14mYiEq2zjhOcBQn4dDQ0iVuLJ6lth7nRAEGir8E5AmoMvM-c_Qqz_dE5lTw7vzG-mOe7ITxHby5k97REA7XnPqxSRJuSEk7hnvIaLEXSYUh6lrOX3Ot0BpsaS1O99YGYeDY',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBFOyiCN8Ks8SHMIfMamjisMIGXK5nrUWrMRNQtcl0Yo7VV1XGn6vDgNxc8noYS61-mAUAusU2sCLhhA3NgyXpBumKqp2D-QBkhXh0rSSEAS3_N38z2XIsz2T8xC134ovlf4Dt_zhMbqRMlWXev7kyt4M9Ar_Doj3KzF3KWJAVK8ofgJaGKGcDxJgVrfcK2fcn0zm6nIXk_sA1E5DLcnz0-ikE_FnN5xcdS39V0f_wmTp2jRBxA6snwR8KWLrnWeWSeYmX4FEKMWNo'
];

const FEATURES = [
  { icon: 'smartphone', title: 'Smartphone-based', text: 'No wearables required. Just your camera.' },
  { icon: 'bolt', title: 'Real-time Detection', text: 'Instant feedback during your performance.' },
  { icon: 'history', title: 'Trend Analysis', text: 'Track improvements over weeks or years.' },
  { icon: 'group', title: 'Multi-Athlete Support', text: 'Ideal for teams and athletic clubs.' },
  { icon: 'cloud-done', title: 'Cloud Reports', text: 'High-fidelity PDFs for your physicians.' },
  { icon: 'psychology', title: 'Personalized Insights', text: 'AI-generated training suggestions.' },
  { icon: 'videocam', title: 'Slow-mo Replay', text: 'Break down every frame of your motion.' },
  { icon: 'security', title: 'Privacy First', text: 'Your biometrics are encrypted and secure.' }
] as const;

const STEPS = [
  { num: '01', title: 'Setup', text: 'Position your phone 3 meters (~10 feet) away from your workout area.' },
  { num: '02', title: 'Record', text: 'Perform your routine as usual while AI tracks 25+ joint points.' },
  { num: '03', title: 'Process', text: 'Our neural networks analyze biomechanics in under 60 seconds.' },
  { num: '04', title: 'Review', text: 'Get a comprehensive score based on speed, form, and risk.' },
  { num: '05', title: 'Connect', text: 'Optional: Share your data with a certified TalentScope coach.' },
  { num: '06', title: 'Improve', text: 'Execute AI-prescribed corrective drills to reach your peak.' }
];

const STATS = [
  { value: '500k+', label: 'Assessments Run' },
  { value: '12k+', label: 'Pro Athletes' },
  { value: '85+', label: 'Sport Types' },
  { value: '40%', label: 'Avg Injury Reduction' }
];

const COACHES = [
  { img: COACH_IMAGES[0], name: 'Marcus Thorne', role: 'Olympic Sprint Coach' },
  { img: COACH_IMAGES[1], name: 'Elena Rodriguez', role: 'Biomechanical Specialist' },
  { img: COACH_IMAGES[2], name: 'Sarah Chen', role: 'Physiotherapy Expert' }
];

const DEVS = [
  { img: DEV_IMAGES[0], name: 'Dr. Aris Thorne', role: 'Lead AI Engineer', field: 'Computer Vision Expert' },
  { img: DEV_IMAGES[1], name: 'Maya Lin', role: 'Biomechanics Specialist', field: 'Kinesiology & Data Science' },
  { img: DEV_IMAGES[2], name: 'Julian Vane', role: 'Systems Architect', field: 'Scalable Cloud Infrastructure' },
  { img: DEV_IMAGES[3], name: 'Sarah Chen', role: 'UX Director', field: 'Human-Machine Interaction' }
];

const FAQS = [
  {
    q: 'Do I need special equipment or wearables?',
    a: 'No. TalentScope AI works entirely through your smartphone camera. Our advanced computer vision models handle everything from motion tracking to biomechanical analysis.'
  },
  {
    q: 'How accurate is the AI detection?',
    a: 'In laboratory testing, our AI models achieve 98% correlation with professional-grade motion capture systems (Vicon/OptiTrack) for joint angle and velocity measurements.'
  },
  {
    q: 'Is my biometric data secure?',
    a: 'Absolutely. We use end-to-end encryption. Your video data is processed in real-time and is never stored on our servers unless you explicitly choose to save it for your coach.'
  }
];

const NAV_LINKS = [
  { label: 'About', key: 'about' },
  { label: 'Features', key: 'features' },
  { label: 'Plans', key: 'plans' },
  { label: 'Developers', key: 'developers' }
] as const;

export default function LandingScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const padH = isMd ? Spacing.marginDesktop : Spacing.marginMobile;
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const secY = useRef<Record<string, number>>({});

  const track = (key: string) => (e: any) => {
    secY.current[key] = e.nativeEvent.layout.y;
  };
  const goTo = (key: string) => {
    scrollRef.current?.scrollTo({ y: Math.max((secY.current[key] ?? 0) - 64, 0), animated: true });
  };

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

  const container = { alignSelf: 'center' as const, width: '100%' as const, maxWidth: CONTAINER_MAX };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <Text style={styles.brand}>TalentScope AI</Text>
        {isMd && (
          <View style={styles.headerNav}>
            {NAV_LINKS.map(l => (
              <TouchableOpacity key={l.key} onPress={() => goTo(l.key)}>
                <Text style={styles.headerNavLink}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={styles.loginBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.loginBtnText}>Sign Up / Login</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: isLg ? 0 : 96 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={[styles.hero, { paddingHorizontal: padH }, isLg && styles.heroLg]} onLayout={track('hero')}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={styles.glowTr} />
            <View style={styles.glowTrInner} />
            <View style={styles.glowBl} />
            <View style={styles.glowBlInner} />
          </View>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <View style={isLg ? { flexDirection: 'row', alignItems: 'center', gap: Spacing.xl } : undefined}>
              <View style={isLg ? { flex: 1 } : undefined}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>AI-DRIVEN PERFORMANCE</Text>
                </View>
                <Text style={[styles.heroTitle, { marginTop: Spacing.md }]}>
                  AI-Powered Sports Assessment for Every Athlete
                </Text>
                <Text style={[styles.heroBody, isLg && { maxWidth: 512 }]}>
                  Analyze performance, detect injury risks, improve technique, and connect with
                  certified coaches using just your smartphone.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.lg }}>
                  <TouchableOpacity
                    style={styles.primaryCta}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('Signup')}
                  >
                    <Text style={styles.primaryCtaText}>Start Assessment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.outlineCta} activeOpacity={0.8}>
                    <Icon name="play-circle" size={24} color={Colors.primary} />
                    <Text style={styles.outlineCtaText}>Watch Demo</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={isLg ? { flex: 1 } : { marginTop: Spacing.xl }}>
                <View style={[styles.visionCard, { height: isLg ? 600 : 500 }]}>
                  <Image source={{ uri: HERO_IMG }} style={styles.visionImage} />
                  <SkeletonMock />
                  <View style={styles.visionTopRow}>
                    <View style={styles.glassChip}>
                      <Text style={styles.chipLabelSecondary}>JOINT ANGLES</Text>
                      <Text style={styles.monoData}>KNEE: 142°</Text>
                      <Text style={styles.monoData}>HIP: 168°</Text>
                    </View>
                    <View style={[styles.glassChip, { alignItems: 'flex-end' }]}>
                      <Text style={styles.chipLabelError}>STRESS ALERT</Text>
                      <Text style={styles.monoData}>LEFT ANKLE: HIGH</Text>
                    </View>
                  </View>
                  <View style={styles.liveAnalysisCard}>
                    <SpinSpinner />
                    <View>
                      <Text style={styles.liveLabel}>LIVE ANALYSIS</Text>
                      <Text style={styles.liveValue}>98.4% Precision Tracking</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Bento Pillars */}
        <View style={[styles.sectionLow, { paddingHorizontal: padH }]} onLayout={track('about')}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            {grid(
              [
                <View key="p1" style={styles.pillarCard}>
                  <Icon name="biotech" size={40} color={Colors.secondary} />
                  <Text style={styles.pillarTitle}>AI Biomechanics</Text>
                  <Text style={styles.pillarBody}>
                    Proprietary vision models analyze movement with sub-millimeter accuracy for elite optimization.
                  </Text>
                </View>,
                <View key="p2" style={[styles.pillarCard, { backgroundColor: Colors.secondary }]}>
                  <Icon name="health-and-safety" size={40} color="#ffffff" />
                  <Text style={[styles.pillarTitle, { color: '#ffffff' }]}>Injury Risk Detection</Text>
                  <Text style={[styles.pillarBody, { color: 'rgba(255,255,255,0.9)' }]}>
                    Identify asymmetrical loads and joint fatigue before they become career-ending injuries.
                  </Text>
                </View>,
                <View key="p3" style={styles.pillarCard}>
                  <Icon name="hub" size={40} color={Colors.secondary} />
                  <Text style={styles.pillarTitle}>Certified Network</Text>
                  <Text style={styles.pillarBody}>
                    Instant connection to world-class sports scientists and Olympic-level coaches.
                  </Text>
                </View>
              ],
              isMd ? 3 : 1,
              Spacing.gutter
            )}
          </View>
        </View>

        {/* Features */}
        <View style={[styles.section, { paddingHorizontal: padH }]} onLayout={track('features')}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <Text style={[Typography.headlineLg, styles.sectionTitleCenter]}>
              Precision Performance Features
            </Text>
            <Text style={[Typography.bodyLg, styles.sectionSubCenter]}>
              The future of athletic training is in your pocket.
            </Text>
            {grid(
              FEATURES.map(f => (
                <View key={f.title} style={styles.featureCard}>
                  <Icon name={f.icon} size={24} color={Colors.secondary} />
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureBody}>{f.text}</Text>
                </View>
              )),
              width >= 1024 ? 4 : 2,
              Spacing.md
            )}
          </View>
        </View>

        {/* How It Works */}
        <View style={[styles.howSection, { paddingHorizontal: padH }]}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <Text style={[Typography.headlineLg, { color: '#ffffff', textAlign: 'center', marginBottom: Spacing.xl }]}>
              Engineered for Simplicity
            </Text>
            {grid(
              STEPS.map(s => (
                <View key={s.num} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{s.num}</Text>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepBody}>{s.text}</Text>
                </View>
              )),
              isLg ? 3 : isMd ? 2 : 1,
              Spacing.xl
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={[styles.statsSection, { paddingHorizontal: padH }]}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            {grid(
              STATS.map(s => (
                <View key={s.label} style={{ alignItems: 'center' }}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              )),
              isLg ? 4 : 2,
              Spacing.md
            )}
          </View>
        </View>

        {/* Marketplace Preview */}
        <View style={[styles.marketSection, { paddingHorizontal: padH }]}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <View
              style={
                isMd
                  ? { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: Spacing.xl, gap: Spacing.md }
                  : { flexDirection: 'column', alignItems: 'flex-end', marginBottom: Spacing.xl, gap: Spacing.md }
              }
            >
              <View style={isMd ? undefined : { alignSelf: 'stretch' }}>
                <Text style={[Typography.headlineLg, { color: Colors.onSurface }]}>Elite Coach Marketplace</Text>
                <Text style={[Typography.bodyLg, { color: Colors.onSurfaceVariant }]}>
                  Work with professionals who use AI to tailor your training.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('MainTabs', { screen: 'Explore' })}
                style={styles.viewCoachesBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.viewCoachesText}>View All Coaches</Text>
              </TouchableOpacity>
            </View>
            {grid(
              COACHES.map(c => (
                <View key={c.name} style={styles.coachCard}>
                  <View>
                    <Image source={{ uri: c.img }} style={styles.coachImg} />
                    <View style={styles.verifiedPill}>
                      <Text style={styles.verifiedText}>VERIFIED</Text>
                    </View>
                  </View>
                  <View style={{ padding: Spacing.md }}>
                    <Text style={styles.coachName}>{c.name}</Text>
                    <Text style={styles.coachRole}>{c.role}</Text>
                    <View style={styles.divider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.coachPrice}>$75/Assessment</Text>
                      <TouchableOpacity onPress={() => navigation.navigate('CoachProfile')}>
                        <Text style={styles.bookLink}>Book Consultation</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )),
              isMd ? 3 : 1,
              Spacing.gutter
            )}
          </View>
        </View>

        {/* Pricing */}
        <View style={[styles.section, { paddingHorizontal: padH }]} onLayout={track('plans')}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <Text style={[Typography.headlineLg, styles.sectionTitleCenter, { marginBottom: Spacing.xl }]}>
              Choose Your Tier
            </Text>
            {grid(
              [
                <View key="free" style={styles.tierCard}>
                  <Text style={styles.tierLabel}>BASIC</Text>
                  <Text style={styles.tierPrice}>Free</Text>
                  <View style={styles.tierFeatures}>
                    <TierFeature text="3 Assessments/mo" included />
                    <TierFeature text="Basic Form Scoring" included />
                    <TierFeature text="Injury Risk Reports" included={false} />
                  </View>
                  <TouchableOpacity style={styles.tierOutlineBtn} onPress={() => navigation.navigate('Signup')}>
                    <Text style={styles.tierOutlineText}>Get Started</Text>
                  </TouchableOpacity>
                </View>,
                <View key="pro" style={[styles.tierProCard, isMd && { transform: [{ scale: 1.05 }] }]}>
                  <View style={styles.popularPill}>
                    <Text style={styles.popularText}>MOST POPULAR</Text>
                  </View>
                  <Text style={styles.tierLabelDark}>ELITE</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.md }}>
                    <Text style={styles.tierPriceDark}>$29</Text>
                    <Text style={styles.tierPerMo}>/mo</Text>
                  </View>
                  <View style={styles.tierFeatures}>
                    <TierFeature dark text="Unlimited Assessments" included />
                    <TierFeature dark text="Advanced Injury Analytics" included />
                    <TierFeature dark text="Full Marketplace Access" included />
                  </View>
                  <TouchableOpacity style={styles.proUnlockBtn} onPress={() => navigation.navigate('Signup')}>
                    <Text style={styles.proUnlockText}>Unlock Elite</Text>
                  </TouchableOpacity>
                </View>,
                <View key="team" style={styles.tierCard}>
                  <Text style={styles.tierLabel}>TEAM</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.md }}>
                    <Text style={styles.tierPrice}>$199</Text>
                    <Text style={styles.tierPerMoLight}>/mo</Text>
                  </View>
                  <View style={styles.tierFeatures}>
                    <TierFeature text="Up to 20 Athletes" included />
                    <TierFeature text="Dedicated Dashboards" included />
                    <TierFeature text="API Data Export" included />
                  </View>
                  <TouchableOpacity style={styles.tierOutlineBtn}>
                    <Text style={styles.tierOutlineText}>Contact Sales</Text>
                  </TouchableOpacity>
                </View>
              ],
              isMd ? 3 : 1,
              Spacing.gutter
            )}
          </View>
        </View>

        {/* Developers */}
        <View style={[styles.sectionLow, { paddingHorizontal: padH }]} onLayout={track('developers')}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <Text style={[Typography.headlineLg, styles.sectionTitleCenter]}>
              Developers Behind It
            </Text>
            <Text style={[Typography.bodyLg, styles.sectionSubCenter]}>
              The minds engineering the future of athletic intelligence.
            </Text>
            {grid(
              DEVS.map(d => (
                <View key={d.name} style={styles.devCard}>
                  <View style={styles.devImgWrap}>
                    <Image source={{ uri: d.img }} style={styles.devImg} />
                  </View>
                  <Text style={styles.devName}>{d.name}</Text>
                  <Text style={styles.devRole}>{d.role}</Text>
                  <Text style={styles.devField}>{d.field}</Text>
                </View>
              )),
              isMd ? (isLg ? 4 : 2) : 1,
              Spacing.md
            )}
          </View>
        </View>

        {/* FAQ */}
        <View style={[styles.section, { paddingHorizontal: padH }]}>
          <View style={[container, { paddingVertical: Spacing.xl, maxWidth: 768 }]}>
            <Text style={[Typography.headlineLg, styles.sectionTitleCenter, { marginBottom: Spacing.xl }]}>
              Common Questions
            </Text>
            {FAQS.map((f, i) => (
              <View key={f.q} style={styles.faqItem}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <Text style={styles.faqQuestion}>{f.q}</Text>
                  <Icon
                    name="expand-more"
                    size={24}
                    color={Colors.onSurface}
                    style={{ transform: [{ rotate: openFaq === i ? '180deg' : '0deg' }] }}
                  />
                </TouchableOpacity>
                {openFaq === i && <Text style={styles.faqAnswer}>{f.a}</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* Final CTA */}
        <View style={[styles.ctaSection, { paddingHorizontal: padH }]}>
          <View style={[container, { paddingVertical: Spacing.xl }]}>
            <View style={styles.ctaPanel}>
              <Text style={[Typography.displayHero, { color: Colors.onSurface, textAlign: 'center', marginBottom: Spacing.md }]}>
                Start Your AI Sports Journey Today
              </Text>
              <Text style={[Typography.bodyLg, { color: Colors.onSurfaceVariant, textAlign: 'center', maxWidth: 672, alignSelf: 'center' }]}>
                Join thousands of athletes who are already using TalentScope to gain a competitive edge and train smarter.
              </Text>
              <View
                style={
                  isMd
                    ? { flexDirection: 'row', gap: Spacing.md, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.lg }
                    : { flexDirection: 'column', gap: Spacing.md, marginTop: Spacing.lg }
                }
              >
                <TouchableOpacity
                  style={[styles.ctaPrimaryBtn, !isMd && { width: '100%' }]}
                  onPress={() => navigation.navigate('Signup')}
                >
                  <Text style={styles.ctaBtnText}>Get Started Free</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.enterpriseBtn, !isMd && { width: '100%' }]}>
                  <Text style={styles.enterpriseText}>Request Enterprise Demo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingHorizontal: padH }, isMd && { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View style={[styles.footerBrandCol, isMd && { alignItems: 'flex-start' }]}>
            <Text style={styles.footerBrand}>TalentScope AI</Text>
            <Text style={styles.footerCopy}>© 2024 TalentScope AI. Professional Grade Performance Analysis.</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md }}>
            {['Privacy Policy', 'Terms of Service', 'AI Ethics', 'Contact Support'].map(l => (
              <Text key={l} style={styles.footerLink}>{l}</Text>
            ))}
          </View>
        </View>
      </ScrollView>

      {!isLg && (
        <View style={styles.bottomNav}>
          <BottomNavItem icon="home" label="Home" active onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
          <BottomNavItem icon="bolt" label="Features" onPress={() => goTo('features')} />
          <BottomNavItem icon="payments" label="Plans" onPress={() => goTo('plans')} />
          <BottomNavItem icon="code" label="Developers" onPress={() => goTo('developers')} />
          <BottomNavItem icon="person" label="Log In" onPress={() => navigation.navigate('Login')} />
        </View>
      )}
    </View>
  );
}

function SpinSpinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);
  return (
    <Animated.View
      style={[styles.spinner, { transform: [{ rotate: rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
    />
  );
}

function TierFeature({ text, included, dark }: { text: string; included: boolean; dark?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }, !included && { opacity: 0.5 }]}>
      <Icon
        name={included ? 'check' : 'close'}
        size={18}
        color={!included ? Colors.outline : dark ? Colors.secondaryContainer : Colors.secondary}
      />
      <Text style={[Typography.bodyMd, dark ? { color: '#ffffff' } : {}]}>{text}</Text>
    </View>
  );
}

function SkeletonMock() {
  return (
    <View style={styles.skeletonArea} pointerEvents="none">
      <View style={[styles.skDot, { top: '25%', left: '50%' }]} />
      <View style={[styles.skDot, { top: '33%', left: '33%' }]} />
      <View style={[styles.skDot, { top: '33%', left: '66%' }]} />
      <View style={[styles.skLine, { width: 96, top: '27%', left: '48%', transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.skLine, { width: 96, top: '27%', left: '48%', transform: [{ rotate: '135deg' }] }]} />
    </View>
  );
}

function BottomNavItem({
  icon,
  label,
  active,
  onPress
}: {
  icon: keyof typeof Icon.glyphMap;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.bottomNavItem} onPress={onPress} disabled={!onPress}>
      <Icon name={icon} size={24} color={active ? Colors.secondary : Colors.onSurfaceVariant} />
      <Text style={[styles.bottomNavLabel, active && { color: Colors.secondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,249,251,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.15)',
    zIndex: 50
  },
  headerNav: { flexDirection: 'row', gap: Spacing.md },
  headerNavLink: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  brand: {
    ...Typography.headlineMd,
    letterSpacing: -1.2,
    color: Colors.primary
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8
  },
  loginBtnText: { ...Typography.labelCaps, color: Colors.onPrimary },
  hero: {
    backgroundColor: Colors.surface,
    overflow: 'hidden'
  },
  heroLg: { minHeight: 921, justifyContent: 'center' },
  glowTr: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(87,223,254,0.08)'
  },
  glowTrInner: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(87,223,254,0.12)'
  },
  glowBl: {
    position: 'absolute',
    bottom: -140,
    left: -140,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: 'rgba(0,104,122,0.04)'
  },
  glowBlInner: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(0,104,122,0.05)'
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999
  },
  badgeText: { ...Typography.labelCaps, color: Colors.onSecondaryContainer },
  heroTitle: {
    ...Typography.displayHero,
    color: Colors.onSurface,
    maxWidth: 576
  },
  heroBody: {
    ...Typography.bodyLg,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing.md
  },
  primaryCta: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryCtaText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: Colors.onPrimary, textAlign: 'center' },
  outlineCta: {
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm
  },
  outlineCtaText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: Colors.primary },
  visionCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#dfe3ea',
    borderWidth: 1,
    borderColor: Glass.borderColor,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12
  },
  visionImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3
  },
  visionTopRow: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  glassChip: {
    backgroundColor: Glass.backgroundColor,
    borderRadius: 12,
    padding: Spacing.sm
  },
  chipLabelSecondary: {
    ...Typography.labelCaps,
    color: Colors.secondary
  },
  chipLabelError: {
    ...Typography.labelCaps,
    color: Colors.error
  },
  monoData: { ...Typography.monoData, color: Colors.onSurface },
  skeletonArea: { ...StyleSheet.absoluteFillObject, top: 150, bottom: 160 },
  skDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(87,223,254,0.8)',
    shadowOpacity: 1,
    shadowRadius: 8
  },
  skLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: 'rgba(87,223,254,0.5)'
  },
  liveAnalysisCard: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Glass.backgroundColor,
    borderRadius: 16,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: Colors.secondary,
    borderTopColor: 'transparent'
  },
  liveLabel: { ...Typography.labelCaps },
  liveValue: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 24, fontWeight: '600', color: Colors.onSurface },
  sectionLow: {
    backgroundColor: Colors.surfaceContainerLow
  },
  section: {
    backgroundColor: Colors.surface
  },
  sectionTitleCenter: { textAlign: 'center', marginBottom: Spacing.base, color: Colors.onSurface },
  sectionSubCenter: { textAlign: 'center', color: Colors.onSurfaceVariant, marginBottom: Spacing.lg },
  pillarCard: {
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm
  },
  pillarTitle: { ...Typography.headlineMd, color: Colors.onSurface },
  pillarBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  featureCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 16,
    padding: Spacing.md
  },
  featureTitle: {
    fontFamily: 'Geist_700Bold',
    fontSize: 18,
    lineHeight: 29,
    fontWeight: '700',
    color: Colors.onSurface,
    marginBottom: Spacing.xs
  },
  featureBody: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  howSection: {
    backgroundColor: Colors.primary
  },
  stepRow: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(124,131,155,0.3)',
    paddingLeft: Spacing.md,
    paddingBottom: Spacing.base
  },
  stepNum: {
    ...Typography.displayHero,
    color: 'rgba(255,255,255,0.1)',
    position: 'absolute',
    left: -16,
    top: -24
  },
  stepTitle: { ...Typography.headlineMd, color: '#ffffff', marginBottom: Spacing.xs },
  stepBody: { ...Typography.bodyMd, color: Colors.onPrimaryContainer, zIndex: 1 },
  statsSection: {
    backgroundColor: Colors.surface
  },
  statValue: { ...Typography.displayHero, color: Colors.secondary, textAlign: 'center' },
  statLabel: { ...Typography.labelCaps, textAlign: 'center', marginTop: Spacing.xs, color: Colors.onSurface },
  marketSection: {
    backgroundColor: Colors.surfaceContainerHighest
  },
  viewCoachesBtn: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8
  },
  viewCoachesText: { ...Typography.labelCaps, color: Colors.onSecondary },
  coachCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3
  },
  coachImg: { width: '100%', height: 256 },
  verifiedPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: Glass.backgroundColor,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999
  },
  verifiedText: { fontFamily: 'Geist_400Regular', fontSize: 10, lineHeight: 15, letterSpacing: 0, color: Colors.secondary },
  coachName: { fontFamily: 'Geist_700Bold', fontSize: 18, lineHeight: 29, fontWeight: '700', color: Colors.onSurface },
  coachRole: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  divider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.2)',
    marginVertical: Spacing.sm
  },
  coachPrice: { fontFamily: 'Inter_700Bold', fontSize: 16, lineHeight: 24, fontWeight: '700', color: Colors.secondary },
  bookLink: {
    ...Typography.labelCaps,
    color: Colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingBottom: 2
  },
  tierCard: {
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.4)',
    borderRadius: 24,
    padding: Spacing.lg
  },
  tierLabel: { ...Typography.labelCaps, color: Colors.onSurfaceVariant, marginBottom: Spacing.xs },
  tierLabelDark: { ...Typography.labelCaps, color: 'rgba(255,255,255,0.7)', marginBottom: Spacing.xs },
  tierPrice: { ...Typography.headlineLg, color: Colors.onSurface, marginBottom: Spacing.md },
  tierPriceDark: { ...Typography.headlineLg, color: '#ffffff' },
  tierPerMo: { ...Typography.bodyMd, color: 'rgba(255,255,255,0.7)', marginLeft: 4 },
  tierPerMoLight: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginLeft: 4 },
  tierProCard: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    padding: Spacing.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10
  },
  popularPill: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 999
  },
  popularText: { fontFamily: 'Geist_400Regular', fontSize: 10, lineHeight: 15, letterSpacing: 0, color: Colors.onSecondaryContainer },
  tierFeatures: { gap: Spacing.sm, marginBottom: Spacing.xl, flexGrow: 1 },
  tierOutlineBtn: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    alignItems: 'center'
  },
  tierOutlineText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
  proUnlockBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    alignItems: 'center'
  },
  proUnlockText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: Colors.onSecondary },
  devCard: {
    width: '100%',
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 24,
    padding: Spacing.md,
    alignItems: 'center'
  },
  devImgWrap: {
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 4,
    borderColor: 'rgba(87,223,254,0.3)'
  },
  devImg: { width: '100%', height: '100%' },
  devName: { fontFamily: 'Geist_700Bold', fontSize: 18, lineHeight: 29, fontWeight: '700', color: Colors.onSurface, textAlign: 'center' },
  devRole: { fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 24, fontWeight: '500', color: Colors.secondary, textAlign: 'center' },
  devField: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center', marginTop: Spacing.xs },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(198,198,205,0.35)',
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md
  },
  faqQuestion: { fontFamily: 'Geist_400Regular', fontSize: 18, lineHeight: 29, fontWeight: '400', color: Colors.onSurface, flex: 1, paddingRight: 8 },
  faqAnswer: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginTop: Spacing.sm },
  ctaSection: {
    backgroundColor: Colors.surfaceContainerLowest
  },
  ctaPanel: {
    backgroundColor: Glass.backgroundColor,
    borderWidth: 1,
    borderColor: Glass.borderColor,
    borderRadius: 48,
    padding: Spacing.xl
  },
  ctaPrimaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ctaBtnText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: Colors.onPrimary },
  enterpriseBtn: {
    borderWidth: 1,
    borderColor: Colors.outline,
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center'
  },
  enterpriseText: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: Colors.onSurface },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.2)',
    backgroundColor: Colors.surfaceContainerLowest,
    gap: Spacing.md
  },
  footerBrandCol: { alignItems: 'center', gap: Spacing.xs },
  footerBrand: { ...Typography.headlineMd, color: Colors.primary },
  footerCopy: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, textAlign: 'center' },
  footerLink: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.35)',
    paddingVertical: Spacing.base,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12
  },
  bottomNavItem: { alignItems: 'center', justifyContent: 'center' },
  bottomNavLabel: { ...Typography.labelCaps, marginTop: 2, color: Colors.onSurfaceVariant }
});
