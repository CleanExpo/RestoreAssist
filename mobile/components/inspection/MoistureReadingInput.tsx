import React, { useState, useCallback } from 'react';
import {
  View,
  ViewProps,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { MaterialType, MoistureReading } from '@/shared/types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

type MeterBrand = 'Tramex' | 'Protimeter' | 'Delmhorst' | 'Other';
type DepthIndicator = 'surface' | 'subsurface';

interface MoistureReadingInputProps extends ViewProps {
  onReadingComplete?: (reading: MoistureReading) => void;
  inspectionId: string;
  initialValue?: Partial<MoistureReading>;
}

const MATERIAL_TYPES: { label: string; value: MaterialType }[] = [
  { label: 'Drywall', value: 'drywall' },
  { label: 'Wood Structural', value: 'wood_structural' },
  { label: 'Wood Flooring', value: 'wood_flooring' },
  { label: 'Concrete', value: 'concrete' },
  { label: 'Carpet', value: 'carpet' },
  { label: 'Insulation', value: 'insulation' },
  { label: 'Tile', value: 'tile' },
  { label: 'Other', value: 'other' },
];

const METER_BRANDS: MeterBrand[] = ['Tramex', 'Protimeter', 'Delmhorst', 'Other'];

const getColorForReading = (reading: number): string => {
  if (reading <= 15) return Colors.light.success; // Green
  if (reading <= 25) return '#F59E0B'; // Yellow/Amber
  if (reading <= 40) return '#FF6B35'; // Orange
  return Colors.light.danger; // Red
};

const getSeverityLabel = (reading: number): string => {
  if (reading <= 15) return 'Dry';
  if (reading <= 25) return 'Elevated';
  if (reading <= 40) return 'Wet';
  return 'Saturated';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: Spacing.sm,
  },
  readingDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.light.surface,
    borderRadius: BorderRadius.lg,
  },
  readingValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  severityLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  adjustButtonGroup: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  adjustButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.light.text,
  },
  dropdownButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  dropdownButtonText: {
    fontSize: FontSize.md,
    color: Colors.light.text,
  },
  depthToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  depthToggleButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
  },
  depthToggleButtonActive: {
    backgroundColor: Colors.light.accent,
    borderColor: Colors.light.accent,
  },
  depthToggleButtonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
  },
  depthToggleButtonTextActive: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.light.text,
  },
  modalItem: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: FontSize.md,
    color: Colors.light.text,
  },
});export const MoistureReadingInput = React.forwardRef<
  View,
  MoistureReadingInputProps
