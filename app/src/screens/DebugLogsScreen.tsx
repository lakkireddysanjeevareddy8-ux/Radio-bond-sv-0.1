import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Share,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Clipboard } from '../utils/clipboard';
import {
  ArrowLeft,
  Copy,
  Share2,
  Trash2,
  Search,
  Filter,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  Info,
  Smartphone,
  Bluetooth,
  Cpu,
  Activity,
  Bug,
} from 'lucide-react-native';
import { logger, LogEntry, LogLevel, getShortErrorCode } from '../utils/logger';
import { useConnectionStore } from '../store/useConnectionStore';
import { useAppStore } from '../store/useAppStore';
import { APP_VERSION_STRING, APP_DETAILS } from '../utils/version';
import { colors, spacing, borderRadius } from '../utils/theme';

export const DebugLogsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | LogLevel>('ALL');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);

  const connectionStatus = useConnectionStore((s) => s.status);
  const connectedDevice = useConnectionStore((s) => s.connectedDevice);
  const deviceConfig = useAppStore((s) => s.deviceConfig);

  // Derive phone model and OS info
  const constants = (Platform as any)?.constants || {};
  const phoneModel = useMemo(() => {
    const raw =
      constants.Model ||
      constants.model ||
      constants.Brand ||
      (Platform.OS === 'ios' ? 'Apple Device' : 'Android/Web Device');
    const brand = constants.Brand || constants.brand || constants.Manufacturer || '';
    return brand && !raw.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${raw}` : raw;
  }, [constants]);

  const osVersion = useMemo(() => {
    return `${Platform.OS.toUpperCase()} ${Platform.Version}`;
  }, []);

  const firmwareVersion = useMemo(() => {
    return (
      (connectedDevice as any)?.firmwareVersion ||
      (deviceConfig as any)?.firmwareVersion ||
      'v1.0.0 (proto 1)'
    );
  }, [connectedDevice, deviceConfig]);

  // Subscribe to live log emissions
  useEffect(() => {
    const unsub = logger.subscribe((updated) => {
      setLogs([...updated].reverse()); // Newest first
    });
    return unsub;
  }, []);

  // System metadata bundle for export
  const systemMetadata = useMemo(() => {
    return {
      'App Version': `${APP_DETAILS.name} ${APP_VERSION_STRING}`,
      'Phone Model': phoneModel,
      'OS Version': osVersion,
      'Firmware Version': firmwareVersion,
      'Connection State': `${connectionStatus.toUpperCase()} ${
        connectedDevice ? `(${connectedDevice.name} - ${connectedDevice.id})` : ''
      }`,
    };
  }, [phoneModel, osVersion, firmwareVersion, connectionStatus, connectedDevice]);

  // Unique tags for tag selector
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.tag));
    return ['ALL', ...Array.from(set)];
  }, [logs]);

  // Counts by level
  const counts = useMemo(() => {
    let err = 0;
    let warn = 0;
    let info = 0;
    let debug = 0;
    logs.forEach((l) => {
      if (l.level === 'error') err++;
      else if (l.level === 'warn') warn++;
      else if (l.level === 'debug') debug++;
      else info++;
    });
    return { all: logs.length, err, warn, info, debug };
  }, [logs]);

  // Filtered logs list
  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (levelFilter !== 'ALL' && entry.level !== levelFilter) {
        return false;
      }
      if (selectedTag !== 'ALL' && entry.tag !== selectedTag) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const msg = entry.message.toLowerCase();
        const tag = entry.tag.toLowerCase();
        const dataStr = entry.data ? JSON.stringify(entry.data).toLowerCase() : '';
        return msg.includes(query) || tag.includes(query) || dataStr.includes(query);
      }
      return true;
    });
  }, [logs, levelFilter, selectedTag, searchQuery]);

  const handleCopyAll = async () => {
    const text = logger.exportLogsAsText(systemMetadata);
    try {
      await Clipboard.setStringAsync(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
      return;
    } catch {}

    try {
      await Share.share({
        title: 'WSG-01 Debug Logs',
        message: text,
      });
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch (e) {
      console.warn('Copy/Share note:', e);
    }
  };

  const handleShare = async () => {
    const text = logger.exportLogsAsText(systemMetadata);
    try {
      await Share.share({
        title: 'WSG-01 Diagnostic Logs',
        message: text,
      });
    } catch (e) {
      console.warn('Share note:', e);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Diagnostic Logs',
      'Are you sure you want to erase all 500 in-memory and persisted diagnostic logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await logger.clearLogs();
          },
        },
      ]
    );
  };

  const handleCopyEntry = async (entry: LogEntry) => {
    const text = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}\n${
      entry.data ? JSON.stringify(entry.data, null, 2) : ''
    }`;

    try {
      await Clipboard.setStringAsync(text);
      setCopiedEntryId(entry.id);
      setTimeout(() => setCopiedEntryId(null), 2000);
      return;
    } catch {}

    try {
      await Share.share({ message: text });
      setCopiedEntryId(entry.id);
      setTimeout(() => setCopiedEntryId(null), 2000);
    } catch {}
  };

  const renderLogItem = ({ item }: { item: LogEntry }) => {
    const isExpanded = expandedId === item.id;
    const isCopied = copiedEntryId === item.id;
    const timeFormatted = item.timestamp.split('T')[1]?.slice(0, 12) || item.timestamp;

    let badgeBg = '#EFF6FF';
    let badgeText = '#2563EB';
    let IconComp = Info;

    if (item.level === 'error') {
      badgeBg = '#FEE2E2';
      badgeText = '#DC2626';
      IconComp = AlertCircle;
    } else if (item.level === 'warn') {
      badgeBg = '#FEF3C7';
      badgeText = '#D97706';
      IconComp = AlertTriangle;
    } else if (item.level === 'debug') {
      badgeBg = '#F1F5F9';
      badgeText = '#64748B';
      IconComp = Bug;
    }

    // Determine if this entry has a short error code (e.g. BLE-201, WIFI-101, APP-500)
    let shortCode: string | null = null;
    if (item.data?.code) {
      shortCode = String(item.data.code);
    } else if (item.level === 'error') {
      shortCode = getShortErrorCode(item.data || item.message);
    }

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.logCardHeader}>
          <View style={styles.logMetaLeft}>
            <View style={[styles.levelBadge, { backgroundColor: badgeBg }]}>
              <IconComp size={11} color={badgeText} style={{ marginRight: 4 }} />
              <Text style={[styles.levelText, { color: badgeText }]}>
                {item.level.toUpperCase()}
              </Text>
            </View>

            <View style={styles.tagBadge}>
              <Text style={styles.tagText}>{item.tag}</Text>
            </View>

            {shortCode && (
              <View style={styles.codeBadge}>
                <Text style={styles.codeBadgeText}>{shortCode}</Text>
              </View>
            )}
          </View>

          <Text style={styles.timestampText}>{timeFormatted}</Text>
        </View>

        <Text style={styles.messageText} numberOfLines={isExpanded ? undefined : 2}>
          {item.message}
        </Text>

        {isExpanded && item.data !== undefined && (
          <View style={styles.detailsPayloadWrap}>
            <View style={styles.payloadHeaderRow}>
              <Text style={styles.payloadHeaderTitle}>Payload / Trace</Text>
              <TouchableOpacity
                style={styles.copyEntryBtn}
                onPress={() => handleCopyEntry(item)}
                activeOpacity={0.7}
              >
                {isCopied ? (
                  <Check size={14} color="#059669" />
                ) : (
                  <Copy size={14} color="#64748B" />
                )}
                <Text style={[styles.copyEntryText, isCopied && { color: '#059669' }]}>
                  {isCopied ? 'Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeText}>
              {typeof item.data === 'string'
                ? item.data
                : JSON.stringify(item.data, null, 2)}
            </Text>
          </View>
        )}

        <View style={styles.expandRow}>
          <Text style={styles.expandPrompt}>
            {isExpanded ? 'Collapse' : item.data ? 'Tap to view details' : ''}
          </Text>
          {item.data ? (
            isExpanded ? (
              <ChevronUp size={14} color="#94A3B8" />
            ) : (
              <ChevronDown size={14} color="#94A3B8" />
            )
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.screenTitle}>Debug Logs</Text>
          <Text style={styles.screenSubtitle}>
            {filteredLogs.length} of {logs.length} entries
          </Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handleCopyAll}
            activeOpacity={0.7}
            accessibilityLabel="Copy all diagnostic logs"
          >
            {copiedAll ? <Check size={18} color="#059669" /> : <Copy size={18} color="#0F172A" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handleShare}
            activeOpacity={0.7}
            accessibilityLabel="Share diagnostic logs"
          >
            <Share2 size={18} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionIconBtn, { backgroundColor: '#FEE2E2' }]}
            onPress={handleClear}
            activeOpacity={0.7}
            accessibilityLabel="Clear diagnostic logs"
          >
            <Trash2 size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      {/* System Diagnostics Info Header Strip */}
      <View style={styles.metaBanner}>
        <View style={styles.metaRow}>
          <Smartphone size={13} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.metaText} numberOfLines={1}>
            <Text style={styles.metaLabel}>App: </Text>
            {APP_DETAILS.name} {APP_VERSION_STRING}
            <Text style={styles.metaLabel}> • Device: </Text>
            {phoneModel}
          </Text>
        </View>

        <View style={[styles.metaRow, { marginTop: 3 }]}>
          <Cpu size={13} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.metaText} numberOfLines={1}>
            <Text style={styles.metaLabel}>OS: </Text>
            {osVersion}
            <Text style={styles.metaLabel}> • Firmware: </Text>
            {firmwareVersion}
          </Text>
        </View>

        <View style={[styles.metaRow, { marginTop: 3 }]}>
          <Bluetooth size={13} color="#2563EB" style={{ marginRight: 6 }} />
          <Text style={[styles.metaText, { color: '#1E40AF', fontWeight: '600' }]} numberOfLines={1}>
            <Text style={styles.metaLabel}>BLE State: </Text>
            {connectionStatus.toUpperCase()} {connectedDevice ? `(${connectedDevice.name})` : ''}
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Search size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by message, tag, or payload..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Level Filters Pills */}
      <View style={styles.filterPillsRow}>
        <TouchableOpacity
          style={[styles.pill, levelFilter === 'ALL' && styles.pillActive]}
          onPress={() => setLevelFilter('ALL')}
        >
          <Text style={[styles.pillText, levelFilter === 'ALL' && styles.pillTextActive]}>
            All ({counts.all})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, levelFilter === 'error' && styles.pillActiveError]}
          onPress={() => setLevelFilter('error')}
        >
          <Text style={[styles.pillText, levelFilter === 'error' && styles.pillTextActiveError]}>
            Errors ({counts.err})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, levelFilter === 'warn' && styles.pillActiveWarn]}
          onPress={() => setLevelFilter('warn')}
        >
          <Text style={[styles.pillText, levelFilter === 'warn' && styles.pillTextActiveWarn]}>
            Warnings ({counts.warn})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, levelFilter === 'info' && styles.pillActive]}
          onPress={() => setLevelFilter('info')}
        >
          <Text style={[styles.pillText, levelFilter === 'info' && styles.pillTextActive]}>
            Info ({counts.info})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, levelFilter === 'debug' && styles.pillActive]}
          onPress={() => setLevelFilter('debug')}
        >
          <Text style={[styles.pillText, levelFilter === 'debug' && styles.pillTextActive]}>
            Debug ({counts.debug})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tag Filter Pills */}
      {availableTags.length > 2 && (
        <View style={styles.tagScrollWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={availableTags}
            keyExtractor={(tag) => tag}
            renderItem={({ item: tag }) => (
              <TouchableOpacity
                style={[styles.tagPill, selectedTag === tag && styles.tagPillActive]}
                onPress={() => setSelectedTag(tag)}
              >
                <Text style={[styles.tagPillText, selectedTag === tag && styles.tagPillTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingHorizontal: spacing.md }}
          />
        </View>
      )}

      {/* Main Logs List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Activity size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No logs match your filter</Text>
            <Text style={styles.emptySubtitle}>
              Try selecting "All" or clearing the search query to view diagnostic entries.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBanner: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontWeight: '600',
    color: '#475569',
  },
  metaText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  pillActiveError: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  pillActiveWarn: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextActiveError: {
    color: '#FFFFFF',
  },
  pillTextActiveWarn: {
    color: '#FFFFFF',
  },
  tagScrollWrap: {
    paddingTop: spacing.xs,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    marginRight: 6,
  },
  tagPillActive: {
    backgroundColor: '#2563EB',
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
  },
  tagPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  logMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  timestampText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  messageText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
  },
  detailsPayloadWrap: {
    marginTop: spacing.sm,
    backgroundColor: '#0F172A',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  payloadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 4,
  },
  payloadHeaderTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  copyEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  copyEntryText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  codeText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 15,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  expandPrompt: {
    fontSize: 11,
    color: '#94A3B8',
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
});
