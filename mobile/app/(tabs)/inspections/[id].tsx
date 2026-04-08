import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Image,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, input, shadows } from "@/constants/theme";
import { api } from "@/lib/api/client";
import { calculateDewPoint } from "@/lib/utils/dew-point";
import { checkTieredCompletion } from "@/lib/validation/tiered-completion";
import type { Inspection, MoistureReading, AffectedArea } from "@/shared/types";
import SectionCard from "@/components/SectionCard";
import FieldInput from "@/components/FieldInput";
import NetworkBanner from "@/components/NetworkBanner";
import SyncStatusBar from "@/components/SyncStatusBar";

// ---------- Constants ----------

const SURFACE_TYPES = [
  "Drywall",
  "Wood",
  "Carpet",
  "Concrete",
  "Tile",
  "Vinyl",
  "Hardwood",
  "Other",
] as const;

const DEPTH_OPTIONS = ["Surface", "Subsurface"] as const;

const WATER_SOURCES = [
  { label: "Clean Water", value: "CLEAN", color: colors.accent },
  { label: "Grey Water", value: "GREY", color: colors.warning },
  { label: "Black Water", value: "BLACK", color: colors.error },
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

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

// ---------- Screen ----------

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Environmental form ---
  const [envTemp, setEnvTemp] = useState("");
  const [envHumidity, setEnvHumidity] = useState("");
  const [envWeather, setEnvWeather] = useState("");
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envSuccess, setEnvSuccess] = useState(false);

  // --- Moisture reading form ---
  const [mrLocation, setMrLocation] = useState("");
  const [mrSurface, setMrSurface] = useState("");
  const [mrMoisture, setMrMoisture] = useState("");
  const [mrDepth, setMrDepth] = useState<string>("Surface");
  const [mrNotes, setMrNotes] = useState("");
  const [mrSaving, setMrSaving] = useState(false);
  const [mrError, setMrError] = useState<string | null>(null);
  const [mrFormOpen, setMrFormOpen] = useState(false);

  // --- Affected area form ---
  const [aaRoom, setAaRoom] = useState("");
  const [aaArea, setAaArea] = useState("");
  const [aaSource, setAaSource] = useState("");
  const [aaTime, setAaTime] = useState("");
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

      if (data.environmentalData) {
        setEnvTemp(String(data.environmentalData.ambientTemperature));
        setEnvHumidity(String(data.environmentalData.humidityLevel));
        setEnvWeather(data.environmentalData.weatherConditions ?? "");
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to load inspection");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInspection();
  }, [fetchInspection]);

  // ---------- Dew point ----------

  const dewPoint = (() => {
    const t = parseFloat(envTemp);
    const h = parseFloat(envHumidity);
    if (!isNaN(t) && !isNaN(h) && h > 0 && h <= 100) {
      return String(calculateDewPoint(t, h));
    }
    return "";
  })();

  // ---------- Save environmental ----------

  async function saveEnvironmental() {
    if (!id) return;
    const temp = parseFloat(envTemp);
    const humidity = parseFloat(envHumidity);

    if (isNaN(temp)) {
      setEnvError("Temperature is required");
      return;
    }
    if (isNaN(humidity) || humidity <= 0 || humidity > 100) {
      setEnvError("Humidity must be between 0 and 100");
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
      setEnvError(err.message ?? "Failed to save environmental data");
    } finally {
      setEnvSaving(false);
    }
  }

  // ---------- Save moisture reading ----------

  async function saveMoistureReading() {
    if (!id) return;
    const moisture = parseFloat(mrMoisture);

    if (!mrLocation.trim()) {
      setMrError("Location is required");
      return;
    }
    if (!mrSurface) {
      setMrError("Select a surface type");
      return;
    }
    if (isNaN(moisture) || moisture < 0) {
      setMrError("Enter a valid moisture level");
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
      setMrLocation("");
      setMrSurface("");
      setMrMoisture("");
      setMrDepth("Surface");
      setMrNotes("");
      setMrFormOpen(false);
      await fetchInspection();
    } catch (err: any) {
      setMrError(err.message ?? "Failed to save moisture reading");
    } finally {
      setMrSaving(false);
    }
  }

  // ---------- Save affected area ----------

  async function saveAffectedArea() {
    if (!id) return;
    const area = parseFloat(aaArea);

    if (!aaRoom.trim()) {
      setAaError("Room/Zone ID is required");
      return;
    }
    if (isNaN(area) || area <= 0) {
      setAaError("Enter a valid area in m\u00B2");
      return;
    }
    if (!aaSource) {
      setAaError("Select a water source");
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
      setAaRoom("");
      setAaArea("");
      setAaSource("");
      setAaTime("");
      setAaFormOpen(false);
      await fetchInspection();
    } catch (err: any) {
      setAaError(err.message ?? "Failed to save affected area");
    } finally {
      setAaSaving(false);
    }
  }

  // ---------- Photo capture ----------

  async function pickPhoto(source: "camera" | "gallery") {
    if (!id) return;

    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission required",
          "Camera access is needed to take photos.",
        );
        return;
      }
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const filename = uri.split("/").pop() ?? "photo.jpg";

    const formData = new FormData();
    formData.append("photo", {
      uri,
      name: filename,
      type: asset.mimeType ?? "image/jpeg",
    } as any);

    setPhotoUploading(true);
    try {
      await api.inspections.uploadPhoto(id, formData);
      await fetchInspection();
    } catch (err: any) {
      Alert.alert("Upload failed", err.message ?? "Could not upload photo");
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

      const warnings = [
        ...(result.warnings ?? []),
        ...(result.missingSupplementary?.map(
          (s) => `Missing: ${s.label} (${s.clauseRef})`,
        ) ?? []),
      ];

      if (warnings.length > 0) {
        Alert.alert(
          "Submitted with notes",
          `Inspection submitted successfully.\n\n${warnings.join("\n")}`,
        );
      } else {
        Alert.alert("Success", "Inspection submitted successfully.");
      }
    } catch (err: any) {
      const status = (err as any).status;
      if (status === 400) {
        const body = (err as any).body;
        const fields = body?.missingFields;
        setSubmitError(
          fields && Array.isArray(fields)
            ? `Missing required fields: ${fields.join(", ")}`
            : (err.message ?? "Validation failed — check required fields"),
        );
      } else if (status === 401) {
        setSubmitError("Session expired — please log in again");
      } else {
        setSubmitError(err.message ?? "Server error — please try again");
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
        <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
        <Text style={styles.errorText}>{error ?? "Inspection not found"}</Text>
      </View>
    );
  }

  // ---------- Derived data ----------

  const moistureReadings = inspection.moistureReadings ?? [];
  const affectedAreas = inspection.affectedAreas ?? [];
  const statusColor = STATUS_COLORS[inspection.status] ?? colors.muted;

  // ---------- Render ----------

  return (
    <View style={styles.root}>
      <NetworkBanner />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Inspection Header Card ---- */}
        <View style={[styles.headerCard, shadows.card]}>
          <View
            style={[styles.headerAccent, { backgroundColor: statusColor }]}
          />
          <View style={styles.headerBody}>
            <Text style={[styles.headerNum, { fontFamily: MONO }]}>
              #{inspection.inspectionNumber}
            </Text>
            <Text style={styles.headerAddress} numberOfLines={2}>
              {inspection.propertyAddress}
            </Text>
            <View style={styles.headerMeta}>
              <View
                style={[styles.statusPill, { borderColor: statusColor + "80" }]}
              >
                <View
                  style={[styles.statusDot, { backgroundColor: statusColor }]}
                />
                <Text style={[styles.statusPillText, { color: statusColor }]}>
                  {inspection.status}
                </Text>
              </View>
              <Text style={styles.headerDate}>
                {formatDate(inspection.inspectionDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* ---- Section 1: Environmental Data ---- */}
        <SectionCard title="Environmental Data" defaultOpen>
          <FieldInput
            label="Temperature °C"
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
            label="Dew Point °C — auto-calculated"
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
            <View style={styles.successRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={colors.success}
              />
              <Text style={styles.formSuccess}>Saved successfully</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={saveEnvironmental}
            disabled={envSaving}
            activeOpacity={0.8}
          >
            {envSaving ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.saveBtnText}>Save Environmental Data</Text>
            )}
          </TouchableOpacity>
        </SectionCard>

        {/* ---- Section 2: Moisture Readings ---- */}
        <SectionCard title="Moisture Readings" badge={moistureReadings.length}>
          {moistureReadings.map((r: MoistureReading) => (
            <View key={r.id} style={styles.dataRow}>
              <View
                style={[
                  styles.dataRowAccent,
                  { backgroundColor: colors.accent },
                ]}
              />
              <View style={styles.dataRowContent}>
                <Text style={styles.dataRowPrimary}>{r.location}</Text>
                <View style={styles.dataRowTags}>
                  <Text style={[styles.dataTag, { fontFamily: MONO }]}>
                    {r.moistureLevel}%
                  </Text>
                  <Text style={styles.dataTagDot}>·</Text>
                  <Text style={styles.dataTagText}>{r.surfaceType}</Text>
                  <Text style={styles.dataTagDot}>·</Text>
                  <Text style={styles.dataTagText}>{r.depth}</Text>
                </View>
              </View>
            </View>
          ))}

          {moistureReadings.length === 0 && !mrFormOpen && (
            <Text style={styles.emptyText}>No readings recorded yet</Text>
          )}

          {!mrFormOpen ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setMrFormOpen(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={styles.addBtnText}>Add Reading</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formBlock}>
              <FieldInput
                label="Location"
                value={mrLocation}
                onChangeText={setMrLocation}
                placeholder="e.g. Kitchen — North Wall"
              />

              <Text style={styles.chipLabel}>Surface Type</Text>
              <View style={styles.chipRow}>
                {SURFACE_TYPES.map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.chip, mrSurface === st && styles.chipActive]}
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

              <Text style={styles.chipLabel}>Depth</Text>
              <View style={styles.chipRow}>
                {DEPTH_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.chip,
                      styles.chipWide,
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

              {mrError ? <Text style={styles.formError}>{mrError}</Text> : null}

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
                  activeOpacity={0.8}
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
          {affectedAreas.map((a: AffectedArea) => {
            const srcColor =
              a.waterSource === "CLEAN"
                ? colors.accent
                : a.waterSource === "GREY"
                  ? colors.warning
                  : colors.error;
            return (
              <View key={a.id} style={styles.dataRow}>
                <View
                  style={[styles.dataRowAccent, { backgroundColor: srcColor }]}
                />
                <View style={styles.dataRowContent}>
                  <Text style={styles.dataRowPrimary}>{a.roomZoneId}</Text>
                  <View style={styles.dataRowTags}>
                    <Text style={[styles.dataTag, { fontFamily: MONO }]}>
                      {a.affectedSquareFootage} m²
                    </Text>
                    <Text style={styles.dataTagDot}>·</Text>
                    <Text style={[styles.dataTagText, { color: srcColor }]}>
                      {a.waterSource}
                    </Text>
                    {a.category ? (
                      <>
                        <Text style={styles.dataTagDot}>·</Text>
                        <Text style={styles.dataTagText}>Cat {a.category}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {affectedAreas.length === 0 && !aaFormOpen && (
            <Text style={styles.emptyText}>No areas recorded yet</Text>
          )}

          {!aaFormOpen ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setAaFormOpen(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={styles.addBtnText}>Add Area</Text>
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
                label="Affected Area (m²)"
                value={aaArea}
                onChangeText={setAaArea}
                placeholder="e.g. 12.5"
                keyboardType="decimal-pad"
              />

              <Text style={styles.chipLabel}>Water Source</Text>
              <View style={styles.chipRow}>
                {WATER_SOURCES.map((ws) => (
                  <TouchableOpacity
                    key={ws.value}
                    style={[
                      styles.chip,
                      styles.chipWide,
                      aaSource === ws.value && {
                        borderColor: ws.color,
                        backgroundColor: ws.color + "18",
                      },
                    ]}
                    onPress={() => setAaSource(ws.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        aaSource === ws.value && {
                          color: ws.color,
                          fontWeight: "700",
                        },
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

              {aaError ? <Text style={styles.formError}>{aaError}</Text> : null}

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
                  activeOpacity={0.8}
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
        <SectionCard title="Photos" badge={inspection.photos?.length}>
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
                      <Ionicons
                        name="image-outline"
                        size={22}
                        color={colors.textSecondary}
                      />
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

          {photoUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.uploadingText}>Uploading photo...</Text>
            </View>
          )}

          <View style={styles.photoActions}>
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={() => pickPhoto("camera")}
              disabled={photoUploading}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={18} color={colors.accent} />
              <Text style={styles.photoBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={() => pickPhoto("gallery")}
              disabled={photoUploading}
              activeOpacity={0.7}
            >
              <Ionicons name="images" size={18} color={colors.accent} />
              <Text style={styles.photoBtnText}>From Gallery</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* ---- Section 5: Submit ---- */}
        <SectionCard title="Submit">
          {(() => {
            const completion = checkTieredCompletion(inspection);
            const isAlreadySubmitted =
              submitted || inspection.status !== "DRAFT";

            return (
              <View>
                {completion.items.map((item) => (
                  <View key={item.label} style={styles.checkItem}>
                    <Ionicons
                      name={item.met ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={item.met ? colors.success : colors.border}
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

                <View style={styles.checkDivider} />

                {isAlreadySubmitted ? (
                  <View style={styles.statusMessageRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.accent}
                    />
                    <Text style={styles.submittedMsg}>
                      Inspection {inspection.status.toLowerCase()}
                    </Text>
                  </View>
                ) : completion.canSubmit ? (
                  <View style={styles.statusMessageRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={styles.readyMsg}>Ready to submit</Text>
                  </View>
                ) : (
                  <View style={styles.statusMessageRow}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color={colors.error}
                    />
                    <Text style={styles.notReadyMsg}>
                      Complete required fields to submit
                    </Text>
                  </View>
                )}

                <SyncStatusBar submitting={submitting} error={submitError} />

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
                  activeOpacity={0.8}
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
                      {isAlreadySubmitted
                        ? "Already Submitted"
                        : "Submit Inspection"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })()}
        </SectionCard>

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
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: {
    color: colors.error,
    fontSize: 15,
    textAlign: "center",
    fontWeight: "600",
  },

  // ---- Header card ----
  headerCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  headerAccent: {
    width: 6,
  },
  headerBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerNum: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  headerAddress: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 24,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  headerDate: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },

  // ---- Data rows ----
  dataRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  dataRowAccent: {
    width: 3,
  },
  dataRowContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 3,
  },
  dataRowPrimary: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  dataRowTags: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  dataTag: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: "700",
  },
  dataTagDot: {
    fontSize: 13,
    color: colors.border,
  },
  dataTagText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },

  // ---- Chips ----
  chipLabel: {
    fontSize: 11,
    color: colors.label,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  chipWide: {
    flex: 1,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },

  // ---- Form blocks ----
  formBlock: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  formError: {
    fontSize: 13,
    color: colors.error,
    marginBottom: spacing.sm,
    fontWeight: "600",
  },
  formSuccess: {
    fontSize: 13,
    color: colors.success,
    fontWeight: "600",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },

  // ---- Buttons ----
  saveBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: input.borderRadius,
    height: input.height,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.bg,
    letterSpacing: 0.2,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: input.borderRadius,
    height: input.height,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.accent + "60",
    borderRadius: input.borderRadius,
    height: 48,
    marginTop: spacing.sm,
    backgroundColor: colors.accentDim,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accent,
  },

  // ---- Photos ----
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoThumb: {
    width: 86,
    height: 86,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    color: colors.text,
    fontSize: 9,
    paddingHorizontal: 4,
    paddingVertical: 3,
    fontWeight: "600",
  },
  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  uploadingText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: "600",
  },
  photoActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.accent + "60",
    borderRadius: input.borderRadius,
    height: 48,
    backgroundColor: colors.accentDim,
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
  },

  // ---- Submit section ----
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 7,
  },
  checkLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  checkLabelMet: {
    color: colors.text,
    fontWeight: "600",
  },
  checkDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  statusMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  readyMsg: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.success,
  },
  notReadyMsg: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.error,
  },
  submittedMsg: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accent,
    textTransform: "capitalize",
  },
  submitBtn: {
    height: 58,
    backgroundColor: colors.accent,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.bg,
    letterSpacing: 0.2,
  },
  submitBtnTextDisabled: {
    color: colors.textSecondary,
  },
});
