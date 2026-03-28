import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { CameraView } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';

import { useInspectionStore } from '@/lib/store/inspection-store';
import { Colors, Spacing, FontSize, BorderRadius, CategoryColors, ClassColors } from '@/constants/theme';
import { WaterDamageCategory, WaterDamageClass, MaterialType, calculateGPP, calculateEMC, EquipmentType } from '@/shared/types';

// Types for local state
type CaptureMode = 'idle' | 'camera' | 'photo-picker';
type ScreenSection = 'category' | 'photos' | 'moisture' | 'environmental' | 'equipment';

const GLOVED_TOUCH_TARGET = 56; // pixels, exceeds 48px minimum

interface PhotoData {
  localId: string;
  uri: string;
  width: number;
  height: number;
}

interface MoistureReadingLocal {
  localId: string;
  location: string;
  material: MaterialType;
  reading: number;
  unit: 'percentage' | 'raw';
  meterType: string;
  meterSerial?: string;
  calibrationDate?: string;
}

interface EnvironmentalReadingLocal {
  localId: string;
  temperature: number;
  humidity: number;
  location: string;
}

interface EquipmentLocal {
  localId: string;
  type: EquipmentType;
  make: string;
  model: string;
  serialNumber?: string;
  location: string;
}

export default function NewInspectionScreen() {
  const { jobId, address } = useLocalSearchParams<{ jobId: string; address: string }>();
  
  // Store hooks
  const { createInspection, updateInspection, addMoistureReading, addPhoto, addEnvironmentalReading, addEquipment } = useInspectionStore();
  
  // Inspection state
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [category, setCategory] = useState<WaterDamageCategory | null>(null);
  const [damageClass, setDamageClass] = useState<WaterDamageClass | null>(null);
  
  // Location state
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  
  // Camera state
  const [cameraMode, setCameraMode] = useState<CaptureMode>('idle');
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const cameraRef = useRef<CameraView>(null);
  
  // Moisture readings state
  const [moistureReadings, setMoistureReadings] = useState<MoistureReadingLocal[]>([]);
  const [showMoistureForm, setShowMoistureForm] = useState(false);
  const [moistureInput, setMoistureInput] = useState({
    location: '',
    material: 'drywall' as MaterialType,
    reading: '',
    unit: 'percentage' as const,
    meterType: '',
    meterSerial: '',
    calibrationDate: '',
  });
  
  // Environmental readings state
  const [environmentalReadings, setEnvironmentalReadings] = useState<EnvironmentalReadingLocal[]>([]);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [envInput, setEnvInput] = useState({
    temperature: '',
    humidity: '',
    location: '',
  });
  
  // Equipment state
  const [equipment, setEquipment] = useState<EquipmentLocal[]>([]);
  const [showEquipForm, setShowEquipForm] = useState(false);
  const [equipInput, setEquipInput] = useState({
    type: 'DEHUMIDIFIER' as EquipmentType,
    make: '',
    model: '',
    serialNumber: '',
    location: '',
  });
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize inspection on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Request location permission
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (err) {
        console.warn('Location error:', err);
      } finally {
        setLocationLoading(false);
      }

      // Create inspection
      if (jobId && address) {
        try {
          const inspection = await createInspection(jobId, address, location?.lat, location?.lng);
          setInspectionId(inspection.id);
        } catch (err) {
          Alert.alert('Error', 'Failed to create inspection. Please try again.');
          router.back();
        }
      }
    };

    init();
  }, []);

  // Update inspection category
  const handleCategorySelect = async (cat: WaterDamageCategory) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCategory(cat);
    if (inspectionId) {
      await updateInspection(inspectionId, { category: cat });
    }
  };

  // Update inspection damage class
  const handleClassSelect = async (cls: WaterDamageClass) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDamageClass(cls);
    if (inspectionId) {
      await updateInspection(inspectionId, { damageClass: cls });
    }
  };

  // Capture photo from camera
  const handleCameraCapture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
        if (photo) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const photoData: PhotoData = {
            localId: `photo-${Date.now()}`,
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
          };
          setPhotos((prev) => [...prev, photoData]);
          setCameraMode('idle');
        }
      } catch (err) {
        Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
      }
    }
  };

  // Pick photo from gallery
  const handlePhotoPickerSelect = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const photoData: PhotoData = {
          localId: `photo-${Date.now()}`,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        };
        setPhotos((prev) => [...prev, photoData]);
      }
    } catch (err) {
      Alert.alert('Gallery Error', 'Failed to pick photo. Please try again.');
    }
  };

  // Add moisture reading
  const handleAddMoistureReading = async () => {
    if (!moistureInput.location.trim() || !moistureInput.reading.trim()) {
      Alert.alert('Validation', 'Please fill in location and reading value.');
      return;
    }

    const reading: MoistureReadingLocal = {
      localId: `moisture-${Date.now()}`,
      location: moistureInput.location.trim(),
      material: moistureInput.material,
      reading: parseFloat(moistureInput.reading),
      unit: moistureInput.unit,
      meterType: moistureInput.meterType.trim() || 'Manual Entry',
      meterSerial: moistureInput.meterSerial.trim() || undefined,
      calibrationDate: moistureInput.calibrationDate.trim() || undefined,
    };

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoistureReadings((prev) => [...prev, reading]);
    setMoistureInput({
      location: '',
      material: 'drywall',
      reading: '',
      unit: 'percentage',
      meterType: '',
      meterSerial: '',
      calibrationDate: '',
    });
    setShowMoistureForm(false);
  };

  // Add environmental reading
  const handleAddEnvReading = async () => {
    if (!envInput.temperature.trim() || !envInput.humidity.trim()) {
      Alert.alert('Validation', 'Please fill in temperature and humidity.');
      return;
    }

    const temp = parseFloat(envInput.temperature);
    const humidity = parseFloat(envInput.humidity);

    if (isNaN(temp) || isNaN(humidity) || humidity < 0 || humidity > 100) {
      Alert.alert('Validation', 'Please enter valid temperature and humidity (0-100%).');
      return;
    }

    const gpp = calculateGPP(temp, humidity);
    const emc = calculateEMC(temp, humidity);

    const reading: EnvironmentalReadingLocal = {
      localId: `env-${Date.now()}`,
      temperature: temp,
      humidity,
      location: envInput.location.trim() || 'General',
    };

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnvironmentalReadings((prev) => [...prev, reading]);
    setEnvInput({ temperature: '', humidity: '', location: '' });
    setShowEnvForm(false);
  };

  // Add equipment deployment
  const handleAddEquipment = async () => {
    if (!equipInput.make.trim() || !equipInput.model.trim() || !equipInput.location.trim()) {
      Alert.alert('Validation', 'Please fill in make, model, and location.');
      return;
    }

    const equip: EquipmentLocal = {
      localId: `equip-${Date.now()}`,
      type: equipInput.type,
      make: equipInput.make.trim(),
      model: equipInput.model.trim(),
      serialNumber: equipInput.serialNumber.trim() || undefined,
      location: equipInput.location.trim(),
    };

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEquipment((prev) => [...prev, equip]);
    setEquipInput({
      type: 'DEHUMIDIFIER',
      make: '',
      model: '',
      serialNumber: '',
      location: '',
    });
    setShowEquipForm(false);
  };

  // Save as draft
  const handleSaveDraft = async () => {
    if (!inspectionId) {
      Alert.alert('Error', 'Inspection not initialized.');
      return;
    }

    setIsSaving(true);
    try {
      // Save all collected data to store
      for (const photo of photos) {
        await addPhoto({
          inspectionId,
          uri: photo.uri,
          caption: '',
          lat: location?.lat,
          lng: location?.lng,
          width: photo.width,
          height: photo.height,
        });
      }

      for (const reading of moistureReadings) {
        await addMoistureReading({
          inspectionId,
          location: reading.location,
          material: reading.material,
          reading: reading.reading,
          unit: reading.unit,
          meterType: reading.meterType,
          meterSerial: reading.meterSerial,
          calibrationDate: reading.calibrationDate,
          lat: location?.lat,
          lng: location?.lng,
        });
      }

      for (const env of environmentalReadings) {
        await addEnvironmentalReading({
          inspectionId,
          temperature: env.temperature,
          relativeHumidity: env.humidity,
          gpp: calculateGPP(env.temperature, env.humidity),
          emc: calculateEMC(env.temperature, env.humidity),
          location: env.location,
        });
      }

      for (const equip of equipment) {
        await addEquipment({
          inspectionId,
          equipmentType: equip.type,
          make: equip.make,
          model: equip.model,
          serialNumber: equip.serialNumber,
          location: equip.location,
        });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Inspection saved as draft.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save inspection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit for AI report generation
  const handleSubmit = async () => {
    if (!inspectionId) {
      Alert.alert('Error', 'Inspection not initialized.');
      return;
    }

    if (!category || !damageClass) {
      Alert.alert('Validation', 'Please select water damage category and class.');
      return;
    }

    if (photos.length === 0) {
      Alert.alert('Validation', 'Please add at least one photo.');
      return;
    }

    Alert.alert(
      'Submit Inspection',
      'Submit this inspection for AI report generation? This will send data to the server.',
      [
        { text: 'Cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // Save all data first
              await handleSaveDraft();
              
              // Update inspection status
              await updateInspection(inspectionId, { status: 'SUBMITTED' });
              
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Submitted', 'Inspection submitted for AI report generation.', [
                { text: 'OK', onPress: () => router.push({ pathname: '/reports' }) },
              ]);
            } catch (err) {
              Alert.alert('Error', 'Failed to submit inspection. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Render category selector
  const renderCategorySelector = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Water Damage Category</Text>
      <View style={styles.categoryGrid}>
        {(['CAT_1', 'CAT_2', 'CAT_3'] as WaterDamageCategory[]).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryButton,
              { borderColor: CategoryColors[cat] },
              category === cat && { backgroundColor: CategoryColors[cat] },
            ]}
            onPress={() => handleCategorySelect(cat)}
          >
            <Text style={[styles.categoryButtonText, category === cat && styles.categoryButtonTextActive]}>
              {cat === 'CAT_1' ? '🌊 CAT 1\nClean' : cat === 'CAT_2' ? '⚠️ CAT 2\nGrey' : '☠️ CAT 3\nBlack'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Damage Class</Text>
      <View style={styles.classGrid}>
        {(['CLASS_1', 'CLASS_2', 'CLASS_3', 'CLASS_4'] as WaterDamageClass[]).map((cls) => (
          <TouchableOpacity
            key={cls}
            style={[
              styles.classButton,
              { borderColor: ClassColors[cls] },
              damageClass === cls && { backgroundColor: ClassColors[cls] },
            ]}
            onPress={() => handleClassSelect(cls)}
          >
            <Text style={[styles.classButtonText, damageClass === cls && styles.classButtonTextActive]}>
              {cls}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Render camera view
  if (cameraMode === 'camera') {
    return (
      <View style={styles.fullscreen}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        />
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => setCameraMode('idle')}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleCameraCapture}
          >
            <Text style={styles.buttonTextPrimary}>Capture</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Main screen layout
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={true}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Inspection</Text>
          <Text style={styles.headerSubtitle}>{address || jobId}</Text>
          {locationLoading ? (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="small" color={Colors.light.accent} />
              <Text style={styles.locationText}>Getting location...</Text>
            </View>
          ) : location ? (
            <Text style={styles.locationText}>
              📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </Text>
          ) : (
            <Text style={[styles.locationText, { color: Colors.light.warning }]}>Location unavailable</Text>
          )}
        </View>

        {/* Category & Class Selection */}
        {renderCategorySelector()}

        {/* Photo Capture Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.localId} style={styles.photoThumbnail}>
                <Text style={styles.photoPlaceholder}>📸</Text>
              </View>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
              onPress={() => setCameraMode('camera')}
            >
              <Text style={styles.buttonText}>📷 Camera</Text>
            </TouchableOpacity>
            <View style={{ width: Spacing.md }} />
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
              onPress={handlePhotoPickerSelect}
            >
              <Text style={styles.buttonText}>🖼️ Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Moisture Readings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Moisture Readings ({moistureReadings.length})</Text>
          {moistureReadings.map((reading) => (
            <View key={reading.localId} style={styles.dataCard}>
              <Text style={styles.dataCardLabel}>{reading.location}</Text>
              <Text style={styles.dataCardValue}>
                {reading.reading}% • {reading.material}
              </Text>
              <Text style={styles.dataCardMeta}>{reading.meterType}</Text>
            </View>
          ))}
          {!showMoistureForm ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowMoistureForm(true)}
            >
              <Text style={styles.buttonText}>+ Add Reading</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Living Room - North Wall"
                value={moistureInput.location}
                onChangeText={(text) => setMoistureInput((prev) => ({ ...prev, location: text }))}
              />

              <Text style={styles.formLabel}>Material Type</Text>
              <View style={styles.pickerContainer}>
                {(['drywall', 'wood_structural', 'wood_flooring', 'concrete', 'carpet', 'insulation', 'tile', 'other'] as MaterialType[]).map((mat) => (
                  <TouchableOpacity
                    key={mat}
                    style={[
                      styles.pickerOption,
                      moistureInput.material === mat && styles.pickerOptionActive,
                    ]}
                    onPress={() => setMoistureInput((prev) => ({ ...prev, material: mat }))}
                  >
                    <Text style={[styles.pickerOptionText, moistureInput.material === mat && styles.pickerOptionTextActive]}>
                      {mat.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Reading Value</Text>
              <View style={styles.readingInputContainer}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={moistureInput.reading}
                  onChangeText={(text) => setMoistureInput((prev) => ({ ...prev, reading: text }))}
                />
                <Text style={styles.unitLabel}>%</Text>
              </View>

              <Text style={styles.formLabel}>Meter Type</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Tramex MRH III"
                value={moistureInput.meterType}
                onChangeText={(text) => setMoistureInput((prev) => ({ ...prev, meterType: text }))}
              />

              <Text style={styles.formLabel}>Serial Number (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Serial number"
                value={moistureInput.meterSerial}
                onChangeText={(text) => setMoistureInput((prev) => ({ ...prev, meterSerial: text }))}
              />

              <View style={styles.formButtonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
                  onPress={() => setShowMoistureForm(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ width: Spacing.md }} />
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary, { flex: 1 }]}
                  onPress={handleAddMoistureReading}
                >
                  <Text style={styles.buttonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Environmental Readings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environmental Readings ({environmentalReadings.length})</Text>
          {environmentalReadings.map((reading) => (
            <View key={reading.localId} style={styles.dataCard}>
              <Text style={styles.dataCardLabel}>{reading.location}</Text>
              <Text style={styles.dataCardValue}>
                {reading.temperature}°C • {reading.humidity}% RH
              </Text>
              <Text style={styles.dataCardMeta}>
                GPP: {calculateGPP(reading.temperature, reading.humidity).toFixed(1)} • EMC: {calculateEMC(reading.temperature, reading.humidity).toFixed(1)}%
              </Text>
            </View>
          ))}
          {!showEnvForm ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowEnvForm(true)}
            >
              <Text style={styles.buttonText}>+ Add Reading</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Temperature (°C)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="22"
                keyboardType="decimal-pad"
                value={envInput.temperature}
                onChangeText={(text) => setEnvInput((prev) => ({ ...prev, temperature: text }))}
              />

              <Text style={styles.formLabel}>Relative Humidity (%)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="65"
                keyboardType="decimal-pad"
                value={envInput.humidity}
                onChangeText={(text) => setEnvInput((prev) => ({ ...prev, humidity: text }))}
              />

              <Text style={styles.formLabel}>Location (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Living Room"
                value={envInput.location}
                onChangeText={(text) => setEnvInput((prev) => ({ ...prev, location: text }))}
              />

              <View style={styles.formButtonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
                  onPress={() => setShowEnvForm(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ width: Spacing.md }} />
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary, { flex: 1 }]}
                  onPress={handleAddEnvReading}
                >
                  <Text style={styles.buttonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Equipment Deployment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment Deployment ({equipment.length})</Text>
          {equipment.map((equip) => (
            <View key={equip.localId} style={styles.dataCard}>
              <Text style={styles.dataCardLabel}>{equip.type}</Text>
              <Text style={styles.dataCardValue}>
                {equip.make} {equip.model}
              </Text>
              <Text style={styles.dataCardMeta}>
                {equip.location} {equip.serialNumber && `• SN: ${equip.serialNumber}`}
              </Text>
            </View>
          ))}
          {!showEquipForm ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowEquipForm(true)}
            >
              <Text style={styles.buttonText}>+ Add Equipment</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Equipment Type</Text>
              <View style={styles.pickerContainer}>
                {(['DEHUMIDIFIER', 'AIR_MOVER', 'AIR_SCRUBBER', 'HEPA_FILTER', 'MOISTURE_METER', 'THERMAL_CAMERA'] as EquipmentType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.pickerOption,
                      equipInput.type === type && styles.pickerOptionActive,
                    ]}
                    onPress={() => setEquipInput((prev) => ({ ...prev, type }))}
                  >
                    <Text style={[styles.pickerOptionText, equipInput.type === type && styles.pickerOptionTextActive]}>
                      {type.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Make</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Brand/Manufacturer"
                value={equipInput.make}
                onChangeText={(text) => setEquipInput((prev) => ({ ...prev, make: text }))}
              />

              <Text style={styles.formLabel}>Model</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Model number"
                value={equipInput.model}
                onChangeText={(text) => setEquipInput((prev) => ({ ...prev, model: text }))}
              />

              <Text style={styles.formLabel}>Serial Number (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Serial number"
                value={equipInput.serialNumber}
                onChangeText={(text) => setEquipInput((prev) => ({ ...prev, serialNumber: text }))}
              />

              <Text style={styles.formLabel}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Living Room"
                value={equipInput.location}
                onChangeText={(text) => setEquipInput((prev) => ({ ...prev, location: text }))}
              />

              <View style={styles.formButtonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary, { flex: 1 }]}
                  onPress={() => setShowEquipForm(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ width: Spacing.md }} />
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary, { flex: 1 }]}
                  onPress={handleAddEquipment}
                >
                  <Text style={styles.buttonTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { height: GLOVED_TOUCH_TARGET }]}
            onPress={handleSaveDraft}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.light.text} />
            ) : (
              <Text style={styles.buttonText}>📋 Save Draft</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSuccess, { height: GLOVED_TOUCH_TARGET, marginTop: Spacing.md }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.buttonTextPrimary, { fontWeight: '700' }]}>🤖 Submit for AI Report</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Bottom padding */}
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: FontSize.md,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: Spacing.sm,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  section: {
    backgroundColor: Colors.light.surface,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: Spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  categoryButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    minHeight: GLOVED_TOUCH_TARGET,
    justifyContent: 'center',
  },
  categoryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  classButton: {
    width: '48%',
    paddingVertical: Spacing.md,
    marginVertical: Spacing.sm,
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    minHeight: GLOVED_TOUCH_TARGET,
    justifyContent: 'center',
  },
  classButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  classButtonTextActive: {
    color: '#FFFFFF',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: Spacing.lg,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    marginRight: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.light.surfaceAlt,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.light.border,
  },
  photoPlaceholder: {
    fontSize: 32,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: GLOVED_TOUCH_TARGET,
  },
  buttonPrimary: {
    backgroundColor: Colors.light.accent,
  },
  buttonSecondary: {
    backgroundColor: Colors.light.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  buttonSuccess: {
    backgroundColor: Colors.light.success,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
  },
  buttonTextPrimary: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  form: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  formLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  textInput: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.light.text,
    minHeight: GLOVED_TOUCH_TARGET,
  },
  readingInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginLeft: Spacing.sm,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: Spacing.md,
  },
  pickerOption: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: GLOVED_TOUCH_TARGET,
    justifyContent: 'center',
  },
  pickerOptionActive: {
    backgroundColor: Colors.light.accent,
    borderColor: Colors.light.accent,
  },
  pickerOptionText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
  },
  dataCard: {
    backgroundColor: Colors.light.background,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  dataCardLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.light.accent,
    marginBottom: Spacing.xs,
  },
  dataCardValue: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: Spacing.xs,
  },
  dataCardMeta: {
    fontSize: FontSize.xs,
    color: Colors.light.textSecondary,
  },
  formButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  actionSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
});
