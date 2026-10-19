import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../theme/colors';

interface BiometricProgressBarProps {
  label: string;
  value: string;
  unit?: string;
  unitColor?: string;
  percent: number;
  barColor?: string;
  trackColor?: string;
  barHeight?: number;
  showShadow?: boolean;
}

export default function BiometricProgressBar({
  label,
  value,
  unit,
  unitColor = Colors.onSurfaceVariant,
  percent,
  barColor = Colors.secondary,
  trackColor = Colors.surfaceContainer,
  barHeight = 4,
  showShadow = false
}: BiometricProgressBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={[styles.unit, { color: unitColor }]}>{unit}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: trackColor, height: Math.max(barHeight, 4) }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: barColor,
              width: `${Math.min(Math.max(percent, 0), 100)}%`,
              height: '100%',
              shadowColor: showShadow ? barColor : 'transparent',
              shadowOpacity: showShadow ? 0.4 : 0,
              shadowRadius: showShadow ? 8 : 0
            }
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginBottom: 4
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4
  },
  value: {
    fontFamily: 'Geist_500Medium',
    fontSize: 24,
    fontWeight: '600',
    color: Colors.onSurface
  },
  unit: {
    fontSize: 12
  },
  track: {
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8
  },
  fill: {
    borderRadius: 999
  }
});
