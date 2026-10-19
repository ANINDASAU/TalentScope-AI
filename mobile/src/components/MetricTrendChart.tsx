import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Colors, Typography } from '../theme/colors';

interface MetricTrendChartProps {
  data?: number[];
  labels?: string[];
  height?: number;
  strokeColor?: string;
  pointStrokeColor?: string;
}

export default function MetricTrendChart({
  data = [72, 68, 76, 70, 82, 88],
  labels = ['APR 01', 'APR 15', 'MAY 01', 'MAY 15', 'TODAY'],
  height = 256,
  strokeColor = Colors.secondary,
  pointStrokeColor = Colors.secondary
}: MetricTrendChartProps) {
  const width = Dimensions.get('window').width - 48;
  const padX = 12;
  const padTop = 24;
  const padBottom = 28;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => ({
    x: padX + (chartW / (data.length - 1)) * i,
    y: padTop + chartH - ((value - min) / range) * (chartH - 20)
  }));

  const buildSmoothPath = (): string => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      d += ` Q ${midX} ${prev.y} ${curr.x} ${curr.y}`;
      if (i === points.length - 2) {
        d += ` T ${points[points.length - 1].x} ${points[points.length - 1].y}`;
      }
    }
    return d;
  };

  const gridLines = [0, 1, 2, 3];

  return (
    <View style={[styles.container, { height }]}>
      {[...gridLines].reverse().map((_, i) => (
        <View key={`grid-${i}`} style={[styles.gridLine, { top: `${12 + i * 22}%` }]} />
      ))}
      <Svg style={StyleSheet.absoluteFill}>
        <Path d={buildSmoothPath()} fill="none" stroke={strokeColor} strokeWidth={3} />
        {points.slice(1, -1).map((p, i) => (
          <Circle key={`pt-${i}`} cx={p.x} cy={p.y} r={4} fill="#ffffff" stroke={pointStrokeColor} strokeWidth={2} />
        ))}
        <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={6} fill={strokeColor} />
        <Line x1={padX} y1={height - padBottom + 8} x2={width - padX} y2={height - padBottom + 8} stroke="rgba(198,198,205,0.4)" strokeWidth={1} />
      </Svg>
      <View style={styles.labelsRow}>
        {labels.map((label, i) => (
          <Text key={`${label}-${i}`} style={styles.label}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative'
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.25)'
  },
  labelsRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  label: {
    ...Typography.monoData,
    fontSize: 10,
    color: Colors.outline
  }
});
