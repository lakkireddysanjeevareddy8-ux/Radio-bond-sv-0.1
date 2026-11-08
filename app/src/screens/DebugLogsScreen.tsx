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
} from 'lucide-react-native';
import { logger, LogEntry, LogLevel } from '../utils/logger';
import { useConnectionStore } from '../store/useConnectionStore';
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

  // Subscribe to live log emissions
  useEffect(() => {
    const unsub = logger.subscribe((updated) => {
      setLogs([...updated].reverse()); // Newest first
    });
    return unsub;
  }, []);

  // System metadata bundle
  const systemMetadata = useMemo(() => {
    return {
      'App Version': `${APP_DETAILS.name} ${APP_VERSION_STRING}`,
      'Platform': `${Platform.OS} (${Platform.Version})`,
      'BLE State': `${connectionStatus.toUpperCase()} ${connectedDevice ? `(${connectedDevice.name} - ${connectedDevice.id})` : ''}`,
    };
  }, [connectionStatus, connectedDevice]);

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
    logs.forEach((l) => {
      if (l.level === 'error') err++;
      else if (l.level === 'warn') warn++;
      else info++;
    });
    return { all: logs.length, err, warn, info };
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
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2500);
        return;
      }
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
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedEntryId(entry.id);
        setTimeout(() => setCopiedEntryId(null), 2000);
        return;
      }
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
    }

    return (
      <TouchableOpacity
        style={[styles.logCard, item.level === 'error' && styles.logCardError]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.logHeader}>
          <View style={styles.logHeaderLeft}>
            <View style={[styles.levelBadge, { backgroundColor: badgeBg }]}>
              <IconComp size={12} color={badgeText} style={{ marginRight: 4 }} />
              <Text style={[styles.levelText, { color: badgeText }]}>
                {item.level.toUpperCase()}
              </Text>
            </View>
            <View style={styles.tagBadge}>
              <Text style={styles.tagText}>{item.tag}</Text>
            </View>
          </View>
          <Text style={styles.timeText}>{timeFormatted}</Text>
        </View>

        <Text style={styles.messageText}>{item.message}</Text>

        {isExpanded && item.data !== undefined && (
          <View style={styles.expandedBox}>
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedLabel}>Payload / Details:</Text>
              <TouchableOpacity
                onPress={() => handleCopyEntry(item)}
                style={styles.copyEntryBtn}
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
            {filteredLogs.length} of {logs.length} events
          </Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handleCopyAll}
            activeOpacity={0.7}
          >
            {copiedAll ? <Check size={18} color="#059669" /> : <Copy size={18} color="#0F172A" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={handleShare}
            activeOpacity={0.7}
          >
            <Share2 size={18} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionIconBtn, { backgroundColor: '#FEE2E2' }]}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Trash2 size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      {/* System Diagnostics Info Strip */}
      <View style={styles.metaBanner}>
        <View style={styles.metaRow}>
          <Smartphone size={13} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.metaText} numberOfLines={1}>
            {APP_DETAILS.shortName} {APP_VERSION_STRING} • {Platform.OS} {Platform.Version}
          </Text>
        </View>
        <View style={[styles.metaRow, { marginTop: 3 }]}>
          <Bluetooth size={13} color="#2563EB" style={{ marginRight: 6 }} />
          <Text style={[styles.metaText, { color: '#1E40AF', fontWeight: '600' }]} numberOfLines={1}>
            BLE: {connectionStatus.toUpperCase()} {connectedDevice ? `(${connectedDevice.name})` : ''}
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
      </View>

      {/* Tag Filter Pills */}
      {availableTags.length > 2 && (
        <View style={styles.tagScrollWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={availableTags}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.tagListContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tagPill, selectedTag === item && styles.tagPillActive]}
                onPress={() => setSelectedTag(item)}
              >
                <Text style={[styles.tagPillText, selectedTag === item && styles.tagPillTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Log Entries List */}
      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Filter size={36} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No logs matching filter</Text>
            <Text style={styles.emptySubtitle}>
              Try clearing your search query or selecting "All" levels.
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  metaBanner: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    marginBottom: 8,
  },
  tagListContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  tagPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  tagPillActive: {
    backgroundColor: '#2563EB',
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  tagPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logCardError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFBFB',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  messageText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    lineHeight: 18,
  },
  expandedBox: {
    backgroundColor: '#0F172A',
    borderRadius: borderRadius.sm,
    padding: 10,
    marginTop: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  expandedLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  copyEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B',
  },
  copyEntryText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  codeText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  expandPrompt: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
});

