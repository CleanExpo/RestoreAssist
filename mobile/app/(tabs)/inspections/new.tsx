import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, input } from '@/constants/theme';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/api/client';

export default function NewInspectionScreen() {
  const router = useRouter();
  const { triggerRefresh } = useAppStore();

  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyPostcode, setPropertyPostcode] = useState('');
  const [technicianName, setTechnicianName] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!propertyAddress.trim()) {
      newErrors.propertyAddress = 'Property address is required';
    }

    if (!propertyPostcode.trim()) {
      newErrors.propertyPostcode = 'Postcode is required';
    } else if (!/^\d{4}$/.test(propertyPostcode.trim())) {
      newErrors.propertyPostcode = 'Enter a valid 4-digit Australian postcode';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setApiError(null);

    try {
      const { inspection } = await api.inspections.create({
        propertyAddress: propertyAddress.trim(),
        propertyPostcode: propertyPostcode.trim(),
        technicianName: technicianName.trim() || undefined,
      });

      triggerRefresh();
      router.replace(`/(tabs)/inspections/${inspection.id}`);
    } catch (err: any) {
      setApiError(err.message ?? 'Failed to create inspection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Property Address */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Property Address *</Text>
          <TextInput
            style={[
              styles.input,
              errors.propertyAddress ? styles.inputError : null,
            ]}
            value={propertyAddress}
            onChangeText={(text) => {
              setPropertyAddress(text);
              if (errors.propertyAddress) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.propertyAddress;
                  return next;
                });
              }
            }}
            placeholder="e.g. 42 Wallaby Way, Sydney"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="next"
          />
          {errors.propertyAddress ? (
            <Text style={styles.errorText}>{errors.propertyAddress}</Text>
          ) : null}
        </View>

        {/* Property Postcode */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Property Postcode *</Text>
          <TextInput
            style={[
              styles.input,
              errors.propertyPostcode ? styles.inputError : null,
            ]}
            value={propertyPostcode}
            onChangeText={(text) => {
              // Only allow digits, max 4 chars
              const cleaned = text.replace(/\D/g, '').slice(0, 4);
              setPropertyPostcode(cleaned);
              if (errors.propertyPostcode) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.propertyPostcode;
                  return next;
                });
              }
            }}
            placeholder="e.g. 2000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            maxLength={4}
            returnKeyType="next"
          />
          {errors.propertyPostcode ? (
            <Text style={styles.errorText}>{errors.propertyPostcode}</Text>
          ) : null}
        </View>

        {/* Technician Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Technician Name</Text>
          <TextInput
            style={styles.input}
            value={technicianName}
            onChangeText={setTechnicianName}
            placeholder="Optional"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>

        {/* API Error */}
        {apiError ? (
          <View style={styles.apiErrorContainer}>
            <Text style={styles.apiErrorText}>{apiError}</Text>
          </View>
        ) : null}

        {/* Create Button */}
        <TouchableOpacity
          style={[
            styles.createButton,
            submitting ? styles.createButtonDisabled : null,
          ]}
          onPress={handleCreate}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Text style={styles.createButtonText}>Create Inspection</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    height: input.height,
    backgroundColor: colors.card,
    borderRadius: input.borderRadius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: input.paddingHorizontal,
    fontSize: input.fontSize,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.error,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  apiErrorContainer: {
    backgroundColor: colors.error + '18',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error + '44',
  },
  apiErrorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  createButton: {
    height: input.height,
    backgroundColor: colors.accent,
    borderRadius: input.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.bg,
    fontSize: 17,
    fontWeight: '700',
  },
});
