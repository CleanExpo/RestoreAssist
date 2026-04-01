import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, input } from '@/constants/theme';
import { api } from '@/lib/api/client';
import { calculateDewPoint } from '@/lib/utils/dew-point';
import { checkTieredCompletion } from '@/lib/validation/tiered-completion';
import type {
  Inspection,
  MoistureReading,
  AffectedArea,
} from '@/shared/types';
import SectionCard from '@/components/SectionCard';
import FieldInput from '@/components/FieldInput';
import NetworkBanner from '@/components/NetworkBanner';
import SyncStatusBar from '@/components/SyncStatusBar';

// ---------- Constants ----------

const SURFACE_TYPES = [
  'Drywall',
  'Wood',
  'Carpet',
  'Concrete',
  'Tile',
  'Vinyl',
  'Hardwood',
  'Other',
] as const;

const DEPTH_OPTIONS = ['Surface', 'Subsurface'] as const;

const WATER_SOURCES = [
  { label: 'Clean Water', value: 'CLEAN' },
  { label: 'Grey Water', value: 'GREY' },
  { label: 'Black Water', value: 'BLACK' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: colors.muted,
  SUBMITTED: colors.accent,
  PROCESSING: colors.warning,
  CLASSIFIED: colors.accent,
  SCOPED: colors.accent,
  ESTIMATED: colors.accent,
  COMPLETED: colors.success,
  REJECTED: colors.error,
};

// ---------- Screen ----------

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Environmental form ---
  const [envTemp, setEnvTemp] = useState('');
  const [envHumidity, setEnvHumidity] = useState('');
  const [envWeather, setEnvWeather] = useState('');
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envSuccess, setEnvSuccess] = useState(false);

  // --- Moisture reading form ---
  const [mrLocation, setMrLocation] = useState('');
  const [mrSurface, setMrSurface] = useState('');
  const [mrMoisture, setMrMoisture] = useState('');
  const [mrDepth, setMrDepth] = useState<string>('Surface');
  const [mrNotes, setMrNotes] = useState('');
  const [mrSaving, setMrSaving] = useState(false);
  const [mrError, setMrError] = useState<string | null>(null);
  const [mrFormOpen, setMrFormOpen] = useState(false);

  // --- Affected area form ---
  const [aaRoom, setAaRoom] = useState('');
  const [aaArea, setAaArea] = useState('');
  const [aaSource, setAaSource] = useState('');
  const [aaTime, setAaTime] = useState('');
  const [aaSaving, setAaSaving] = useState(false);
  const [aaError, setAaError] = useState<string | null>(null);
  const [aaFormOpen, setAaFormOpen] = useState(false);

  // --- Photo upload ---
  const [photoUploading, setPhotoUploading] = useState(false);

  // --- Submit ---
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ---------- Fetch ----------

  const fetchInspection = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const { inspection: data } = await api.inspections.get(id);
      setInspection(data);

      // Pre-fill environmental data if it exists
      if (data.environmentalData) {
        setEnvTemp(String(data.environmentalData.ambientTemperature));
        setEnvHumidity(String(data.environmentalData.humidityLevel));
        setEnvWeather(data.environmentalData.weatherConditions ?? '');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load inspection');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInspection();
  }, [fetchInspection]);

  // ---------- Dew point calc ----------

  const dewPoint = (() => {
    const t = parseFloat(envTemp);
    const h = parseFloat(envHumidity);
    if (!isNaN(t) && !isNaN(h) && h > 0 && h <= 100) {
      return String(calculateDewPoint(t, h));
    }
    return '';
  })();

  // ---------- Save environmental ----------

  async function saveEnvironmental() {
    if (!id) return;
    const temp = parseFloat(envTemp);
    const humidity = parseFloat(envHumidity);

    if (isNaN(temp)) {
      setEnvError('Temperature is required');
      return;
    }
    if (isNaN(humidity) || humidity <= 0 || humidity > 100) {
      setEnvError('Humidity must be between 0 and 100');
      return;
    }

    setEnvSaving(true);
    setEnvError(null);
    setEnvSuccess(false);

    try {
      await api.inspections.saveEnvironmental(id, {
        ambientTemperature: temp,
        humidityLevel: humidity,
        dewPoint: dewPoint ? parseFloat(dewPoint) : undefined,
        weatherConditions: envWeather || undefined,
      });
      setEnvSuccess(true);
      await fetchInspection();
    } catch (err: any) {
      setEnvError(err.message ?? 'Failed to save environmental data');
    } finally {
      setEnvSaving(false);
    }
  }

  // ---------- Save moisture reading ----------

  async function saveMoistureReading() {
    if (!id) return;
    const moisture = parseFloat(mrMoisture);

    if (!mrLocation.trim()) {
      setMrError('Location is required');
      return;
    }
    if (!mrSurface) {
      setMrError('Select a surface type');
      return;
    }
    if (isNaN(moisture) || moisture < 0) {
      setMrError('Enter a valid moisture level');
      return;
    }

    setMrSaving(true);
    setMrError(null);

    try {
      await api.inspections.addMoistureReading(id, {
        location: mrLocation.trim(),
        surfaceType: mrSurface,
        moistureLevel: moisture,
        depth: mrDepth,
        notes: mrNotes.trim() || undefined,
      });
      // Clear form
      setMrLocation('');
      setMrSurface('');
      setMrMoisture('');
      setMrDepth('Surface');
      setMrNotes('');
      setMrFormOpen(false);
      await fetchInspection();
    } catch (err: any) {
      setMrError(err.message ?? 'Failed to save moisture reading');
    } finally {
      setMrSaving(false);
    }
  }

  // ---------- Save affected area ----------

  async function saveAffectedArea() {
    if (!id) return;
    const area = parseFloat(aaArea);

    if (!aaRoom.trim()) {
      setAaError('Room/Zone ID is required');
      return;
    }
    if (isNaN(area) || area <= 0) {
      setAaError('Enter a valid area in m\u00B2');
      return;
    }
    if (!aaSource) {
      setAaError('Select a water source');
      return;
    }

    setAaSaving(true);
    setAaError(null);

    try {
      const timeSinceLoss = parseFloat(aaTime);
      await api.inspections.addAffectedArea(id, {
        roomZoneId: aaRoom.trim(),
        affectedSquareFootage: area,
        waterSource: aaSource,
        timeSinceLoss: !isNaN(timeSinceLoss) ? timeSinceLoss : undefined,
      });
      // Clear form
      setAaRoom('');
      setAaArea('');
      setAaSource('');
      setAaTime('');
      setAaFormOpen(false);
      await fetchInspection();
    } catch (err: any) {
      setAaError(err.message ?? 'Failed to save affected area');
    } finally {
      setAaSaving(false);
    }
  }

  // ---------- Photo capture ----------

  async function pickPhoto(source: 'camera' | 'gallery') {
    if (!id) return;

    // Request permissions for camera
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Camera access is needed to take photos.');
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const filename = uri.split('/').pop() ?? 'photo.jpg';

    const formData = new FormData();
    formData.append('photo', {
      uri,
      name: filename,
      type: asset.mimeType ?? 'image/jpeg',
    } as any);

    setPhotoUploading(true);
    try {
      await api.inspections.uploadPhoto(id, formData);
      await fetchInspection();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Could not upload photo');
    } finally {
      setPhotoUploading(false);
    }
  }

  // ---------- Submit ----------

  async function handleSubmit() {
    if (!id || !inspection) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await api.inspections.submit(id);

      setSubmitted(true);
      await fetchInspection();

      // Show warnings if any
      const warnings = [
        ...(result.warnings ?? []),
        ...(result.missingSupplementary?.map(
          (s) => `Missing: ${s.label} (${s.clauseRef})`
        ) ?? []),
      ];

      if (warnings.length > 0) {
        Alert.alert(
          'Submitted with notes',
          `Inspection submitted successfully.\n\n${warnings.join('\n')}`,
        );
      } else {
        Alert.alert('Success', 'Inspection submitted successfully.');
      }
    } catch (err: any) {
      const status = (err as any).status;
      if (status === 400) {
        const body = (err as any).body;
        const fields = body?.missingFields;
        if (fields && Array.isArray(fields)) {
          setSubmitError(`Missing required fields: ${fields.join(', ')}`);
        } else {
          setSubmitError(err.message ?? 'Validation failed — check required fields');
        }
      } else if (status === 401) {
        setSubmitError('Session expired — please log in again');
      } else {
        setSubmitError(err.message ?? 'Server error — please try again');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Loading / Error states ----------

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading inspection...</Text>
      </View>
    );
  }

  if (error || !inspection) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Inspection not found'}</Text>
      </View>
    );
  }

  // ---------- Render ----------

  const moistureReadings = inspection.moistureReadings ?? [];
  const affectedAreas = inspection.affectedAreas ?? [];
  const statusColor = STATUS_COLORS[inspection.status] ?? colors.muted;

  return (
    <View style={styles.root}>
      <NetworkBanner />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Header ---- */}
        <Text style={styles.address}>{inspection.propertyAddress}</Text>

        <View style={styles.headerRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{inspection.status}</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          #{inspection.inspectionNumber} &middot;{' '}
          {new Date(inspection.inspectionDate).toLocaleDateString('en-AU')}
        </Text>

        {/* ---- Section 1: Environmental Data ---- */}
        <SectionCard title="Environmental Data" defaultOpen>
          <FieldInput
            label="Temperature \u00B0C"
            value={envTemp}
            onChangeText={(t) => {
              setEnvTemp(t);
              setEnvSuccess(false);
            }}
            placeholder="e.g. 24.5"
            keyboardType="decimal-pad"
          />

          <FieldInput
            label="Humidity %"
            value={envHumidity}
            onChangeText={(h) => {
              setEnvHumidity(h);
              setEnvSuccess(false);
            }}
            placeholder="e.g. 65"
            keyboardType="decimal-pad"
          />

          <FieldInput
            label="Dew Point \u00B0C (auto-calculated)"
            value={dewPoint}
            onChangeText={() => {}}
            editable={false}
            placeholder="Fill temp & humidity above"
          />

          <FieldInput
            label="Weather Conditions"
            value={envWeather}
            onChangeText={setEnvWeather}
            placeholder="e.g. Overcast, light rain"
          />

          {envError ? <Text style={styles.formError}>{envError}</Text> : null}
          {envSuccess ? (
            <Text style={styles.formSuccess}>Saved successfully</Text>
          ) : null}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={saveEnvironmental}
            disabled={envSaving}
            activeOpacity={0.7}
          >
            {envSaving ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.saveBtnText}>Save Environmental Data</Text>
            )}
          </TouchableOpacity>
        </SectionCard>

        {/* ---- Section 2: Moisture Readings ---- */}
        <SectionCard
          title="Moisture Readings"
          badge={moistureReadings.length}
        >
          {/* Existing readings */}
          {moistureReadings.map((r: MoistureReading) => (
            <View key={r.id} style={styles.listItem}>
              <Text style={styles.listPrimary}>{r.location}</Text>
              <Text style={styles.listSecondary}>
                {r.surfaceType} &middot; {r.moistureLevel}% &middot; {r.depth}
              </Text>
            </View>
          ))}

          {moistureReadings.length === 0 && !mrFormOpen && (
            <Text style={styles.emptyText}>No readings yet</Text>
          )}

          {/* Add reading toggle */}
          {!mrFormOpen ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setMrFormOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addBtnText}>+ Add Reading</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formBlock}>
              <FieldInput
                label="Location"
                value={mrLocation}
                onChangeText={setMrLocation}
                placeholder="e.g. Kitchen - North Wall"
              />

              {/* Surface type chips */}
              <Text style={styles.chipLabel}>Surface Type</Text>
              <View style={styles.chipRow}>
                {SURFACE_TYPES.map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.chip,
                      mrSurface === st && styles.chipActive,
                    ]}
                    onPress={() => setMrSurface(st)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        mrSurface === st && styles.chipTextActive,
                      ]}
                    >
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldInput
                label="Moisture Level %"
                value={mrMoisture}
                onChangeText={setMrMoisture}
                placeholder="e.g. 22"
                keyboardType="decimal-pad"
              />

              {/* Depth toggles */}
              <Text style={styles.chipLabel}>Depth</Text>
              <View style={styles.chipRow}>
                {DEPTH_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.chip,
                      mrDepth === d && styles.chipActive,
                    ]}
                    onPress={() => setMrDepth(d)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        mrDepth === d && styles.chipTextActive,
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldInput
                label="Notes (optional)"
                value={mrNotes}
                onChangeText={setMrNotes}
                placeholder="Any observations..."
                multiline
              />

              {mrError ? (
                <Text style={styles.formError}>{mrError}</Text>
              ) : null}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setMrFormOpen(false);
                    setMrError(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={saveMoistureReading}
                  disabled={mrSaving}
                  activeOpacity={0.7}
                >
                  {mrSaving ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Reading</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SectionCard>

        {/* ---- Section 3: Affected Areas ---- */}
        <SectionCard title="Affected Areas" badge={affectedAreas.length}>
          {/* Existing areas */}
          {affectedAreas.map((a: AffectedArea) => (
            <View key={a.id} style={styles.listItem}>
              <Text style={styles.listPrimary}>{a.roomZoneId}</Text>
              <Text style={styles.listSecondary}>
                {a.affectedSquareFootage} m\u00B2 &middot; {a.waterSource}
                {a.category ? ` \u00B7 Cat ${a.category}` : ''}
              </Text>
            </View>
          ))}

          {affectedAreas.length === 0 && !aaFormOpen && (
            <Text style={styles.emptyText}>No areas recorded yet</Text>
          )}

          {/* Add area toggle */}
          {!aaFormOpen ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setAaFormOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.addBtnText}>+ Add Area</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formBlock}>
              <FieldInput
                label="Room / Zone ID"
                value={aaRoom}
                onChangeText={setAaRoom}
                placeholder="e.g. Kitchen"
              />

              <FieldInput
                label="Affected Area (m\u00B2)"
                value={aaArea}
                onChangeText={setAaArea}
                placeholder="e.g. 12.5"
                keyboardType="decimal-pad"
              />

              {/* Water source chips */}
              <Text style={styles.chipLabel}>Water Source</Text>
              <View style={styles.chipRow}>
                {WATER_SOURCES.map((ws) => (
                  <TouchableOpacity
                    key={ws.value}
                    style={[
                      styles.chip,
                      aaSource === ws.value && styles.chipActive,
                    ]}
                    onPress={() => setAaSource(ws.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        aaSource === ws.value && styles.chipTextActive,
                      ]}
                    >
                      {ws.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FieldInput
                label="Time Since Loss (hours, optional)"
                value={aaTime}
                onChangeText={setAaTime}
                placeholder="e.g. 48"
                keyboardType="numeric"
              />

              {aaError ? (
                <Text style={styles.formError}>{aaError}</Text>
              ) : null}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setAaFormOpen(false);
                    setAaError(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={saveAffectedArea}
                  disabled={aaSaving}
                  activeOpacity={0.7}
                >
                  {aaSaving ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Area</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SectionCard>

        {/* ---- Section 4: Photos ---- */}
        <SectionCard
          title="Photos"
          badge={inspection.photos?.length}
        >
          {/* Existing photos */}
          {(inspection.photos?.length ?? 0) > 0 && (
            <View style={styles.photoGrid}>
              {inspection.photos!.map((photo) => (
                <View key={photo.id} style={styles.photoThumb}>
                  {photo.url ? (
                    <Image
                      source={{ uri: photo.url }}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
                    </View>
                  )}
                  {photo.location ? (
                    <Text style={styles.photoLabel} numberOfLines={1}>
                      {photo.location}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {(inspection.photos?.length ?? 0) === 0 && (
            <Text style={styles.emptyText}>No photos yet</Text>
          )}

          {/* Upload state */}
          {photoUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.uploadingText}>Uploading photo...</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.photoActions}>
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={() => pickPhoto('camera')}
              disabled={photoUploading}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={20} color={colors.accent} />
              <Text style={styles.photoBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={() => pickPhoto('gallery')}
              disabled={photoUploading}
              activeOpacity={0.7}
            >
              <Ionicons name="images" size={20} color={colors.accent} />
              <Text style={styles.photoBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* ---- Section 5: Submit ---- */}
        <SectionCard title="Submit">
          {(() => {
            const completion = checkTieredCompletion(inspection);
            const isAlreadySubmitted =
              submitted || inspection.status !== 'DRAFT';

            return (
              <View>
                {/* Checklist */}
                {completion.items.map((item) => (
                  <View key={item.label} style={styles.checkItem}>
                    <Ionicons
                      name={item.met ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={item.met ? colors.success : colors.error}
                    />
                    <Text
                      style={[
                        styles.checkLabel,
                        item.met && styles.checkLabelMet,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}

                {/* Status message */}
                {isAlreadySubmitted ? (
                  <Text style={styles.submittedMsg}>
                    This inspection has been submitted ({inspection.status})
                  </Text>
                ) : completion.canSubmit ? (
                  <Text style={styles.readyMsg}>Ready to submit</Text>
                ) : (
                  <Text style={styles.notReadyMsg}>
                    Cannot submit — complete required fields
                  </Text>
                )}

                {/* Sync status bar inline */}
                <SyncStatusBar
                  submitting={submitting}
                  error={submitError}
                />

                {/* Submit button */}
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (!completion.canSubmit || isAlreadySubmitted) &&
                      styles.submitBtnDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={
                    !completion.canSubmit || isAlreadySubmitted || submitting
                  }
                  activeOpacity={0.7}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text
                      style={[
                        styles.submitBtnText,
                        (!completion.canSubmit || isAlreadySubmitted) &&
                          styles.submitBtnTextDisabled,
                      ]}
                    >
                      {isAlreadySubmitted ? 'Already Submitted' : 'Submit Inspection'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })()}
        </SectionCard>

        {/* Bottom spacer for safe area */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
  },

  // Header
  address: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.bg,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  // List items
  listItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  listSecondary: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },

  // Chips
  chipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.bg,
    fontWeight: '700',
  },

  // Form blocks
  formBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  formError: {
    fontSize: 13,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  formSuccess: {
    fontSize: 13,
    color: colors.success,
    marginBottom: spacing.xs,
  },

  // Buttons
  saveBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: input.borderRadius,
    height: input.height,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: input.borderRadius,
    height: input.height,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: input.borderRadius,
    height: input.height,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },

  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  photoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: colors.text,
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  uploadingText: {
    fontSize: 13,
    color: colors.accent,
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: input.borderRadius,
    height: input.height,
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },

  // Submit
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  checkLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  checkLabelMet: {
    color: colors.text,
  },
  readyMsg: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  notReadyMsg: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  submittedMsg: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  submitBtn: {
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: input.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.bg,
  },
  submitBtnTextDisabled: {
    color: colors.textSecondary,
  },
});
