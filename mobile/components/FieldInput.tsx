import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, spacing, input } from "@/constants/theme";

interface FieldInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  error?: string;
  editable?: boolean;
  multiline?: boolean;
}

export default function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  error,
  editable = true,
  multiline = false,
}: FieldInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.label,
          focused && styles.labelFocused,
          !editable && styles.labelReadOnly,
          !!error && styles.labelError,
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          !editable && styles.inputReadOnly,
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
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
  labelReadOnly: {
    color: colors.textSecondary,
  },
  labelError: {
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
  inputReadOnly: {
    borderStyle: "dashed",
    borderColor: colors.border,
    opacity: 0.6,
  },
  multiline: {
    height: 96,
    paddingTop: spacing.sm,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 5,
    fontWeight: "600",
  },
});
