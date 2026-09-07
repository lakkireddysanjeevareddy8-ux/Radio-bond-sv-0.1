import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard,
  Cpu,
  ClipboardList,
  Phone,
  Settings,
  FlaskConical,
} from 'lucide-react-native';
import { colors } from '../utils/theme';

interface TabConfig {
  label: string;
  Icon: React.ComponentType<{
    color: string;
    size: number;
    strokeWidth: number;
  }>;
}

const getTabConfig = (routeName: string): TabConfig => {
  switch (routeName) {
    case 'Home':
      return {
        label: 'Dashboard',
        Icon: LayoutDashboard,
      };
    case 'Devices':
      return {
        label: 'Devices',
        Icon: Cpu,
      };
    case 'Events':
      return {
        label: 'Events',
        Icon: ClipboardList,
      };
    case 'Contacts':
      return {
        label: 'Contacts',
        Icon: Phone,
      };
    case 'Settings':
      return {
        label: 'Settings',
        Icon: Settings,
      };
    case 'Demo':
      return {
        label: 'Demo',
        Icon: FlaskConical,
      };
    default:
      return {
        label: routeName,
        Icon: LayoutDashboard,
      };
  }
};

interface AnimatedTabButtonProps {
  route: any;
  isFocused: boolean;
  options: any;
  onPress: () => void;
  onLongPress: () => void;
}

const AnimatedTabButton: React.FC<AnimatedTabButtonProps> = ({
  route,
  isFocused,
  options,
  onPress,
  onLongPress,
}) => {
  const { label, Icon } = getTabConfig(route.name);
  const badge = options.tabBarBadge;

  // Animation values
  const pressScale = useRef(new Animated.Value(1)).current;
  const focusAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: isFocused ? 1 : 0,
      tension: 200,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.88,
      tension: 320,
      friction: 15,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 300,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    // Beautiful formal ripple pulse effect on click
    rippleScale.setValue(0.5);
    rippleOpacity.setValue(0.35);

    Animated.parallel([
      Animated.timing(rippleScale, {
        toValue: 2.1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rippleOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  };

  // Interpolated animated values for icon and active highlights
  const iconScale = focusAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.2, 1.08],
  });

  const combinedScale = Animated.multiply(pressScale, iconScale);

  const translateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2.5],
  });

  const pillOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const pillScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const indicatorScaleX = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.01, 1],
  });

  const indicatorOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const activeColor = colors.primary;
  const inactiveColor = '#64748B';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={options.tabBarAccessibilityLabel || label}
      testID={options.tabBarButtonTestID}
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabButton}
    >
      <View style={styles.tabInner}>
        {/* Animated Capsule Pill Backdrop */}
        <Animated.View
          style={[
            styles.pillBackdrop,
            {
              opacity: pillOpacity,
              transform: [{ scale: pillScale }],
            },
          ]}
        />

        {/* Click Ripple Wave */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rippleWave,
            {
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            },
          ]}
        />

        {/* Animated Icon Container */}
        <Animated.View
          style={[
            styles.iconWrapper,
            {
              transform: [{ scale: combinedScale }, { translateY }],
            },
          ]}
        >
          <Icon
            size={22}
            color={isFocused ? activeColor : inactiveColor}
            strokeWidth={isFocused ? 2.4 : 1.9}
          />

          {/* Badge */}
          {badge !== undefined && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Animated.View>

        {/* Tab Label */}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: isFocused ? activeColor : inactiveColor,
              fontWeight: isFocused ? ('600' as const) : ('500' as const),
            },
          ]}
        >
          {label}
        </Text>

        {/* Active Dot / Indicator Bar */}
        <Animated.View
          style={[
            styles.indicatorBar,
            {
              opacity: indicatorOpacity,
              transform: [{ scaleX: indicatorScaleX }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
};

export const AnimatedBottomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 6);

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: bottomPadding }]}>
      <View style={styles.tabBarRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <AnimatedTabButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              options={options}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 -3px 14px rgba(15, 23, 42, 0.05)',
      } as any,
    }),
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 52,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
      } as any,
    }),
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
    paddingVertical: 2,
  },
  pillBackdrop: {
    position: 'absolute',
    top: 0,
    width: 46,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
  },
  rippleWave: {
    position: 'absolute',
    top: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    zIndex: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -14,
    backgroundColor: colors.emergency,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: -0.1,
    zIndex: 2,
  },
  indicatorBar: {
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
});
