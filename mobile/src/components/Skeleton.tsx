import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors, Spacing } from '../theme/colors';

export function SkeletonBlock({
  width,
  height,
  radius = 10,
  style
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width ?? '100%', height: height ?? 16, borderRadius: radius, backgroundColor: Colors.surfaceContainerHigh },
        { opacity },
        style
      ]}
    />
  );
}

export function SkeletonCard({
  height = 120,
  style,
  children
}: {
  height?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { height }, style]}>
      {children ?? <SkeletonBlock width="60%" height={18} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(198,198,205,0.35)',
    borderRadius: 16,
    padding: Spacing.md,
    justifyContent: 'center',
    gap: 10
  }
});
