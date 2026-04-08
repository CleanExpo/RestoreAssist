import { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, input, shadows } from "@/constants/theme";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api/client";

interface FormField {
  value: string;
  error: string | null;
  focused: boolean;
}

export default function NewInspectionScreen() {
  const router = useRouter();
  const { triggerRefresh } = useAppStore();

  const [address, setAddress] = useState<FormField>({
    value: "",
    error: null,
    focused: false,
  });
  const [postcode, setPostcode] = useState<FormField>({
    value: "",
    error: null,
    focused: false,
  });
  const [technician, setTechnician] = useState<FormField>({
    value: "",
    error: null,
    focused: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;

    if (!address.value.trim()) {
      setAddress((f) => ({ ...f, error: "Required" }));
      valid = false;
    }
    if (!postcode.value.trim()) {
      setPostcode((f) => ({ ...f, error: "Required" }));
      valid = false;
    } else if (!/^\d{4}$/.test(postcode.value.trim())) {
      setPostcode((f) => ({ ...f, error: "Enter a valid 4-digit postcode" }));
      valid = false;
    }

    return valid;
  }

  async function handleCreate() {
    if (!validate()) return;

    setSubmitting(true);
    setApiError(null);

    try {
      const { inspection } = await api.inspections.create({
        propertyAddress: address.value.trim(),
        propertyPostcode: postcode.value.trim(),
        technicianName: technician.value.trim() || undefined,
      });

      triggerRefresh();
      router.replace(`/(tabs)/inspections/${inspection.id}`);
    } catch (err: any) {
      setApiError(err.message ?? "Failed to create inspection");
    } finally {
      setSubmitting(false);
    }
  }

  function inputStyle(field: FormField) {
    return [
      styles.input,
      field.focused && styles.inputFocused,
      !!field.error && styles.inputError,
    ];
  }

  function labelStyle(field: FormField, required = false) {
    return [
      styles.label,
      field.focused && styles.labelFocused,
      !!field.error && styles.labelError,
    ];
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Context header */}
        <View style={[styles.contextCard, shadows.card]}>
          <View style={styles.contextIconWrap}>
            <Ionicons name="location" size={22} color={colors.accent} />
          </View>
          <View style={styles.contextText}>
            <Text style={styles.contextTitle}>New Field Inspection</Text>
            <Text style={styles.contextSubtitle}>
              Enter the property details to begin
            </Text>
          </View>
        </View>

        {/* Form fields */}
        <View style={styles.fieldGroup}>
          <Text style={labelStyle(address, true)}>
            Property Address <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={inputStyle(address)}
            value={address.value}
            onChangeText={(text) =>
              setAddress((f) => ({ ...f, value: text, error: null }))
            }
            onFocus={() => setAddress((f) => ({ ...f, focused: true }))}
            onBlur={() => setAddress((f) => ({ ...f, focused: false }))}
            placeholder="e.g. 42 Wallaby Way, Sydney NSW"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="next"
          />
          {address.error ? (
            <Text style={styles.errorText}>{address.error}</Text>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={labelStyle(postcode, true)}>
            Postcode <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={inputStyle(postcode)}
            value={postcode.value}
            onChangeText={(text) => {
              const cleaned = text.replace(/\D/g, "").slice(0, 4);
              setPostcode((f) => ({ ...f, value: cleaned, error: null }));
            }}
            onFocus={() => setPostcode((f) => ({ ...f, focused: true }))}
            onBlur={() => setPostcode((f) => ({ ...f, focused: false }))}
            placeholder="e.g. 2000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            maxLength={4}
            returnKeyType="next"
          />
          {postcode.error ? (
            <Text style={styles.errorText}>{postcode.error}</Text>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={labelStyle(technician)}>Technician Name</Text>
          <TextInput
            style={inputStyle(technician)}
            value={technician.value}
            onChangeText={(text) =>
              setTechnician((f) => ({ ...f, value: text }))
            }
            onFocus={() => setTechnician((f) => ({ ...f, focused: true }))}
            onBlur={() => setTechnician((f) => ({ ...f, focused: false }))}
            placeholder="Optional"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>

        {apiError ? (
          <View style={styles.apiErrorBox}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.error}
            />
            <Text style={styles.apiErrorText}>{apiError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.createBtn, submitting && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color={colors.bg} />
              <Text style={styles.createBtnText}>Create Inspection</Text>
            </>
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
    paddingBottom: 80,
  },
  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  contextIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  contextText: {
    flex: 1,
  },
  contextTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  contextSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 11,
    color: colors.label,
    marginBottom: 6,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  labelFocused: {
    color: colors.accent,
  },
  labelError: {
    color: colors.error,
  },
  required: {
    color: colors.error,
  },
  input: {
    height: input.height,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: input.borderRadius,
    paddingHorizontal: input.paddingHorizontal,
    fontSize: input.fontSize,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorDim,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 5,
    fontWeight: "600",
  },
  apiErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.errorDim,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error + "40",
  },
  apiErrorText: {
    color: colors.error,
    fontSize: 14,
    flex: 1,
    fontWeight: "600",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 58,
    backgroundColor: colors.accent,
    borderRadius: 14,
    marginTop: spacing.sm,
  },
  createBtnDisabled: {
    opacity: 0.55,
  },
  createBtnText: {
    color: colors.bg,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