>(
  (
    {
      onReadingComplete,
      inspectionId,
      initialValue,
      style,
      ...viewProps
    },
    ref
  ) => {
    const [reading, setReading] = useState<number>(
      initialValue?.reading || 0
    );
    const [material, setMaterial] = useState<MaterialType>(
      initialValue?.material || 'drywall'
    );
    const [location, setLocation] = useState<string>(
      initialValue?.location || ''
    );
    const [meterBrand, setMeterBrand] = useState<MeterBrand>(
      (initialValue?.meterType as MeterBrand) || 'Tramex'
    );
    const [depth, setDepth] = useState<DepthIndicator>(
      'surface'
    );
    const [materialModalVisible, setMaterialModalVisible] = useState(false);
    const [meterModalVisible, setMeterModalVisible] = useState(false);

    const handleReadingChange = (text: string) => {
      const num = parseInt(text) || 0;
      const clamped = Math.min(Math.max(num, 0), 100);
      setReading(clamped);
    };

    const handleAdjustReading = useCallback(
      async (delta: number) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newValue = Math.min(Math.max(reading + delta, 0), 100);
        setReading(newValue);
      },
      [reading]
    );

    const generateMoistureReading = (): MoistureReading => {
      const timestamp = new Date().toISOString();
      const id = `reading_${Date.now()}`;

      return {
        id,
        localId: id,
        inspectionId,
        location,
        material,
        reading,
        unit: 'percentage',
        meterType: meterBrand,
        meterSerial: null,
        calibrationDate: null,
        latitude: null,
        longitude: null,
        timestamp,
        syncStatus: 'local',
      };
    };

    const handleSubmit = async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const readingData = generateMoistureReading();
      onReadingComplete?.(readingData);
    };

    const readingColor = getColorForReading(reading);
    const severityLabel = getSeverityLabel(reading);

    return (
      <View ref={ref} style={[styles.container, style]} {...viewProps}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
        >
          {/* Large Numeric Display */}
          <View style={styles.readingDisplay}>
            <Text style={[styles.readingValue, { color: readingColor }]}>
              {reading}%
            </Text>
            <Text style={[styles.severityLabel, { color: readingColor }]}>
              {severityLabel}
            </Text>
          </View>

          {/* Numeric Input and Adjustment Buttons */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reading Value</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.textInput}
                placeholder="0-100"
                placeholderTextColor={Colors.light.textMuted}
                value={reading.toString()}
                onChangeText={handleReadingChange}
                keyboardType="number-pad"
                maxLength={3}
                editable={true}
              />
            </View>

            {/* +/- Buttons */}
            <View style={styles.adjustButtonGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.adjustButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleAdjustReading(-5)}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons
                  name="minus"
                  size={24}
                  color="#FFFFFF"
                />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.adjustButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleAdjustReading(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons
                  name="minus-circle-outline"
                  size={24}
                  color="#FFFFFF"
                />
              </Pressable>

              <View style={{ flex: 1 }} />

              <Pressable
                style={({ pressed }) => [
                  styles.adjustButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleAdjustReading(1)}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons
                  name="plus-circle-outline"
                  size={24}
                  color="#FFFFFF"
                />
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.adjustButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleAdjustReading(5)}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons
                  name="plus"
                  size={24}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
          </View>

          {/* Material Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Material Type</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setMaterialModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            >
              <Text style={styles.dropdownButtonText}>
                {MATERIAL_TYPES.find((m) => m.value === material)?.label}
              </Text>
            </Pressable>
          </View>

          {/* Location Field */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Location</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Living Room - North Wall"
              placeholderTextColor={Colors.light.textMuted}
              value={location}
              onChangeText={setLocation}
              editable={true}
            />
          </View>

          {/* Meter Brand Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Meter Brand</Text>
            <Pressable
              style={({ pressed }) => [
                styles.dropdownButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setMeterModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            >
              <Text style={styles.dropdownButtonText}>{meterBrand}</Text>
            </Pressable>
          </View>

          {/* Depth Indicator Toggle */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Depth</Text>
            <View style={styles.depthToggle}>
              <Pressable
                style={({ pressed }) => [
                  styles.depthToggleButton,
                  depth === 'surface' && styles.depthToggleButtonActive,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setDepth('surface')}
              >
                <Text
                  style={[
                    styles.depthToggleButtonText,
                    depth === 'surface' &&
                      styles.depthToggleButtonTextActive,
                  ]}
                >
                  Surface
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.depthToggleButton,
                  depth === 'subsurface' &&
                    styles.depthToggleButtonActive,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setDepth('subsurface')}
              >
                <Text
                  style={[
                    styles.depthToggleButtonText,
                    depth === 'subsurface' &&
                      styles.depthToggleButtonTextActive,
                  ]}
                >
                  Subsurface
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Submit Button */}
          <View style={styles.section}>
            <Button
              variant="primary"
              size="lg"
              label="Save Reading"
              onPress={handleSubmit}
              hapticFeedback={true}
            />
          </View>
        </ScrollView>

        {/* Material Type Modal */}
        <Modal
          visible={materialModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMaterialModalVisible(false)}
        >
          <SafeAreaView style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Material</Text>
                <Pressable onPress={() => setMaterialModalVisible(false)}>
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color={Colors.light.text}
                  />
                </Pressable>
              </View>
              <FlatList
                data={MATERIAL_TYPES}
                keyExtractor={(item) => item.value}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalItem,
                      pressed && { backgroundColor: Colors.light.surface },
                    ]}
                    onPress={() => {
                      setMaterial(item.value);
                      setMaterialModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item.label}</Text>
                    {material === item.value && (
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={Colors.light.accent}
                      />
                    )}
                  </Pressable>
                )}
              />
            </View>
          </SafeAreaView>
        </Modal>

        {/* Meter Brand Modal */}
        <Modal
          visible={meterModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMeterModalVisible(false)}
        >
          <SafeAreaView style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Meter Brand</Text>
                <Pressable onPress={() => setMeterModalVisible(false)}>
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color={Colors.light.text}
                  />
                </Pressable>
              </View>
              <FlatList
                data={METER_BRANDS}
                keyExtractor={(item) => item}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalItem,
                      pressed && { backgroundColor: Colors.light.surface },
                    ]}
                    onPress={() => {
                      setMeterBrand(item);
                      setMeterModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>{item}</Text>
                    {meterBrand === item && (
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={Colors.light.accent}
                      />
                    )}
                  </Pressable>
                )}
              />
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    );
  }
);

MoistureReadingInput.displayName = 'MoistureReadingInput';