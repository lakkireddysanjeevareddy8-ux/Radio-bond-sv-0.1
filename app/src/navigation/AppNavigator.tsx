import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { LoginScreen } from '../screens/LoginScreen';
import { Text } from 'react-native';
// Placeholder icons
const Home = (props) => <Text style={{color: props.color}}>{'🏠'}</Text>;
const Cpu = (props) => <Text style={{color: props.color}}>{'🖥️'}</Text>;
const List = (props) => <Text style={{color: props.color}}>{'📋'}</Text>;
const Phone = (props) => <Text style={{color: props.color}}>{'📞'}</Text>;
const Settings = (props) => <Text style={{color: props.color}}>{'⚙️'}</Text>;
const FlaskConical = (props) => <Text style={{color: props.color}}>{'⚗️'}</Text>;

import { DashboardScreen } from '../screens/DashboardScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DemoScreen } from '../screens/DemoScreen';
import { colors } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '600' as const },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          headerTitle: '🛡️  Washroom Safety',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          title: 'Devices',
          tabBarIcon: ({ color, size }) => <Cpu color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => <Phone color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Demo"
        component={DemoScreen}
        options={{
          title: 'Demo',
          tabBarIcon: ({ color, size }) => <FlaskConical color={color} size={size} />,
          tabBarBadge: 'TEST',
        }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const { user } = useAppStore();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
