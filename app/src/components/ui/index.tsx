import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  Platform,
  AccessibilityRole,
} from 'react-native';
import {
  colors,
  spacing,
  borderRadius,
  shadows,
  typography,
  TOUCH_TARGET,
  toneColors,
  Tone,
} from '../../utils/theme';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';

// -------------------------------------------------------------
// Card Component
// -------------------------------------------------------------
export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'outlined' | 'flat' | 'elevated' | 'solid';
  tone?: Tone;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  tone,
  onPress,
  disabled = false,
  accessibilityRole,
  accessibilityLabel,
  testID,
}) => {
  const toneStyle = tone ? toneColors(tone) : null;

  const cardStyle: ViewStyle = {
    backgroundColor: toneStyle
      ? variant === 'solid'
        ? toneStyle.solid
        : toneStyle.bg
      : colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: variant === 'flat' ? 0 : 1,
    borderColor: toneStyle ? toneStyle.border : colors.border,
    ...(variant === 'elevated' || variant === 'default' ? shadows.sm : {}),
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole || 'button'}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[styles.cardBase, cardStyle, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.cardBase, cardStyle, style]}
    >
      {children}
    </View>
  );
};

// -------------------------------------------------------------
// Button Component
// -------------------------------------------------------------
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  title?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  title,
  children,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
  textStyle,
  testID,
}) => {
  const getVariantStyles = (): { container: ViewStyle; text: TextStyle; loaderColor: string } => {
    switch (variant) {
      case 'secondary':
        return {
          container: {
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
          },
          text: {
            color: colors.textPrimary,
          },
          loaderColor: colors.textPrimary,
        };
      case 'danger':
        return {
          container: {
            backgroundColor: colors.emergency,
            borderWidth: 0,
          },
          text: {
            color: '#FFFFFF',
          },
          loaderColor: '#FFFFFF',
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 0,
          },
          text: {
            color: colors.primaryDark,
          },
          loaderColor: colors.primaryDark,
        };
      case 'outline':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: colors.primary,
          },
          text: {
            color: colors.primaryDark,
          },
          loaderColor: colors.primaryDark,
        };
      case 'primary':
      default:
        return {
          container: {
            backgroundColor: colors.primary,
            borderWidth: 0,
          },
          text: {
            color: '#FFFFFF',
          },
          loaderColor: '#FFFFFF',
        };
    }
  };

  const getSizeStyles = (): { container: ViewStyle; text: TextStyle } => {
    switch (size) {
      case 'sm':
        return {
          container: {
            minHeight: TOUCH_TARGET,
            paddingVertical: spacing.xs + 2,
            paddingHorizontal: spacing.md,
            borderRadius: borderRadius.md,
          },
          text: {
            ...typography.body2,
            fontWeight: '600',
          },
        };
      case 'lg':
        return {
          container: {
            minHeight: 52,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: borderRadius.lg,
          },
          text: {
            ...typography.body1,
            fontWeight: '700',
          },
        };
      case 'md':
      default:
        return {
          container: {
            minHeight: TOUCH_TARGET,
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.lg,
            borderRadius: borderRadius.lg,
          },
          text: {
            ...typography.body2,
            fontWeight: '600',
          },
        };
    }
  };

  const vStyles = getVariantStyles();
  const sStyles = getSizeStyles();
  const effectiveDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={effectiveDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || (typeof title === 'string' ? title : undefined)}
      testID={testID}
      style={[
        styles.buttonBase,
        vStyles.container,
        sStyles.container,
        effectiveDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={vStyles.loaderColor} />
      ) : (
        <View style={styles.buttonInnerRow}>
          {icon && iconPosition === 'left' ? (
            <View style={{ marginRight: spacing.sm }}>{icon}</View>
          ) : null}
          {title ? (
            <Text style={[vStyles.text, sStyles.text, textStyle]}>{title}</Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' ? (
            <View style={{ marginLeft: spacing.sm }}>{icon}</View>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
};

// -------------------------------------------------------------
// Pill Component
// -------------------------------------------------------------
export interface PillProps {
  label?: string;
  children?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Pill: React.FC<PillProps> = ({
  label,
  children,
  tone = 'neutral',
  icon,
  size = 'md',
  onPress,
  accessibilityLabel,
  style,
  textStyle,
}) => {
  const toneStyle = toneColors(tone);

  const containerStyle: ViewStyle = {
    backgroundColor: toneStyle.bg,
    borderColor: toneStyle.border,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
    paddingVertical: size === 'sm' ? 2 : spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: onPress ? TOUCH_TARGET : undefined,
    justifyContent: 'center',
  };

  const content = (
    <>
      {icon ? <View style={{ marginRight: spacing.xs }}>{icon}</View> : null}
      {label ? (
        <Text
          style={[
            typography.caption,
            { color: toneStyle.text, fontWeight: '600' },
            textStyle,
          ]}
        >
          {label}
        </Text>
      ) : (
        children
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        style={[containerStyle, style]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[containerStyle, style]}>{content}</View>;
};

// -------------------------------------------------------------
// IconBadge Component
// -------------------------------------------------------------
export interface IconBadgeProps {
  icon: React.ReactNode;
  tone?: Tone;
  size?: number;
  shape?: 'circle' | 'rounded';
  style?: StyleProp<ViewStyle>;
}

export const IconBadge: React.FC<IconBadgeProps> = ({
  icon,
  tone = 'primary',
  size = 40,
  shape = 'circle',
  style,
}) => {
  const toneStyle = toneColors(tone);

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: shape === 'circle' ? size / 2 : borderRadius.md,
          backgroundColor: toneStyle.bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: toneStyle.border,
        },
        style,
      ]}
    >
      {icon}
    </View>
  );
};

// -------------------------------------------------------------
// SectionTitle Component
// -------------------------------------------------------------
export interface SectionTitleProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
    icon?: React.ReactNode;
  };
  style?: StyleProp<ViewStyle>;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  title,
  subtitle,
  action,
  style,
}) => {
  return (
    <View style={[styles.sectionTitleContainer, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitleText}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitleText}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={styles.sectionActionBtn}
        >
          {action.icon ? <View style={{ marginRight: 4 }}>{action.icon}</View> : null}
          <Text style={styles.sectionActionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

// -------------------------------------------------------------
// ListRow Component
// -------------------------------------------------------------
export interface ListRowProps {
  title: string;
  subtitle?: string;
  leftIcon?: React.ReactNode;
  leftBadgeTone?: Tone;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  leftIcon,
  leftBadgeTone,
  rightElement,
  showChevron = true,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}) => {
  const content = (
    <View style={styles.listRowInner}>
      {leftIcon ? (
        leftBadgeTone ? (
          <IconBadge icon={leftIcon} tone={leftBadgeTone} size={38} style={{ marginRight: spacing.md }} />
        ) : (
          <View style={{ marginRight: spacing.md, justifyContent: 'center', alignItems: 'center' }}>
            {leftIcon}
          </View>
        )
      ) : null}

      <View style={styles.listRowTextContainer}>
        <Text style={styles.listRowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listRowSubtitle}>{subtitle}</Text> : null}
      </View>

      {rightElement ? <View style={{ marginLeft: spacing.sm }}>{rightElement}</View> : null}

      {showChevron && onPress ? (
        <View style={{ marginLeft: spacing.xs }}>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        style={[styles.listRowContainer, disabled && { opacity: 0.5 }, style]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.listRowContainer, style]}>{content}</View>;
};

// -------------------------------------------------------------
// Collapsible Component
// -------------------------------------------------------------
export interface CollapsibleProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  children,
  style,
  headerStyle,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card style={[styles.collapsibleCard, style]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setIsOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={`${isOpen ? 'Collapse' : 'Expand'} ${title}`}
        accessibilityState={{ expanded: isOpen }}
        style={[styles.collapsibleHeader, headerStyle]}
      >
        {icon ? <View style={{ marginRight: spacing.md }}>{icon}</View> : null}
        <View style={{ flex: 1, paddingRight: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={styles.collapsibleTitle}>{title}</Text>
            {badge}
          </View>
          {subtitle ? <Text style={styles.collapsibleSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.chevronBox}>
          {isOpen ? (
            <ChevronUp size={18} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={18} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>

      {isOpen && <View style={styles.collapsibleContent}>{children}</View>}
    </Card>
  );
};

// -------------------------------------------------------------
// Shared Styles
// -------------------------------------------------------------
const styles = StyleSheet.create({
  cardBase: {
    marginVertical: spacing.xs,
  },
  buttonBase: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
      } as any,
    }),
  },
  buttonInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  sectionTitleText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionSubtitleText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  sectionActionText: {
    ...typography.body2,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  listRowContainer: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  listRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listRowTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  listRowTitle: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listRowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  collapsibleCard: {
    padding: 0,
    overflow: 'hidden',
    marginVertical: spacing.xs + 2,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET + 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  collapsibleTitle: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  collapsibleSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevronBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsibleContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});

