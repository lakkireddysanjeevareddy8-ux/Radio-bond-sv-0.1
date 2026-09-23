import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrustedContactStore } from '../store/useTrustedContactStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { colors, spacing, borderRadius, typography } from '../utils/theme';
import {
  Users,
  UserPlus,
  Mail,
  User,
  Trash2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  X,
  Send,
  Eye,
} from 'lucide-react-native';

interface ManageTrustedContactsScreenProps {
  onClose?: () => void;
  isReadOnlyViewer?: boolean;
}

export const ManageTrustedContactsScreen: React.FC<ManageTrustedContactsScreenProps> = ({
  onClose,
  isReadOnlyViewer = false,
}) => {
  const insets = useSafeAreaInsets();
  const { getActiveDevice } = useDeviceStore();
  const activeDevice = getActiveDevice();
  const deviceId = activeDevice?.deviceId || 'WSG-000001';

  const {
    trustedContacts,
    isLoading,
    loadContactsForDevice,
    inviteContact,
    removeContact,
  } = useTrustedContactStore();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadContactsForDevice(deviceId);
  }, [deviceId]);

  const handleSendInvite = async () => {
    if (!emailInput.trim()) {
      setActionError('Please enter an email address.');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    const res = await inviteContact(deviceId, emailInput, nameInput);
    setSubmitting(false);

    if (res.success) {
      setEmailInput('');
      setNameInput('');
      setShowInviteModal(false);
      Alert.alert('Invitation Sent', `An emergency alert invitation has been sent to ${emailInput}.`);
    } else {
      setActionError(res.error || 'Failed to send invite.');
    }
  };

  const handleConfirmRemove = (id: string, email: string) => {
    Alert.alert(
      'Remove Trusted Contact',
      `Are you sure you want to revoke emergency alert access for ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeContact(id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Users size={22} color="#2563EB" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Trusted Caregivers</Text>
            <Text style={styles.headerSubtitle}>
              {activeDevice?.name || 'WSG-01'} • {deviceId}
            </Text>
          </View>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Read-Only Banner for Caregiver Viewers */}
      {isReadOnlyViewer && (
        <View style={styles.viewerBanner}>
          <Eye size={18} color="#0284C7" />
          <Text style={styles.viewerBannerText}>
            You are viewing this device as an authorized caregiver (Read-Only access).
          </Text>
        </View>
      )}

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: (insets.bottom || 16) + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Card */}
        <View style={styles.infoCard}>
          <ShieldAlert size={20} color="#2563EB" style={{ marginTop: 2 }} />
          <Text style={styles.infoCardText}>
            Trusted contacts receive real-time push alerts on their phones when an emergency occurs on this
            device.
          </Text>
        </View>

        {/* Action Button: Invite Caregiver */}
        {!isReadOnlyViewer && (
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => setShowInviteModal(true)}
            activeOpacity={0.85}
          >
            <UserPlus size={18} color="#FFFFFF" />
            <Text style={styles.inviteButtonText}>Invite Caregiver or Family Member</Text>
          </TouchableOpacity>
        )}

        {/* Contact List Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Connected Caregivers ({trustedContacts.length})
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingText}>Loading trusted contacts...</Text>
          </View>
        ) : trustedContacts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Users size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Trusted Contacts Yet</Text>
            <Text style={styles.emptySubtitle}>
              Invite family members or caregivers by email so they receive emergency alerts for this room.
            </Text>
          </View>
        ) : (
          <View style={styles.contactList}>
            {trustedContacts.map((contact) => (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.contactHeader}>
                  <View style={styles.avatar}>
                    <User size={18} color="#2563EB" />
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>
                      {contact.contactName || 'Caregiver'}
                    </Text>
                    <Text style={styles.contactEmail}>{contact.contactEmail}</Text>
                  </View>

                  {/* Status Badge */}
                  {contact.status === 'accepted' ? (
                    <View style={styles.badgeAccepted}>
                      <CheckCircle2 size={12} color="#059669" />
                      <Text style={styles.badgeAcceptedText}>Active</Text>
                    </View>
                  ) : (
                    <View style={styles.badgePending}>
                      <Clock size={12} color="#D97706" />
                      <Text style={styles.badgePendingText}>Pending</Text>
                    </View>
                  )}
                </View>

                {/* Card Actions */}
                {!isReadOnlyViewer && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleConfirmRemove(contact.id, contact.contactEmail)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={14} color="#EF4444" />
                      <Text style={styles.removeBtnText}>Revoke Access</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Invite Caregiver Modal */}
      <Modal
        visible={showInviteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <UserPlus size={20} color="#2563EB" />
              </View>
              <Text style={styles.modalTitle}>Invite Trusted Contact</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)} style={styles.modalCloseBtn}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Enter the caregiver's email. They will receive emergency push notifications whenever WSG-01
              detects an incident in this washroom.
            </Text>

            {actionError && <Text style={styles.errorText}>{actionError}</Text>}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Caregiver Name (Optional)</Text>
              <View style={styles.inputRow}>
                <User size={18} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Dr. Sarah / Mom / John"
                  placeholderTextColor="#94A3B8"
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Caregiver Email Address *</Text>
              <View style={styles.inputRow}>
                <Mail size={18} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  placeholder="caregiver@example.com"
                  placeholderTextColor="#94A3B8"
                  value={emailInput}
                  onChangeText={setEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowInviteModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendBtn, submitting && styles.modalSendBtnDisabled]}
                onPress={handleSendInvite}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Send size={15} color="#FFFFFF" />
                    <Text style={styles.modalSendText}>Send Invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  closeBtn: {
    padding: 8,
  },
  viewerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD',
  },
  viewerBannerText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoCardText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  inviteButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  contactList: {
    gap: spacing.sm,
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 1,
  },
  badgeAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeAcceptedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePendingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  modalIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
    marginBottom: spacing.sm,
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    height: 46,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  modalSendBtnDisabled: {
    opacity: 0.6,
  },
  modalSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
