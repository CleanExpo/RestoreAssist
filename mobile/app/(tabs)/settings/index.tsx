import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useAuthStore } from '@/lib/store/auth-store';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { ALLOWED_MODELS, getProviderDisplayName, getModelDisplayName, PROVIDER_AUTH } from '@/constants/byok';
import type { Provider, AllowedModel } from '@/shared/types';

export default function SettingsScreen() {
  const { user, byokConfig, setBYOKConfig, signOut } = useAuthStore();
  const [selectedProvider, setSelectedProvider] = useState<Provider>(byokConfig?.provider || 'anthropic');
  const [selectedModel, setSelectedModel] = useState<AllowedModel>(byokConfig?.model || 'claude-opus-4-6');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }
    setSaving(true);
    const { error } = await setBYOKConfig(selectedProvider, selectedModel, apiKey.trim());
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setApiKey('');
      Alert.alert('Success', `${getProviderDisplayName(selectedProvider)} key saved securely`);
    }
  };
  return (
    <ScrollView style={styles.container}>
      {/* User Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Name</Text>
          <Text style={styles.cardValue}>{user?.name || 'Not set'}</Text>
          <Text style={styles.cardLabel}>Email</Text>
          <Text style={styles.cardValue}>{user?.email || 'Not set'}</Text>
          <Text style={styles.cardLabel}>Role</Text>
          <Text style={styles.cardValue}>{user?.role || 'USER'}</Text>
        </View>
      </View>

      {/* BYOK Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Configuration (BYOK)</Text>
        <Text style={styles.sectionSubtitle}>
          Bring Your Own Key — select your provider and enter your API key
        </Text>

        {/* Current Config */}
        {byokConfig && (
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: Colors.light.success }]}>
            <Text style={styles.cardLabel}>Active Provider</Text>
            <Text style={styles.cardValue}>{getProviderDisplayName(byokConfig.provider)}</Text>
            <Text style={styles.cardLabel}>Active Model</Text>
            <Text style={styles.cardValue}>{getModelDisplayName(byokConfig.model)}</Text>
            <Text style={[styles.cardLabel, { color: Colors.light.success }]}>Key stored securely on device</Text>
          </View>
        )}

        {/* Provider Selection */}
        <Text style={styles.fieldLabel}>Provider</Text>
        <View style={styles.providerRow}>
          {(Object.keys(ALLOWED_MODELS) as Provider[]).map((provider) => (
            <TouchableOpacity
              key={provider}
              style={[styles.providerChip, selectedProvider === provider && styles.providerChipActive]}
              onPress={() => {
                setSelectedProvider(provider);
                setSelectedModel(ALLOWED_MODELS[provider][0]);
              }}
            >
              <Text style={[styles.providerChipText, selectedProvider === provider && styles.providerChipTextActive]}>
                {getProviderDisplayName(provider)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Model Selection */}
        <Text style={styles.fieldLabel}>Model</Text>
        <View style={styles.providerRow}>
          {ALLOWED_MODELS[selectedProvider].map((model) => (
            <TouchableOpacity
              key={model}
              style={[styles.providerChip, selectedModel === model && styles.providerChipActive]}
              onPress={() => setSelectedModel(model as AllowedModel)}
            >
              <Text style={[styles.providerChipText, selectedModel === model && styles.providerChipTextActive]}>
                {getModelDisplayName(model as AllowedModel)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* API Key Input */}
        <Text style={styles.fieldLabel}>API Key</Text>
        <TextInput
          style={styles.input}
          placeholder={`Enter your ${getProviderDisplayName(selectedProvider)} API key`}
          placeholderTextColor={Colors.light.textMuted}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={handleSaveKey}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save API Key'}</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.surface },
  section: { padding: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.light.text },
  sectionSubtitle: { fontSize: FontSize.sm, color: Colors.light.textSecondary, marginTop: Spacing.xs, marginBottom: Spacing.md },
  card: { backgroundColor: Colors.light.background, padding: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  cardLabel: { fontSize: FontSize.xs, color: Colors.light.textMuted, marginTop: Spacing.sm },
  cardValue: { fontSize: FontSize.md, color: Colors.light.text, fontWeight: '500' },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.light.text, marginTop: Spacing.md, marginBottom: Spacing.sm },
  providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  providerChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.background },
  providerChipActive: { borderColor: Colors.light.accent, backgroundColor: Colors.light.accent + '15' },
  providerChipText: { fontSize: FontSize.sm, color: Colors.light.textSecondary },
  providerChipTextActive: { color: Colors.light.accent, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, color: Colors.light.text, backgroundColor: Colors.light.background },
  saveButton: { backgroundColor: Colors.light.accent, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
  saveButtonText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '700' },
  signOutButton: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, paddingVertical: 14, alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.light.danger },
  signOutText: { color: Colors.light.danger, fontSize: FontSize.md, fontWeight: '600' },
});