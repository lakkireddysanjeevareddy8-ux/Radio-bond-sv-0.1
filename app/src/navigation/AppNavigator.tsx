import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { ConnectionManager } from '../services/ConnectionManager';
import { PermissionService } from '../services/PermissionService';
import { AnimatedBottomTabBar } from './AnimatedTabBar';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DemoScreen } from '../screens/DemoScreen';
import { DebugLogsScreen } from '../screens/DebugLogsScreen';
import { SafetySetupScreen } from '../screens/SafetySetupScreen';
import { colors } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const cleanHeaderOptions = {
  headerStyle: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerShadowVisible: false,
  headerTitleAlign: 'left' as const,
  headerTitleStyle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  headerTintColor: colors.primaryDark,
};

const MainTabs = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <AnimatedBottomTabBar {...props} />}
      screenOptions={cleanHeaderOptions}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          headerShown: false,
          title: 'Home',
        }}
      />
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          title: 'Devices',
          headerTitle: 'Devices',
        }}
      />
      <Tab.Screen
        name="History"
        component={EventsScreen}
        options={{
          title: 'History',
          headerTitle: 'History',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerTitle: 'Settings',
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
        await ConnectionManager.init();
        await useConnectionStore.getState().initConnectionStore();
        const persistedCompleted = await initAppStore();
        const report = await PermissionService.checkAllPermissions();

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
      <Stack.Navigator screenOptions={cleanHeaderOptions}>
        {!hasCompletedSafetyOnboarding ? (
          <Stack.Screen
            name="SafetySetup"
            options={{ headerShown: false }}
          >
            {() => (
              <SafetySetupScreen
                onComplete={() => setHasCompletedSafetyOnboarding(true)}
                onSkip={() => setHasCompletedSafetyOnboarding(true)}
              />
            )}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Contacts"
              component={ContactsScreen}
              options={{
                headerShown: true,
                title: 'Emergency contacts',
                headerTitle: 'Emergency contacts',
              }}
            />
            <Stack.Screen
              name="Demo"
              component={DemoScreen}
              options={{
                headerShown: true,
                title: 'Demo & testing',
                headerTitle: 'Demo & testing',
              }}
            />
            <Stack.Screen
              name="DebugLogs"
              component={DebugLogsScreen}
              options={{
                headerShown: false,
                title: 'Debug Logs',
                headerTitle: 'Debug Logs',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
