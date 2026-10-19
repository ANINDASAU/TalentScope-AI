import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface JointPoint {
  x: number | `${number}%`;
  y: number | `${number}%`;
}

interface Bone {
  x: number | `${number}%`;
  y: number | `${number}%`;
  width: number;
  rotate: number;
}

const HERO_DOTS: JointPoint[] = [
  { x: '50%', y: '25%' },
  { x: '33%', y: '33%' },
  { x: '66%', y: '33%' }
];

const HERO_LINES: Bone[] = [
  { x: '50%', y: '25%', width: 96, rotate: 45 },
  { x: '50%', y: '25%', width: 96, rotate: 135 }
];

const CAMERA_DOTS: JointPoint[] = [
  { x: '50%', y: '25%' },
  { x: '42%', y: '30%' },
  { x: '58%', y: '30%' },
  { x: '38%', y: '42%' },
  { x: '62%', y: '42%' },
  { x: '50%', y: '45%' }
];

const CAMERA_LINES: Bone[] = [
  { x: '50%', y: '25%', width: 100, rotate: 90 },
  { x: '42%', y: '30%', width: 64, rotate: 0 },
  { x: '42%', y: '30%', width: 60, rotate: 120 },
  { x: '58%', y: '30%', width: 60, rotate: 60 }
];

interface SkeletonOverlayProps {
  variant?: 'hero' | 'camera' | 'full';
  dotColor?: string;
  lineColor?: string;
  glowColor?: string;
  animate?: boolean;
}

export default function SkeletonOverlay({
  variant = 'hero',
  dotColor = '#ffffff',
  lineColor = 'rgba(87, 223, 254, 0.5)',
  glowColor = 'rgba(87, 223, 254, 0.8)',
  animate = true
}: SkeletonOverlayProps) {
  const dots = variant === 'camera' ? CAMERA_DOTS : HERO_DOTS;
  const lines = variant === 'camera' ? CAMERA_LINES : HERO_LINES;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(drift, { toValue: 0, duration: 900, useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, animate]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 1.5] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [1.2, -1.2] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((bone, i) => (
        <View
          key={`line-${i}`}
          style={[
            styles.line,
            {
              backgroundColor: lineColor,
              width: bone.width,
              left: bone.x as any,
              top: bone.y as any,
              transform: [{ translateX }, { translateY }, { rotate: `${bone.rotate}deg` }]
            }
          ]}
        />
      ))}
      {dots.map((dot, i) => (
        <Animated.View
          key={`dot-${i}`}
          style={[
            styles.dot,
            {
              backgroundColor: dotColor,
              shadowColor: glowColor,
              left: dot.x as any,
              top: dot.y as any,
              transform: [{ translateX }, { translateY }]
            }
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8
  },
  line: {
    position: 'absolute',
    height: 2
  }
});
