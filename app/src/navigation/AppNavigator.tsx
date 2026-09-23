import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { PermissionService } from '../services/PermissionService';
import { LoginScreen } from '../screens/LoginScreen';
import { AnimatedBottomTabBar } from './AnimatedTabBar';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DemoScreen } from '../screens/DemoScreen';
import { SafetySetupScreen } from '../screens/SafetySetupScreen';
import { colors } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <AnimatedBottomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '600' as const },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          headerTitle: '🛡️  Washroom Safety',
        }}
      />
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          title: 'Devices',
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          title: 'Events',
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          title: 'Contacts',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
        }}
      />
      <Tab.Screen
        name="Demo"
        component={DemoScreen}
        options={{
          title: 'Demo',
          tabBarBadge: 'TEST',
        }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const {
    hasCompletedSafetyOnboarding,
    setHasCompletedSafetyOnboarding,
    initAppStore,
  } = useAppStore();

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkInitialState = async () => {
      try {
        // 1. Initialize persisted state from AsyncStorage
        const persistedCompleted = await initAppStore();

        // 2. Audit actual OS permissions (Bluetooth, Notifications, etc.)
        const report = await PermissionService.checkAllPermissions();

        // If the user already completed onboarding previously OR if OS permissions are already allowed
        if (persistedCompleted || report.allEssentialGranted) {
          setHasCompletedSafetyOnboarding(true);
        }
      } catch (err) {
        console.warn('[AppNavigator] Error checking permissions/onboarding state:', err);
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    checkInitialState();

    return () => {
      isMounted = false;
    };
  }, [initAppStore, setHasCompletedSafetyOnboarding]);

  if (isInitializing) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!hasCompletedSafetyOnboarding ? (
          <Stack.Screen name="SafetySetup">
            {() => (
              <SafetySetupScreen
                onComplete={() => setHasCompletedSafetyOnboarding(true)}
                onSkip={() => setHasCompletedSafetyOnboarding(true)}
              />
            )}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

