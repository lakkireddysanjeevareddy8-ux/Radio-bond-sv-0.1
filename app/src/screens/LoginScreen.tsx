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
      setErrorMessage('Please enter both your email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
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
          setSuccessMessage('Account created! Please check your email to confirm registration or sign in.');
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
      setErrorMessage(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* Brand & Shield Header */}
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeIcon}>🛡️</Text>
            </View>
            <Text style={styles.appName}>Radio-Bond SafeGuard</Text>
            <Text style={styles.tagline}>Autonomous & Non-Invasive Washroom Safety</Text>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, !isSignUp && styles.tabActive]}
              onPress={() => {
                setIsSignUp(false);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
            >
              <Text style={[styles.tabText, !isSignUp && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, isSignUp && styles.tabActive]}
              onPress={() => {
                setIsSignUp(true);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
            >
              <Text style={[styles.tabText, isSignUp && styles.tabTextActive]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Feedback messages */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✅ {successMessage}</Text>
            </View>
          )}

          {/* Google OAuth Button */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#1F2937" />
            ) : (
              <View style={styles.googleBtnContent}>
                <View style={styles.googleIconBadge}>
                  <Text style={{ fontSize: 16 }}>G</Text>
                </View>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefixIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          {/* Password input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefixIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder={isSignUp ? 'Create a secure password (6+ chars)' : 'Enter your password'}
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleEmailAuth}
            disabled={loading}
            activeOpacity={0.88}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isSignUp ? 'Create SafeGuard Account' : 'Sign In to Dashboard'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Privacy & Trust Badge */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              🔒 256-Bit Encrypted · Radar & Audio Privacy First · Zero Cameras
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A', // Sleek dark slate
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  badgeIcon: {
    fontSize: 32,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#0284C7',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  successBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputPrefixIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: '#0F172A',
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default LoginScreen;
