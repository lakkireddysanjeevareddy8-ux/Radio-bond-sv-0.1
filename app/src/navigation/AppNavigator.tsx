import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
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
  const { user, hasCompletedSafetyOnboarding, setHasCompletedSafetyOnboarding } = useAppStore();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !hasCompletedSafetyOnboarding ? (
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
