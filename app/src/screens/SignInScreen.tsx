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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, KeyRound, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, Shield } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../utils/theme';
import { supabase } from '../services/supabaseClient';
import { useAppStore } from '../store/useAppStore';

interface SignInScreenProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({
  onSuccess,
  onCancel,
  title = 'Sign In to Add Device',
  subtitle = 'Enter your email address to receive a 6-digit verification code. Your account will link your WSG-01 safety monitor.',
}) => {
  const insets = useSafeAreaInsets();
  const { setUser, setSession } = useAppStore();

  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          setErrorMessage('Too many requests. Please wait a minute before requesting another code.');
        } else if (error.message.toLowerCase().includes('invalid')) {
          setErrorMessage('Please enter a valid email address.');
        } else {
          setErrorMessage(error.message || 'Failed to send verification code.');
        }
      } else {
        setStep('OTP');
        setSuccessMessage(`A 6-digit verification code was sent to ${trimmedEmail}.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanToken = otpCode.trim().replace(/[^0-9]/g, '');
    if (cleanToken.length < 6) {
      setErrorMessage('Please enter the 6-digit code received in your email.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanToken,
        type: 'email',
      });

      if (error) {
        if (error.message.toLowerCase().includes('expired')) {
          setErrorMessage('The verification code has expired. Please request a new code.');
        } else if (error.message.toLowerCase().includes('invalid')) {
          setErrorMessage('Incorrect verification code. Please double-check the digits.');
        } else {
          setErrorMessage(error.message || 'Verification failed. Please try again.');
        }
      } else if (data?.session) {
        setUser(data.session.user);
        setSession(data.session);
        onSuccess?.();
      } else {
        // Fallback: query session if not in direct response
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          setUser(sessionData.session.user);
          setSession(sessionData.session);
          onSuccess?.();
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification error. Please try again.');
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
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Navigation Header */}
        <View style={styles.headerBar}>
          {onCancel && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <ArrowLeft size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={styles.headerBadge}>
            <Shield size={16} color={colors.primary} />
            <Text style={styles.headerBadgeText}>Secure Safety Account</Text>
          </View>
        </View>

        {/* Title and Subtitle */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {/* Error / Success Notifications */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <AlertCircle size={18} color="#EF4444" style={styles.bannerIcon} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {successMessage && (
          <View style={styles.successBanner}>
            <CheckCircle2 size={18} color="#10B981" style={styles.bannerIcon} />
            <Text style={styles.successBannerText}>{successMessage}</Text>
          </View>
        )}

        {/* Form Steps */}
        {step === 'EMAIL' ? (
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="name@example.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  setErrorMessage(null);
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Send Code</Text>
                  <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.emailDisplayRow}>
              <Text style={styles.emailDisplayText}>{email}</Text>
              <TouchableOpacity
                onPress={() => {
                  setStep('EMAIL');
                  setOtpCode('');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                <Text style={styles.changeEmailText}>Change</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>6-Digit Verification Code</Text>
            <View style={styles.inputWrapper}>
              <KeyRound size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.textInput, styles.otpInput]}
                placeholder="123456"
                placeholderTextColor={colors.textSecondary}
                value={otpCode}
                onChangeText={(val) => {
                  setOtpCode(val);
                  setErrorMessage(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Verify & Continue</Text>
                  <CheckCircle2 size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendRow}
              onPress={handleSendOtp}
              disabled={loading}
            >
              <RefreshCw size={14} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.resendText}>Resend code</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Security / Privacy reassurance note */}
        <View style={styles.securityFooter}>
          <Text style={styles.securityText}>
            🔒 Passwordless authentication via Supabase Auth. Your email is used only to link your WSG-01 push notifications securely.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    marginRight: 12,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 6,
  },
  titleSection: {
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: colors.textPrimary,
  },
  otpInput: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: borderRadius.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emailDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    marginBottom: 18,
  },
  emailDisplayText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  changeEmailText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingVertical: 6,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  successBannerText: {
    fontSize: 13,
    color: '#047857',
    flex: 1,
  },
  bannerIcon: {
    marginRight: 10,
  },
  securityFooter: {
    marginTop: 'auto',
    paddingVertical: 16,
  },
  securityText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
