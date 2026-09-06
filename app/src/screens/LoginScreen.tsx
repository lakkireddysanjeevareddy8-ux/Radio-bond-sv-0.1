import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { AuthService } from '../services/authService';

export const LoginScreen = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { setUser, setSession } = useAppStore();

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    const { error } = await AuthService.signInWithGoogle();
    if (error) {
      setErrorMessage(error.message);
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters in length.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await AuthService.signUpWithEmail(email.trim(), password);
        if (error) {
          setErrorMessage(error.message);
        } else if (data?.session) {
          setUser(data.session.user);
          setSession(data.session);
        } else {
          setSuccessMessage('Registration initiated. Please verify your email to access the safety console.');
        }
      } else {
        const { data, error } = await AuthService.signInWithEmail(email.trim(), password);
        if (error) {
          setErrorMessage(error.message);
        } else if (data?.session) {
          setUser(data.session.user);
          setSession(data.session);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollWrapper}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Main Enterprise Card */}
        <View style={styles.authCard}>
          {/* Header & Logo */}
          <View style={styles.brandHeader}>
            <View style={styles.emblemContainer}>
              <View style={styles.emblemInner}>
                <Text style={styles.emblemIcon}>🛡️</Text>
              </View>
            </View>
            <Text style={styles.brandCategory}>ENTERPRISE SAFETY PLATFORM</Text>
            <Text style={styles.brandTitle}>Radio-Bond SafeGuard</Text>
            <Text style={styles.brandSubtitle}>
              Autonomous, non-invasive washroom wellbeing & fall prevention monitoring
            </Text>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabButton, !isSignUp && styles.tabButtonActive]}
              onPress={() => {
                setIsSignUp(false);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, !isSignUp && styles.tabLabelActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, isSignUp && styles.tabButtonActive]}
              onPress={() => {
                setIsSignUp(true);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, isSignUp && styles.tabLabelActive]}>
                Register Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Alerts */}
          {errorMessage && (
            <View style={styles.alertError}>
              <Text style={styles.alertErrorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.alertSuccess}>
              <Text style={styles.alertSuccessText}>✓ {successMessage}</Text>
            </View>
          )}

          {/* Google Single Sign-On Button */}
          <TouchableOpacity
            style={styles.googleSsoButton}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <View style={styles.ssoContent}>
                <View style={styles.googleLogoBox}>
                  <Text style={styles.googleLetter}>G</Text>
                </View>
                <Text style={styles.googleSsoText}>Continue with Google Workspace</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR CONTINUE WITH SECURE EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Organizational Email</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.fieldIcon}>✉️</Text>
              <TextInput
                style={styles.textInput}
                placeholder="administrator@organization.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              {!isSignUp && (
                <Text style={styles.forgotLink}>Forgot?</Text>
              )}
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.fieldIcon}>🔒</Text>
              <TextInput
                style={styles.textInput}
                placeholder={isSignUp ? 'Create password (min 6 characters)' : 'Enter account password'}
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          {/* Submit Action Button */}
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={handleEmailAuth}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryActionText}>
                {isSignUp ? 'Create SafeGuard Account →' : 'Authorize & Enter Console →'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Institutional Compliance Badges */}
          <View style={styles.complianceFooter}>
            <View style={styles.complianceBadgeRow}>
              <Text style={styles.complianceBadge}>🔒 256-Bit SSL</Text>
              <Text style={styles.complianceDot}>•</Text>
              <Text style={styles.complianceBadge}>Radar Protected</Text>
              <Text style={styles.complianceDot}>•</Text>
              <Text style={styles.complianceBadge}>Zero Cameras</Text>
            </View>
            <Text style={styles.disclaimerText}>
              Protected under HIPAA & GDPR privacy architectures. Non-optical millimeter-wave sensing only.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120', // Ultra-deep formal obsidian navy
  },
  scrollWrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
    minHeight: '100%',
  },
  authCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 36,
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 35,
    elevation: 12,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  emblemContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  emblemInner: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  emblemIcon: {
    fontSize: 24,
  },
  brandCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 2.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.6,
    marginBottom: 8,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 380,
    fontWeight: '400',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  alertError: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  alertErrorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  alertSuccess: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  alertSuccessText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  googleSsoButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  ssoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleLogoBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  googleLetter: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2563EB',
  },
  googleSsoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: -0.1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerLabel: {
    marginHorizontal: 12,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.2,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  fieldIcon: {
    fontSize: 15,
    marginRight: 10,
    opacity: 0.8,
  },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#0F172A',
  },
  primaryActionButton: {
    backgroundColor: '#0284C7', // Deep Medical Sapphire Blue
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 22,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  complianceFooter: {
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  complianceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  complianceBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  complianceDot: {
    fontSize: 12,
    color: '#CBD5E1',
    marginHorizontal: 8,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default LoginScreen;
