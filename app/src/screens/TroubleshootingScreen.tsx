import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  ChevronUp,
  Search,
  Wrench,
  Wifi,
  Bluetooth,
  Radio,
  Smartphone,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react-native';
import { colors, typography, spacing, borderRadius, TOUCH_TARGET } from '../utils/theme';
import { strings } from '../constants/strings';

interface TroubleshootingItem {
  id: string;
  title: string;
  symptom: string;
  steps: string[];
}

export const TroubleshootingScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['device_not_found', 'wifi_wont_connect'])
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return strings.troubleshooting.items;
    return strings.troubleshooting.items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.symptom.toLowerCase().includes(q) ||
        item.steps.some((step) => step.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const openSystemSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Wrench size={22} color={colors.primary} />
          <Text style={styles.headerTitle}>{strings.troubleshooting.title}</Text>
        </View>
        <Text style={styles.headerSubtitle}>{strings.troubleshooting.subtitle}</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={strings.troubleshooting.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessible={true}
          accessibilityLabel="Search troubleshooting topics"
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Diagnostic Actions */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.quickActionsTitle}>Quick Device Actions</Text>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={openSystemSettings}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Open Phone System Settings"
            >
              <ExternalLink size={16} color={colors.primaryDark} />
              <Text style={styles.actionButtonText}>Phone Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation?.navigate?.('AboutDevice')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View About Device Specifications"
            >
              <Radio size={16} color={colors.primaryDark} />
              <Text style={styles.actionButtonText}>Device Specs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Troubleshooting List */}
        {filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No matching topics found</Text>
            <Text style={styles.emptySubtitle}>Try searching for "wifi", "bluetooth", "radar", or "battery".</Text>
          </View>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedIds.has(item.id);

            return (
              <View key={item.id} style={styles.itemCard}>
                <TouchableOpacity
                  style={styles.itemHeader}
                  onPress={() => toggleExpand(item.id)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={`${item.title}. ${isExpanded ? 'Collapse' : 'Expand'} details.`}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemHeaderLeft}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemSymptom}>{item.symptom}</Text>
                  </View>
                  <View style={styles.chevronWrap}>
                    {isExpanded ? (
                      <ChevronUp size={20} color={colors.textSecondary} />
                    ) : (
                      <ChevronDown size={20} color={colors.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.stepsContainer}>
                    <Text style={styles.resolutionHeader}>Step-by-step resolution:</Text>
                    {item.steps.map((step, idx) => (
                      <View key={idx} style={styles.stepRow}>
                        <View style={styles.stepNumberBadge}>
                          <Text style={styles.stepNumberText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md + 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: TOUCH_TARGET,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingLeft: 38,
    paddingRight: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
  },
  scrollContent: {
    padding: spacing.md,
  },
  quickActionsContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  quickActionsTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    backgroundColor: colors.primarySoft,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryText,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    minHeight: 56, // Accessible touch target
  },
  itemHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemTitle: {
    ...typography.h3,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  itemSymptom: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsContainer: {
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  resolutionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  stepNumberBadge: {
    width: 20,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.surface,
  },
  stepText: {
    ...typography.body2,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

