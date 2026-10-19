import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../theme/colors';
import { useNetworkStatus } from '../hooks/useConnectivity';

/**
 * Non-blocking banner shown only while the device is offline.
 * Renders nothing when online — navigation is never restricted.
 */
export default function OfflineBanner() {
  const status = useNetworkStatus();
  if (status !== 'offline') return null;

  return (
    <View style={styles.banner} pointerEvents="none">
      <Icon name="wifi-off" size={14} color={Colors.onPrimary} />
      <Text style={styles.text}>You're offline. Your assessment will be saved and synced later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md
  },
  text: {
    ...Typography.labelCaps,
    fontSize: 10,
    color: Colors.onPrimary
  }
});
