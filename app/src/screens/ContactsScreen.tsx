import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Linking,
  Alert,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import {
  Phone,
  Plus,
  Trash2,
  Star,
  X,
  UserPlus,
  AlertCircle,
  ShieldAlert,
  Mail,
  UserCheck,
  Clock,
  CheckCircle2,
  RefreshCw,
  Send,
  Bell,
  Check,
  Shield,
  Pencil,
} from 'lucide-react-native';
import { useContactStore } from '../store/useContactStore';
import { useEmergencyContactStore } from '../store/useEmergencyContactStore';
import { useAppStore } from '../store/useAppStore';
import { Contact, EmergencyContact } from '../types';

const RELATIONSHIP_PRESETS = [
  'Mother',
  'Father',
  'Brother',
  'Sister',
  'Guardian',
  'Friend',
  'Doctor',
  'Neighbor',
];

export const ContactsScreen: React.FC = () => {
  const { user } = useAppStore();
  const { contacts, addContact, removeContact, setPrimaryContact } = useContactStore();
  const {
    contacts: trustedContacts,
    pendingInvitations,
    isLoading: isTrustedLoading,
    loadAll: loadTrustedContacts,
    addContact: addTrustedContact,
    updateContact: updateTrustedContact,
    toggleEnabled: toggleTrustedEnabled,
    removeContact: removeTrustedContact,
    resendInvitation,
    acceptInvitation,
    declineInvitation,
  } = useEmergencyContactStore();

  const [activeTab, setActiveTab] = useState<'TRUSTED' | 'DIRECT_DIAL'>('TRUSTED');

  // Trusted Contact Add/Edit Modal
  const [isTrustedModalOpen, setIsTrustedModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [trustedName, setTrustedName] = useState('');
  const [trustedEmail, setTrustedEmail] = useState('');
  const [trustedRelationship, setTrustedRelationship] = useState('Mother');
  const [trustedPriority, setTrustedPriority] = useState<number>(1);
  const [trustedFormError, setTrustedFormError] = useState<string | null>(null);
  const [isSubmittingTrusted, setIsSubmittingTrusted] = useState(false);

  // Direct Phone Contact Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelationship, setNewRelationship] = useState('Family Member');
  const [isPrimary, setIsPrimary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [trustedToDelete, setTrustedToDelete] = useState<EmergencyContact | null>(null);

  useEffect(() => {
    loadTrustedContacts();
  }, []);

  const resetTrustedForm = () => {
    setEditingContactId(null);
    setTrustedName('');
    setTrustedEmail('');
    setTrustedRelationship('Mother');
    setTrustedPriority(1);
    setTrustedFormError(null);
  };

  const handleOpenAddTrusted = () => {
    resetTrustedForm();
    setIsTrustedModalOpen(true);
  };

  const handleOpenEditTrusted = (c: EmergencyContact) => {
    setEditingContactId(c.id);
    setTrustedName(c.name);
    setTrustedEmail(c.email);
    setTrustedRelationship(c.relationship);
    setTrustedPriority(c.priority || 1);
    setTrustedFormError(null);
    setIsTrustedModalOpen(true);
  };

  const handleSaveTrustedContact = async () => {
    const trimmedName = trustedName.trim();
    const trimmedEmail = trustedEmail.trim().toLowerCase();
    const trimmedRel = trustedRelationship.trim() || 'Trusted Contact';

    if (!trimmedName) {
      setTrustedFormError('Please enter the contact name.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setTrustedFormError('Please enter a valid email address.');
      return;
    }

    setIsSubmittingTrusted(true);
    setTrustedFormError(null);

    if (editingContactId) {
      const res = await updateTrustedContact(editingContactId, {
        name: trimmedName,
        email: trimmedEmail,
        relationship: trimmedRel,
        priority: trustedPriority,
      });
      setIsSubmittingTrusted(false);
      if (res.success) {
        setIsTrustedModalOpen(false);
        resetTrustedForm();
      } else {
        setTrustedFormError(res.error || 'Failed to update contact.');
      }
    } else {
      const res = await addTrustedContact({
        name: trimmedName,
        email: trimmedEmail,
        relationship: trimmedRel,
        priority: trustedPriority,
      });
      setIsSubmittingTrusted(false);
      if (res.success) {
        setIsTrustedModalOpen(false);
        resetTrustedForm();
        Alert.alert(
          'Contact Added & Invited',
          `An invitation has been created for ${trimmedName} (${trimmedEmail}). When they sign into WSG-01, they will be connected as your emergency contact.`
        );
      } else {
        setTrustedFormError(res.error || 'Failed to add contact.');
      }
    }
  };

  const handleConfirmDeleteTrusted = async () => {
    if (trustedToDelete) {
      await removeTrustedContact(trustedToDelete.id);
      setTrustedToDelete(null);
    }
  };

  const handleResendInvite = async (c: EmergencyContact) => {
    const res = await resendInvitation(c.id);
    if (res.success) {
      Alert.alert('Invitation Refreshed', `New invite generated for ${c.name}. Token: ${res.token || 'Active'}`);
    } else {
      Alert.alert('Failed to Resend', res.error || 'Please try again later.');
    }
  };

  // --- Phone Direct Dial Handlers ---
  const resetPhoneForm = () => {
    setNewName('');
    setNewPhone('');
    setNewRelationship('Family Member');
    setIsPrimary(contacts.length === 0);
    setFormError(null);
  };

  const handleOpenAddPhone = () => {
    resetPhoneForm();
    setIsPrimary(contacts.length === 0);
    setIsAddModalOpen(true);
  };

  const handleSavePhoneContact = () => {
    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();

    if (!trimmedName) {
      setFormError('Please enter a contact name.');
      return;
    }
    if (!trimmedPhone) {
      setFormError('Please enter a valid phone number.');
      return;
    }

    addContact({
      name: trimmedName,
      phone: trimmedPhone,
      relationship: newRelationship.trim() || 'Emergency Contact',
      isPrimary: isPrimary || contacts.length === 0,
    });

    setIsAddModalOpen(false);
    resetPhoneForm();
  };

  const handleCall = async (phone: string) => {
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const url = `tel:${cleanPhone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        Alert.alert('Dialer Unavailable', `Unable to place call to ${phone}.`);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.open(url, '_self');
      } else {
        Alert.alert('Call Contact', `Please dial: ${phone}`);
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Pending Invitations Received by User Banner */}
      {pendingInvitations.length > 0 && (
        <View style={styles.pendingInvBox}>
          <View style={styles.pendingInvHeader}>
            <Bell size={18} color="#D97706" />
            <Text style={styles.pendingInvTitle}>Pending Invitations for You</Text>
          </View>
          {pendingInvitations.map((inv) => (
            <View key={inv.invitationId} style={styles.pendingInvRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingInvName}>{inv.contactName} ({inv.relationship})</Text>
                <Text style={styles.pendingInvSub}>Invited you as an emergency trusted contact</Text>
              </View>
              <View style={styles.pendingInvActions}>
                <TouchableOpacity
                  style={styles.invAcceptBtn}
                  onPress={async () => {
                    await acceptInvitation(inv.invitationId, inv.contactId);
                    Alert.alert('Accepted', 'You will now receive emergency push alerts for this owner.');
                  }}
                >
                  <Check size={14} color="#FFFFFF" />
                  <Text style={styles.invAcceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.invDeclineBtn}
                  onPress={async () => {
                    await declineInvitation(inv.invitationId);
                  }}
                >
                  <Text style={styles.invDeclineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Mode Segment Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'TRUSTED' && styles.tabButtonActive]}
          onPress={() => setActiveTab('TRUSTED')}
        >
          <Shield size={16} color={activeTab === 'TRUSTED' ? '#FFFFFF' : '#64748B'} />
          <Text style={[styles.tabButtonText, activeTab === 'TRUSTED' && styles.tabButtonTextActive]}>
            Trusted Contacts (App Push)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'DIRECT_DIAL' && styles.tabButtonActive]}
          onPress={() => setActiveTab('DIRECT_DIAL')}
        >
          <Phone size={16} color={activeTab === 'DIRECT_DIAL' ? '#FFFFFF' : '#64748B'} />
          <Text style={[styles.tabButtonText, activeTab === 'DIRECT_DIAL' && styles.tabButtonTextActive]}>
            Direct Dial ({contacts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: TRUSTED CONTACTS (APP PUSH) */}
      {activeTab === 'TRUSTED' && (
        <View>
          <View style={styles.infoBanner}>
            <ShieldAlert size={18} color="#2563EB" style={{ marginTop: 2 }} />
            <Text style={styles.infoBannerText}>
              All emergency communication occurs through the WSG-01 app push system. Contacts must have the
              app installed with their account to receive escalated emergency sirens.
            </Text>
          </View>

          {isTrustedLoading && trustedContacts.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.loadingText}>Loading trusted contacts...</Text>
            </View>
          ) : trustedContacts.length === 0 ? (
            <View style={styles.emptyCard}>
              <ShieldAlert size={42} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Trusted Contacts Added</Text>
              <Text style={styles.emptySubtitle}>
                Add trusted family members or caregivers (e.g. Mother, Father, Guardian, Doctor). If you do not
                acknowledge an alert within the configured timeout, WSG-01 will escalate emergency push notifications to them.
              </Text>
              <TouchableOpacity style={styles.emptyAddButton} onPress={handleOpenAddTrusted}>
                <UserPlus size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddButtonText}>Add Trusted Contact</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.contactsList}>
              {trustedContacts.map((c) => (
                <View key={c.id} style={styles.trustedCard}>
                  <View style={styles.trustedCardHeader}>
                    <View style={styles.trustedAvatar}>
                      <Text style={styles.trustedAvatarText}>{c.name.charAt(0).toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.trustedName}>{c.name}</Text>
                        <View style={styles.priorityBadge}>
                          <Text style={styles.priorityBadgeText}>Priority {c.priority}</Text>
                        </View>
                      </View>
                      <Text style={styles.trustedEmail}>{c.email}</Text>
                      <Text style={styles.trustedRel}>{c.relationship}</Text>
                    </View>

                    {/* Enable / Disable Switch */}
                    <View style={styles.switchWrapper}>
                      <Switch
                        value={c.isEnabled}
                        onValueChange={(val) => {
                          toggleTrustedEnabled(c.id, val);
                        }}
                        trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                        thumbColor={c.isEnabled ? '#2563EB' : '#F4F3F4'}
                      />
                      <Text style={styles.switchCaption}>{c.isEnabled ? 'Enabled' : 'Disabled'}</Text>
                    </View>
                  </View>

                  {/* Status & Action Bar */}
                  <View style={styles.trustedFooter}>
                    <View style={styles.statusRow}>
                      {c.invitationStatus === 'accepted' ? (
                        <View style={styles.statusAcceptedBadge}>
                          <CheckCircle2 size={13} color="#059669" />
                          <Text style={styles.statusAcceptedText}>Active (App Connected)</Text>
                        </View>
                      ) : (
                        <View style={styles.statusPendingBadge}>
                          <Clock size={13} color="#D97706" />
                          <Text style={styles.statusPendingText}>Invitation Pending</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.trustedActions}>
                      {c.invitationStatus !== 'accepted' && (
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => handleResendInvite(c)}
                          accessibilityLabel="Resend invitation"
                        >
                          <RefreshCw size={15} color="#2563EB" />
                          <Text style={styles.actionIconText}>Resend</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleOpenEditTrusted(c)}
                        accessibilityLabel="Edit contact"
                      >
                        <Pencil size={15} color="#475569" />
                        <Text style={styles.actionIconText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => setTrustedToDelete(c)}
                        accessibilityLabel="Remove contact"
                      >
                        <Trash2 size={15} color="#EF4444" />
                        <Text style={[styles.actionIconText, { color: '#EF4444' }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.addButton} onPress={handleOpenAddTrusted}>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Another Trusted Contact</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* TAB 2: DIRECT PHONE QUICK DIAL (LEGACY COMPATIBILITY) */}
      {activeTab === 'DIRECT_DIAL' && (
        <View>
          <Text style={styles.subtitle}>Direct phone numbers for quick manual calling during emergencies.</Text>

          {contacts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Phone size={40} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Phone Numbers</Text>
              <Text style={styles.emptySubtitle}>
                Add phone contacts to enable 1-tap phone calls directly from the emergency alarm screen.
              </Text>
              <TouchableOpacity style={styles.emptyAddButton} onPress={handleOpenAddPhone}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddButtonText}>Add Phone Contact</Text>
              </TouchableOpacity>
            </View>
          ) : (
            contacts.map((contact) => (
              <View key={contact.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.avatar, contact.isPrimary && styles.avatarPrimary]}>
                    <Text style={styles.avatarText}>{contact.name.charAt(0).toUpperCase() || '?'}</Text>
                  </View>
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{contact.name}</Text>
                      {contact.isPrimary && (
                        <View style={styles.primaryBadge}>
                          <Star size={11} color="#92400E" fill="#92400E" />
                          <Text style={styles.primaryText}>PRIMARY</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.phone}>{contact.phone}</Text>
                    <Text style={styles.relationship}>{contact.relationship}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {!contact.isPrimary && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setPrimaryContact(contact.id)}
                    >
                      <Star size={16} color={colors.warning} />
                      <Text style={styles.actionText}>Set Primary</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleCall(contact.phone)}
                  >
                    <Phone size={16} color={colors.info} />
                    <Text style={[styles.actionText, { color: colors.info }]}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setContactToDelete(contact)}
                  >
                    <Trash2 size={16} color={colors.emergency} />
                    <Text style={[styles.actionText, { color: colors.emergency }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.addButton} onPress={handleOpenAddPhone}>
            <Plus size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Phone Contact</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODAL: ADD / EDIT TRUSTED CONTACT */}
      <Modal
        visible={isTrustedModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsTrustedModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Shield size={22} color="#2563EB" />
                <Text style={styles.modalTitle}>
                  {editingContactId ? 'Edit Trusted Contact' : 'Add Trusted Contact'}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setIsTrustedModalOpen(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Trusted contacts receive high-priority WSG-01 push notifications with siren sounds when an emergency
              escalates.
            </Text>

            {trustedFormError && (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color="#B91C1C" />
                <Text style={styles.errorBannerText}>{trustedFormError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Eleanor Vance"
                placeholderTextColor="#9CA3AF"
                value={trustedName}
                onChangeText={(t) => {
                  setTrustedName(t);
                  if (trustedFormError) setTrustedFormError(null);
                }}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address (for WSG-01 App Push) *</Text>
              <TextInput
                style={styles.input}
                placeholder="contact@example.com"
                placeholderTextColor="#9CA3AF"
                value={trustedEmail}
                onChangeText={(t) => {
                  setTrustedEmail(t);
                  if (trustedFormError) setTrustedFormError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.presetChips}>
                {RELATIONSHIP_PRESETS.map((preset) => {
                  const isSelected = trustedRelationship === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                      onPress={() => setTrustedRelationship(preset)}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                placeholder="Or custom (e.g. Caregiver, Specialist)"
                placeholderTextColor="#9CA3AF"
                value={trustedRelationship}
                onChangeText={setTrustedRelationship}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Escalation Priority</Text>
              <View style={styles.priorityRow}>
                {[1, 2, 3].map((p) => {
                  const isSel = trustedPriority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityChip, isSel && styles.priorityChipSelected]}
                      onPress={() => setTrustedPriority(p)}
                    >
                      <Text style={[styles.priorityChipText, isSel && styles.priorityChipTextSelected]}>
                        Priority {p} {p === 1 ? '(First)' : p === 2 ? '(Second)' : '(Third)'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsTrustedModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSubmittingTrusted && { opacity: 0.6 }]}
                onPress={handleSaveTrustedContact}
                disabled={isSubmittingTrusted}
              >
                {isSubmittingTrusted ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingContactId ? 'Save Changes' : 'Send Invite'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL (TRUSTED) */}
      <Modal
        visible={!!trustedToDelete}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setTrustedToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 380 }]}>
            <View style={styles.deleteHeader}>
              <View style={styles.deleteIconCircle}>
                <Trash2 size={24} color="#EF4444" />
              </View>
              <Text style={styles.deleteTitle}>Revoke Trusted Contact</Text>
              <Text style={styles.deleteDescription}>
                Are you sure you want to revoke emergency alert access for{' '}
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                  {trustedToDelete?.name}
                </Text>{' '}
                ({trustedToDelete?.email})? They will no longer receive emergency push alerts.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setTrustedToDelete(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteButton} onPress={handleConfirmDeleteTrusted}>
                <Text style={styles.confirmDeleteButtonText}>Yes, Revoke</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DIRECT PHONE ADD MODAL */}
      <Modal
        visible={isAddModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <UserPlus size={22} color={colors.primary} />
                <Text style={styles.modalTitle}>Add Phone Contact</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setIsAddModalOpen(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {formError && (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color="#B91C1C" />
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Jane Doe"
                placeholderTextColor="#9CA3AF"
                value={newName}
                onChangeText={(t) => {
                  setNewName(t);
                  if (formError) setFormError(null);
                }}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +1 555-0199"
                placeholderTextColor="#9CA3AF"
                value={newPhone}
                onChangeText={(t) => {
                  setNewPhone(t);
                  if (formError) setFormError(null);
                }}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsAddModalOpen(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSavePhoneContact}>
                <Text style={styles.saveButtonText}>Save Phone</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  subtitle: { ...typography.body2, color: colors.textSecondary, marginBottom: spacing.md },

  // Tab Switcher
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.md - 2,
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },

  // Pending Invitations
  pendingInvBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pendingInvHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pendingInvTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  pendingInvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    gap: 10,
  },
  pendingInvName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
  },
  pendingInvSub: {
    fontSize: 12,
    color: '#92400E',
  },
  pendingInvActions: {
    flexDirection: 'row',
    gap: 6,
  },
  invAcceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  invAcceptBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  invDeclineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  invDeclineBtnText: {
    color: '#92400E',
    fontWeight: '600',
    fontSize: 12,
  },

  // Info Banner
  infoBanner: {
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
  infoBannerText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },

  // Trusted Contact Card
  contactsList: {
    gap: spacing.sm,
  },
  trustedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.xs,
  },
  trustedCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  trustedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  trustedAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  trustedName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  priorityBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3730A3',
  },
  trustedEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  trustedRel: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 1,
  },
  switchWrapper: {
    alignItems: 'center',
  },
  switchCaption: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  trustedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 10,
    paddingTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusAcceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusAcceptedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  statusPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  trustedActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionIconText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  // Priority Chips
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  priorityChipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  priorityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  priorityChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Legacy Phone Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarPrimary: {
    backgroundColor: '#0284C7',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  avatarText: { ...typography.h3, color: colors.surface, fontWeight: '700' },
  info: { flex: 1 },
  name: { ...typography.body1, color: colors.textPrimary, fontWeight: '700' },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  primaryText: { fontSize: 10, color: '#92400E', fontWeight: '800' },
  phone: { ...typography.body2, color: colors.textSecondary, marginBottom: 2 },
  relationship: { ...typography.caption, color: colors.textSecondary },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  actionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  addButtonText: { ...typography.body1, color: '#FFFFFF', fontWeight: '700' },

  loadingBox: { padding: 30, alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#64748B' },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 380,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 9999,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 440,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  closeBtn: {
    padding: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  presetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  presetChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  presetChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Delete modal
  deleteHeader: { alignItems: 'center', marginBottom: spacing.lg },
  deleteIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  deleteTitle: { fontSize: 18, color: colors.textPrimary, fontWeight: '800', marginBottom: 6 },
  deleteDescription: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  confirmDeleteButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  confirmDeleteButtonText: { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },
});
