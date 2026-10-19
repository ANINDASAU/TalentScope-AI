import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../theme/colors';

interface CircularScoreGaugeProps {
  size?: number;
  strokeWidth?: number;
  score: number;
  max?: number;
  trackColor?: string;
  progressColor?: string;
  rotate?: boolean;
  children?: React.ReactNode;
}

export default function CircularScoreGauge({
  size = 192,
  strokeWidth = 8,
  score,
  max = 100,
  trackColor = Colors.surfaceContainer,
  progressColor = Colors.secondary,
  rotate = false,
  children
}: CircularScoreGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / max, 0), 1);
  const dashOffset = circumference - progress * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={rotate ? `rotate(-90 ${center} ${center})` : undefined}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
