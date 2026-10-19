import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import AthleteDashboardScreen from '../screens/dashboard/AthleteDashboardScreen';
import StartAssessmentScreen from '../screens/assessment/StartAssessmentScreen';
import AnalysisResultsScreen from '../screens/assessment/AnalysisResultsScreen';
import FindCoachScreen from '../screens/marketplace/FindCoachScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

const TABS = [
  {
    name: 'Home',
    icon: 'home',
    label: 'Home',
    component: AthleteDashboardScreen,
    large: false
  },
  {
    name: 'Explore',
    icon: 'search',
    label: 'Explore',
    component: FindCoachScreen,
    large: false
  },
  {
    name: 'Assess',
    icon: 'add-circle',
    label: 'Assess',
    component: StartAssessmentScreen,
    large: true
  },
  {
    name: 'Insights',
    icon: 'insights',
    label: 'Insights',
    component: AnalysisResultsScreen,
    large: false
  },
  {
    name: 'Profile',
    icon: 'person',
    label: 'Profile',
    component: SettingsScreen,
    large: false
  }
] as const;

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <View style={styles.item}>
                <Icon
                  name={tab.icon}
                  size={tab.large ? 32 : 22}
                  color={focused ? Colors.secondary : Colors.onSurfaceVariant}
                  style={focused && !tab.large ? styles.activeScale : undefined}
                />
                <Text style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}>
                  {tab.label}
                </Text>
              </View>
            )
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(247,249,251,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(198,198,205,0.35)',
    height: 68,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  activeScale: {
    transform: [{ scale: 1.1 }]
  },
  label: {
    fontFamily: 'Geist_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 4,
    fontWeight: '700'
  },
  labelActive: {
    color: Colors.secondary
  },
  labelInactive: {
    color: Colors.onSurfaceVariant
  }
});
