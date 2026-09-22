import React, { useState, useEffect } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { AuthService } from '../services/authService';
import {
  BellRing,
  Volume2,
  CheckCircle,
  Smartphone,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { EmergencySoundService } from '../services/EmergencySoundService';

const GoogleIcon = ({ size = 22 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </Svg>
);

export const LoginScreen = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Device permissions & safety terms state
  const [notificationGranted, setNotificationGranted] = useState<boolean>(false);
  const [audioGranted, setAudioGranted] = useState<boolean>(false);
  const [vibrationGranted, setVibrationGranted] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const { setUser, setSession } = useAppStore();

  useEffect(() => {
    // Check initial notification permission
    const currentNotif = EmergencySoundService.getNotificationPermission();
    if (currentNotif === 'granted') {
      setNotificationGranted(true);
    }
  }, []);

  const handleAllowNotification = async () => {
    const res = await EmergencySoundService.requestNotificationPermission();
    if (res) {
      setNotificationGranted(true);
    }
  };

  const handleAllowAudio = async () => {
    const success = await EmergencySoundService.unlockAndTestAudio();
    if (success) {
      setAudioGranted(true);
    }
  };

  const handleAllowVibration = () => {
    const success = EmergencySoundService.testVibration();
    if (success) {
      setVibrationGranted(true);
    }
  };

  const executeWithTermsCheck = (action: () => void) => {
    const isNotifGranted = EmergencySoundService.getNotificationPermission() === 'granted';
    if (isNotifGranted && audioGranted && vibrationGranted) {
      action();
      return;
    }
    // Prompt user to allow terms one by one
    setPendingAction(() => action);
    setShowTermsModal(true);
  };

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

  const doLocalLogin = () => {
    setUser({
      id: 'local-test-user',
      email: 'developer@safeguard.local',
      app_metadata: { provider: 'local' },
      user_metadata: { name: 'Local Test Administrator' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as any);
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

          {/* Permissions & Terms Status Banner */}
          <TouchableOpacity
            style={styles.safetyStatusBanner}
            onPress={() => setShowTermsModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.statusBannerLeft}>
              <BellRing
                size={18}
                color={
                  notificationGranted && audioGranted && vibrationGranted
                    ? '#10B981'
                    : '#F59E0B'
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.statusBannerTitle}>
                  Emergency Pop-up Terms & Permissions
                </Text>
                <Text style={styles.statusBannerSub}>
                  {notificationGranted && audioGranted && vibrationGranted
                    ? 'All 3 terms & permissions allowed (Popups active outside app) ✓'
                    : `${(notificationGranted ? 1 : 0) + (audioGranted ? 1 : 0) + (vibrationGranted ? 1 : 0)} of 3 allowed — Tap to allow one by one`}
                </Text>
              </View>
            </View>
            <ArrowRight size={14} color="#94A3B8" />
          </TouchableOpacity>

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
                <GoogleIcon size={20} />
                <Text style={styles.googleSsoText}>GOOGLE</Text>
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

          {/* Local Preview Mode Button (Instant Access for localhost testing) */}
          <TouchableOpacity
            style={styles.localDevButton}
            onPress={doLocalLogin}
            activeOpacity={0.85}
          >
            <Text style={styles.localDevButtonText}>⚡ Local Preview Mode (Instant Access)</Text>
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

      {/* Step-by-Step Emergency Terms Modal */}
      {showTermsModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.termsModalCard}>
            <View style={styles.termsModalHeader}>
              <View style={styles.termsBadge}>
                <BellRing size={15} color="#DC2626" />
                <Text style={styles.termsBadgeText}>SYSTEM SAFETY SETUP</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTermsModal(false)}
                style={styles.modalCloseBtn}
                accessibilityLabel="Close terms setup"
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.termsModalTitle}>Out-of-App Emergency Alerts</Text>
            <Text style={styles.termsModalSubtitle}>
              To receive emergency pop-ups and alarms when you are on social media, in another tab,
              or on your desktop/home screen, please allow these permissions one by one:
            </Text>

            {/* Step 1: System Popups */}
            <View style={[styles.termStepCard, notificationGranted && styles.termStepCardDone]}>
              <View style={styles.termStepHeader}>
                <View style={[styles.stepIconBox, notificationGranted && styles.stepIconBoxDone]}>
                  <BellRing size={18} color={notificationGranted ? '#10B981' : '#DC2626'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.termStepTitle}>1. System Emergency Pop-ups</Text>
                  <Text style={styles.termStepDesc}>
                    Allows alerts to pop up on your screen over social media, games, or other apps.
                  </Text>
                </View>
              </View>
              {notificationGranted ? (
                <View style={styles.doneBadge}>
                  <CheckCircle size={14} color="#10B981" />
                  <Text style={styles.doneBadgeText}>Allowed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={handleAllowNotification}
                  activeOpacity={0.85}
                >
                  <Text style={styles.stepBtnText}>Allow Pop-ups (Step 1)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Step 2: Siren Sound */}
            <View style={[styles.termStepCard, audioGranted && styles.termStepCardDone]}>
              <View style={styles.termStepHeader}>
                <View style={[styles.stepIconBox, audioGranted && styles.stepIconBoxDone]}>
                  <Volume2 size={18} color={audioGranted ? '#10B981' : '#3B82F6'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.termStepTitle}>2. Emergency Siren Sound</Text>
                  <Text style={styles.termStepDesc}>
                    Allows high-volume alarm siren to sound without browser autoplay blocking.
                  </Text>
                </View>
              </View>
              {audioGranted ? (
                <View style={styles.doneBadge}>
                  <CheckCircle size={14} color="#10B981" />
                  <Text style={styles.doneBadgeText}>Allowed & Tested</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.stepBtn, styles.audioStepBtn]}
                  onPress={handleAllowAudio}
                  activeOpacity={0.85}
                >
                  <Text style={styles.stepBtnText}>Allow & Test Siren (Step 2)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Step 3: Vibration */}
            <View style={[styles.termStepCard, vibrationGranted && styles.termStepCardDone]}>
              <View style={styles.termStepHeader}>
                <View style={[styles.stepIconBox, vibrationGranted && styles.stepIconBoxDone]}>
                  <Smartphone size={18} color={vibrationGranted ? '#10B981' : '#F59E0B'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.termStepTitle}>3. Continuous Device Vibration</Text>
                  <Text style={styles.termStepDesc}>
                    Vibrates device or trackpad continuously until the emergency is stopped.
                  </Text>
                </View>
              </View>
              {vibrationGranted ? (
                <View style={styles.doneBadge}>
                  <CheckCircle size={14} color="#10B981" />
                  <Text style={styles.doneBadgeText}>Allowed & Tested</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.stepBtn, styles.vibeStepBtn]}
                  onPress={handleAllowVibration}
                  activeOpacity={0.85}
                >
                  <Text style={styles.stepBtnText}>Allow & Test Vibration (Step 3)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Complete / Enter Console Button */}
            <TouchableOpacity
              style={[
                styles.confirmTermsBtn,
                notificationGranted && audioGranted && vibrationGranted && styles.confirmTermsBtnReady,
              ]}
              onPress={() => {
                setShowTermsModal(false);
                pendingAction?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmTermsBtnText}>
                {notificationGranted && audioGranted && vibrationGranted
                  ? '✓ All Terms Allowed — Enter Console'
                  : 'Proceed to Console →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    borderRadius: 24, // Exact rounded pill matching the user reference
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  ssoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleSsoText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 3, // Spaced uppercase "G O O G L E"
    marginLeft: 12,
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
  localDevButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    cursor: 'pointer' as any,
  },
  localDevButtonText: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
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
  safetyStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 10,
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  statusBannerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11, 17, 32, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 99999,
    elevation: 100,
  },
  termsModalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 22,
    width: '100%',
    maxWidth: 460,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  termsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  termsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  termsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  modalCloseBtn: {
    padding: 4,
  },
  termsModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  termsModalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
  },
  termStepCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  termStepCardDone: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  termStepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepIconBoxDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  termStepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  termStepDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 15,
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  doneBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  stepBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioStepBtn: {
    backgroundColor: '#2563EB',
  },
  vibeStepBtn: {
    backgroundColor: '#D97706',
  },
  stepBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmTermsBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmTermsBtnReady: {
    backgroundColor: '#10B981',
  },
  confirmTermsBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});

export default LoginScreen;
