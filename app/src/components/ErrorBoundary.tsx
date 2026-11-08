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
import { AlertTriangle, Copy, RefreshCw, Share2 } from 'lucide-react-native';
import { logger } from '../utils/logger';
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
    logger.error('CRASH', error.message || 'React rendering crashed', {
      componentStack: errorInfo.componentStack,
      ...logger.serializeError(error),
    });
  }

  handleCopyError = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      `WSG-01 App Crash Report`,
      `Version: ${APP_VERSION_STRING}`,
      `Platform: ${Platform.OS}`,
      `Error: ${error?.name}: ${error?.message}`,
      `Stack:\n${error?.stack || 'No stack trace'}`,
      `Component Stack:\n${errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
        return;
      }
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

      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <AlertTriangle size={36} color="#DC2626" />
              </View>
              <Text style={styles.title}>Something went wrong</Text>
              <Text style={styles.subtitle}>
                The application encountered an unexpected issue. Diagnostic details have been recorded.
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
                {Platform.OS === 'web' ? (
                  <Copy size={18} color="#0F172A" style={{ marginRight: 8 }} />
                ) : (
                  <Share2 size={18} color="#0F172A" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.copyBtnText}>
                  {copied ? 'Copied to Clipboard!' : 'Copy / Share Error'}
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
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: spacing.xs,
    textAlign: 'center',
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
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F87171',
    marginBottom: spacing.sm,
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
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  copyBtn: {
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  restartBtn: {
    backgroundColor: colors.primaryDark,
  },
  restartBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

