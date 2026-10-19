export const Colors = {
  primary: '#000000',
  onPrimary: '#ffffff',
  primaryFixed: '#dae2fd',
  onPrimaryFixed: '#131b2e',
  primaryFixedDim: '#bec6e0',
  primaryContainer: '#131b2e',
  onPrimaryContainer: '#7c839b',

  secondary: '#00687a',
  onSecondary: '#ffffff',
  secondaryContainer: '#57dffe',
  onSecondaryContainer: '#006172',
  secondaryFixed: '#acedff',
  secondaryFixedDim: '#4cd7f6',
  onSecondaryFixed: '#001f26',
  onSecondaryFixedVariant: '#004e5c',

  tertiary: '#000000',
  onTertiary: '#ffffff',
  tertiaryFixed: '#6bff8f',
  tertiaryFixedDim: '#4ae176',
  tertiaryContainer: '#002109',
  onTertiaryContainer: '#009844',
  onTertiaryFixed: '#002109',
  onTertiaryFixedVariant: '#005321',

  background: '#f7f9fb',
  surface: '#f7f9fb',
  surfaceBright: '#f7f9fb',
  surfaceDim: '#d8dadc',
  surfaceVariant: '#e0e3e5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f6',
  surfaceContainer: '#eceef0',
  surfaceContainerHigh: '#e6e8ea',
  surfaceContainerHighest: '#e0e3e5',

  onSurface: '#191c1e',
  onSurfaceVariant: '#45464d',
  onBackground: '#191c1e',
  inverseSurface: '#2d3133',
  inverseOnSurface: '#eff1f3',
  inversePrimary: '#bec6e0',
  surfaceTint: '#565e74',

  outline: '#76777d',
  outlineVariant: '#c6c6cd',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a'
} as const;

// Spacing scale — tailwind.config spacing extension
export const Spacing = {
  xs: 4,
  base: 8,
  sm: 12,
  md: 24,
  gutter: 24,
  lg: 48,
  marginMobile: 16,
  marginDesktop: 40,
  xl: 80
} as const;

// Typography scale — tailwind.config fontSize/fontFamily extension.
// display/headline/label/mono = Geist, body = Inter (exact per spec).
export const Typography = {
  displayHero: { fontFamily: 'Geist_700Bold', fontSize: 48, lineHeight: 53, letterSpacing: -1.92, fontWeight: '700' },
  headlineLg: { fontFamily: 'Geist_600SemiBold', fontSize: 32, lineHeight: 38, letterSpacing: -0.64, fontWeight: '600' },
  headlineLgMobile: { fontFamily: 'Geist_600SemiBold', fontSize: 24, lineHeight: 29, fontWeight: '600' },
  headlineMd: { fontFamily: 'Geist_600SemiBold', fontSize: 24, lineHeight: 31, fontWeight: '600' },
  bodyLg: { fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 29, fontWeight: '400' },
  bodyMd: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, fontWeight: '400' },
  monoData: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 14, letterSpacing: -0.14, fontWeight: '500' },
  labelCaps: { fontFamily: 'Geist_700Bold', fontSize: 12, lineHeight: 12, letterSpacing: 0.96, fontWeight: '700' }
} as const;

// Glass panel — .glass-panel { background: rgba(255,255,255,0.8); border: rgba(15,23,42,0.05) }
export const Glass = {
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  borderColor: 'rgba(15, 23, 42, 0.05)',
  borderWidth: 1
} as const;
