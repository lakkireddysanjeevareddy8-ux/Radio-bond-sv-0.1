import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { Phone, Plus, Trash2, Star } from 'lucide-react-native';

interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

const INITIAL_CONTACTS: Contact[] = [
  { id: '1', name: 'Jane Doe', phone: '+1 555-0101', relationship: 'Family Member', isPrimary: true },
  { id: '2', name: 'John Smith', phone: '+1 555-0102', relationship: 'Caregiver', isPrimary: false },
];

export const ContactsScreen: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);

  const handleDelete = (id: string) => {
    Alert.alert('Remove Contact', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setContacts(c => c.filter(x => x.id !== id)) },
    ]);
  };

  const setPrimary = (id: string) => {
    setContacts(c => c.map(x => ({ ...x, isPrimary: x.id === id })));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>These contacts will be notified in an emergency.</Text>

      {contacts.map((contact) => (
        <View key={contact.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{contact.name.charAt(0)}</Text>
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{contact.name}</Text>
                {contact.isPrimary && (
                  <View style={styles.primaryBadge}>
                    <Star size={10} color="#92400E" fill="#92400E" />
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
              <TouchableOpacity style={styles.actionBtn} onPress={() => setPrimary(contact.id)}>
                <Star size={16} color={colors.warning} />
                <Text style={styles.actionText}>Set Primary</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn}>
              <Phone size={16} color={colors.info} />
              <Text style={[styles.actionText, { color: colors.info }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(contact.id)}>
              <Trash2 size={16} color={colors.emergency} />
              <Text style={[styles.actionText, { color: colors.emergency }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addButton}>
        <Plus size={20} color={colors.surface} />
        <Text style={styles.addButtonText}>Add Emergency Contact</Text>
      </TouchableOpacity>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          ⚠️ Emergency services (911/999) are NOT automatically contacted. Please configure trusted contacts above.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  subtitle: { ...typography.body2, color: colors.textSecondary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  avatarText: { ...typography.h3, color: colors.surface },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  name: { ...typography.body1, color: colors.textPrimary, fontWeight: '700', marginRight: spacing.sm },
  primaryBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.full, gap: 3,
  },
  primaryText: { fontSize: 10, color: '#92400E', fontWeight: '700' },
  phone: { ...typography.body2, color: colors.textSecondary, marginBottom: 2 },
  relationship: { ...typography.caption, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, padding: spacing.md, borderRadius: borderRadius.lg,
    marginVertical: spacing.md, gap: spacing.sm,
  },
  addButtonText: { ...typography.body1, color: colors.surface, fontWeight: '700' },
  notice: {
    backgroundColor: '#FFFBEB', padding: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  noticeText: { ...typography.body2, color: '#92400E' },
});
