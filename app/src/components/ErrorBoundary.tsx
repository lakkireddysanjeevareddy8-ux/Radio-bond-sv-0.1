import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Share,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AlertTriangle, Copy, RefreshCw, Share2, Check } from 'lucide-react-native';
import { logger, formatUserError } from '../utils/logger';
import { sentryService } from '../services/sentryService';
import { colors, spacing, borderRadius } from '../utils/theme';
import { APP_VERSION_STRING } from '../utils/version';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // 1. Log error with full serialized trace and APP-500 short code
    logger.error('APP_CRASH', error.message || 'React rendering crashed', {
      code: 'APP-500',
      componentStack: errorInfo.componentStack,
      ...logger.serializeError(error),
    });

    // 2. Anonymously report to Sentry if user opted in
    sentryService.captureException(error, {
      code: 'APP-500',
      componentStack: errorInfo.componentStack,
    });
  }

  handleCopyError = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      `WSG-01 App Crash Report (Code: APP-500)`,
      `Version: ${APP_VERSION_STRING}`,
      `Platform: ${Platform.OS}`,
      `Error: ${error?.name}: ${error?.message}`,
      `Stack:\n${error?.stack || 'No stack trace'}`,
      `Component Stack:\n${errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n\n');

    try {
      await Clipboard.setStringAsync(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
      return;
    } catch {}

    try {
      await Share.share({
        title: 'WSG-01 Crash Report',
        message: text,
      });
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (e) {
      console.warn('Copy/Share error note:', e);
    }
  };

  handleRestart = () => {
    logger.info('APP', 'User initiated crash recovery restart');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied } = this.state;
      const userErr = formatUserError(error, 'An unexpected application error occurred', 'crash');

      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <AlertTriangle size={36} color="#DC2626" />
              </View>
              <Text style={styles.title}>Something went wrong</Text>
              <View style={styles.codeBadge}>
                <Text style={styles.codeBadgeText}>Reference Code: {userErr.code || 'APP-500'}</Text>
              </View>
              <Text style={styles.subtitle}>
                An unexpected application error occurred. Diagnostic details have been recorded safely in your Debug Logs.
              </Text>
            </View>

            <ScrollView style={styles.detailsBox} showsVerticalScrollIndicator={true}>
              <Text style={styles.errorTitle}>
                {error?.name || 'Error'}: {error?.message || 'Unknown error'}
              </Text>
              {error?.stack ? (
                <Text style={styles.stackText}>{error.stack}</Text>
              ) : null}
              {errorInfo?.componentStack ? (
                <Text style={styles.componentStackText}>
                  {errorInfo.componentStack.trim()}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.copyBtn]}
                onPress={this.handleCopyError}
                activeOpacity={0.8}
              >
                {copied ? (
                  <Check size={18} color="#059669" style={{ marginRight: 8 }} />
                ) : (
                  <Copy size={18} color="#0F172A" style={{ marginRight: 8 }} />
                )}
                <Text style={[styles.copyBtnText, copied && { color: '#059669' }]}>
                  {copied ? 'Copied to Clipboard!' : 'Copy Crash Details'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.restartBtn]}
                onPress={this.handleRestart}
                activeOpacity={0.8}
              >
                <RefreshCw size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.restartBtnText}>Restart Application</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 10,
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  detailsBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F87171',
    marginBottom: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  stackText: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: spacing.sm,
  },
  componentStackText: {
    fontSize: 10,
    color: '#94A3B8',
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsRow: {
    flexDirection: 'column',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  copyBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  restartBtn: {
    backgroundColor: '#0F172A',
  },
  restartBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
