import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import { storage } from '../utils/storage';
import { EmergencyFeedbackStatus } from '../types';
import { colors, spacing, borderRadius } from '../utils/theme';
import { ShieldCheck, AlertCircle, HelpCircle, Check, X } from 'lucide-react-native';

interface FalseAlarmFeedbackModalProps {
  visible: boolean;
  eventId: string;
  deviceId: string;
  onDismiss: () => void;
  onSubmitComplete?: (status: EmergencyFeedbackStatus) => void;
}

export const FalseAlarmFeedbackModal: React.FC<FalseAlarmFeedbackModalProps> = ({
  visible,
  eventId,
  deviceId,
  onDismiss,
  onSubmitComplete,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<EmergencyFeedbackStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (statusOverride?: EmergencyFeedbackStatus) => {
    const status = statusOverride || selectedStatus;
    if (!status) return;

    setSubmitting(true);
    const submittedAt = new Date().toISOString();

    try {
      // 1. Update Supabase emergency record
      await supabase
        .from('emergencies')
        .update({
          feedback_status: status,
          feedback_notes: notes.trim() || null,
          feedback_submitted_at: submittedAt,
        })
        .or(`id.eq.${eventId},event_time.not.is.null`);

      // 2. Update local feedback stats for threshold tuning recommendations
      const feedbackKey = `wsg_feedback_${deviceId}`;
      const existing = await storage.getJSON<any[]>(feedbackKey, []);
      const updated = [{ eventId, deviceId, status, submittedAt, notes }, ...existing].slice(0, 50);
      await storage.setJSON(feedbackKey, updated);
    } catch (e) {
      console.warn('[FeedbackModal] Error saving feedback:', e);
    } finally {
      setSubmitting(false);
      if (onSubmitComplete) onSubmitComplete(status);
      onDismiss();
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <ShieldCheck size={24} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Incident Follow-up</Text>
              <Text style={styles.subtitle}>Help improve WSG-01 safety accuracy</Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.question}>Was this a real emergency?</Text>

          {/* 3 Feedback Choices */}
          <View style={styles.optionsList}>
            {/* Choice 1: Real Emergency */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selectedStatus === 'CONFIRMED_REAL' && styles.optionCardSelectedRed,
              ]}
              onPress={() => setSelectedStatus('CONFIRMED_REAL')}
              activeOpacity={0.8}
            >
              <View style={[styles.optionDot, { backgroundColor: '#DC2626' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Yes, Real Emergency</Text>
                <Text style={styles.optionSubtitle}>The occupant needed urgent help or assistance.</Text>
              </View>
              {selectedStatus === 'CONFIRMED_REAL' && <Check size={18} color="#DC2626" />}
            </TouchableOpacity>

            {/* Choice 2: False Alarm */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selectedStatus === 'FALSE_ALARM' && styles.optionCardSelectedAmber,
              ]}
              onPress={() => setSelectedStatus('FALSE_ALARM')}
              activeOpacity={0.8}
            >
              <View style={[styles.optionDot, { backgroundColor: '#D97706' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>False Alarm</Text>
                <Text style={styles.optionSubtitle}>Occupant was fine (e.g. resting or sitting still).</Text>
              </View>
              {selectedStatus === 'FALSE_ALARM' && <Check size={18} color="#D97706" />}
            </TouchableOpacity>

            {/* Choice 3: Test / Not Sure */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                selectedStatus === 'NOT_SURE' && styles.optionCardSelectedBlue,
              ]}
              onPress={() => setSelectedStatus('NOT_SURE')}
              activeOpacity={0.8}
            >
              <View style={[styles.optionDot, { backgroundColor: '#2563EB' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Drill / Not Sure</Text>
                <Text style={styles.optionSubtitle}>Routine system test or unconfirmed response.</Text>
              </View>
              {selectedStatus === 'NOT_SURE' && <Check size={18} color="#2563EB" />}
            </TouchableOpacity>
          </View>

          {/* Optional notes */}
          <TextInput
            style={styles.notesInput}
            placeholder="Optional notes (e.g. Grandma sat reading for 40s)"
            placeholderTextColor="#94A3B8"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, !selectedStatus && styles.submitBtnDisabled]}
              onPress={() => handleSubmit()}
              disabled={!selectedStatus || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Feedback</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  closeBtn: {
    padding: 6,
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: spacing.sm,
  },
  optionsList: {
    gap: 8,
    marginBottom: spacing.md,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: borderRadius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  optionCardSelectedRed: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  optionCardSelectedAmber: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  optionCardSelectedBlue: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  optionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
