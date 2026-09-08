import React, { useState } from 'react';
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
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { Phone, Plus, Trash2, Star, X, UserPlus, AlertCircle, ShieldAlert } from 'lucide-react-native';
import { useContactStore } from '../store/useContactStore';
import { Contact } from '../types';

const RELATIONSHIP_PRESETS = [
  'Family Member',
  'Caregiver',
  'Doctor',
  'Neighbor',
  'Friend',
];

export const ContactsScreen: React.FC = () => {
  const { contacts, addContact, removeContact, setPrimaryContact } = useContactStore();

  // Add Contact Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelationship, setNewRelationship] = useState('Family Member');
  const [isPrimary, setIsPrimary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  const resetForm = () => {
    setNewName('');
    setNewPhone('');
    setNewRelationship('Family Member');
    setIsPrimary(contacts.length === 0);
    setFormError(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsPrimary(contacts.length === 0);
    setIsAddModalOpen(true);
  };

  const handleSaveContact = () => {
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
    resetForm();
  };

  const handlePromptDelete = (contact: Contact) => {
    // Open in-app delete confirmation modal which works reliably on both Web and Mobile
    setContactToDelete(contact);
  };

  const handleConfirmDelete = () => {
    if (contactToDelete) {
      removeContact(contactToDelete.id);
      setContactToDelete(null);
    }
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
      // In web browsers without dialer integration:
      if (Platform.OS === 'web') {
        window.open(url, '_self');
      } else {
        Alert.alert('Call Contact', `Please dial: ${phone}`);
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>These contacts will be notified in an emergency.</Text>

      {contacts.length === 0 ? (
        <View style={styles.emptyCard}>
          <ShieldAlert size={42} color={colors.warning} />
          <Text style={styles.emptyTitle}>No Emergency Contacts</Text>
          <Text style={styles.emptySubtitle}>
            Add at least one trusted contact (caregiver, family, or neighbor) to receive immediate alerts if an incident is detected.
          </Text>
          <TouchableOpacity style={styles.emptyAddButton} onPress={handleOpenAddModal}>
            <UserPlus size={18} color={colors.surface} />
            <Text style={styles.emptyAddButtonText}>Add First Contact</Text>
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
                  accessibilityLabel={`Set ${contact.name} as primary contact`}
                >
                  <Star size={16} color={colors.warning} />
                  <Text style={styles.actionText}>Set Primary</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleCall(contact.phone)}
                accessibilityLabel={`Call ${contact.name}`}
              >
                <Phone size={16} color={colors.info} />
                <Text style={[styles.actionText, { color: colors.info }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handlePromptDelete(contact)}
                accessibilityLabel={`Remove ${contact.name}`}
              >
                <Trash2 size={16} color={colors.emergency} />
                <Text style={[styles.actionText, { color: colors.emergency }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={handleOpenAddModal}
        accessibilityRole="button"
        accessibilityLabel="Add Emergency Contact"
      >
        <Plus size={20} color={colors.surface} />
        <Text style={styles.addButtonText}>Add Emergency Contact</Text>
      </TouchableOpacity>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          ⚠️ Emergency services (911/999) are NOT automatically contacted. Please configure trusted contacts above.
        </Text>
      </View>

      {/* ADD CONTACT MODAL */}
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
                <Text style={styles.modalTitle}>Add Emergency Contact</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsAddModalOpen(false)}
                accessibilityLabel="Close modal"
              >
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
                onChangeText={(text) => {
                  setNewName(text);
                  if (formError) setFormError(null);
                }}
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. +1 555-0199"
                placeholderTextColor="#9CA3AF"
                value={newPhone}
                onChangeText={(text) => {
                  setNewPhone(text);
                  if (formError) setFormError(null);
                }}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.presetChips}>
                {RELATIONSHIP_PRESETS.map((preset) => {
                  const isSelected = newRelationship === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                      onPress={() => setNewRelationship(preset)}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="Or custom relationship (e.g. Sister, Doctor)"
                placeholderTextColor="#9CA3AF"
                value={newRelationship}
                onChangeText={setNewRelationship}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Set as Primary Contact</Text>
                <Text style={styles.switchSubLabel}>
                  Primary contact will be alerted first during emergencies
                </Text>
              </View>
              <Switch
                value={isPrimary}
                onValueChange={setIsPrimary}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={isPrimary ? colors.primary : '#F4F3F4'}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsAddModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveContact}
              >
                <Text style={styles.saveButtonText}>Save Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        visible={!!contactToDelete}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setContactToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 380 }]}>
            <View style={styles.deleteHeader}>
              <View style={styles.deleteIconCircle}>
                <Trash2 size={24} color={colors.emergency} />
              </View>
              <Text style={styles.deleteTitle}>Remove Contact</Text>
              <Text style={styles.deleteDescription}>
                Are you sure you want to remove{' '}
                <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                  {contactToDelete?.name}
                </Text>{' '}
                ({contactToDelete?.phone}) from your emergency contacts?
              </Text>
              {contactToDelete?.isPrimary && contacts.length > 1 && (
                <Text style={styles.deleteWarning}>
                  Notice: This is currently your primary contact. Another contact will be promoted to primary.
                </Text>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setContactToDelete(null)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={handleConfirmDelete}
              >
                <Text style={styles.confirmDeleteButtonText}>Yes, Remove</Text>
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
  subtitle: { ...typography.body2, color: colors.textSecondary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap', gap: 6 },
  name: { ...typography.body1, color: colors.textPrimary, fontWeight: '700' },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  primaryText: { fontSize: 10, color: '#92400E', fontWeight: '800', letterSpacing: 0.5 },
  phone: { ...typography.body2, color: colors.textSecondary, marginBottom: 2, fontWeight: '500' },
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
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: { ...typography.body1, color: colors.surface, fontWeight: '700' },

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
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyAddButtonText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },

  notice: {
    backgroundColor: '#FFFBEB',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noticeText: { ...typography.body2, color: '#92400E', lineHeight: 20 },

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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    borderRadius: borderRadius.full,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  errorBannerText: {
    ...typography.caption,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  presetChipTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  switchSubLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    paddingRight: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...typography.body2,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    ...typography.body2,
    color: colors.surface,
    fontWeight: '700',
  },

  // Delete Modal Styles
  deleteHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  deleteIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  deleteTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  deleteDescription: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteWarning: {
    ...typography.caption,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  confirmDeleteButton: {
    backgroundColor: colors.emergency,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  confirmDeleteButtonText: {
    ...typography.body2,
    color: colors.surface,
    fontWeight: '700',
  },
});
