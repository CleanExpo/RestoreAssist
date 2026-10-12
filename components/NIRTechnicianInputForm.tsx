"use client";

import { useState, useEffect, useRef } from "react";
import {
  Thermometer,
  Droplets,
  MapPin,
  Camera,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Save,
  ArrowRight,
  Loader2,
  Sparkles,
  ClipboardCheck,
  Trash2,
  Pencil,
  Upload,
  FileImage,
  Map,
  Shield,
  Zap,
  Eye,
  Locate,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { isRecentlyIssuedCreationKey } from "@/lib/creation-attempt-key";
import { prepareInspectionPhoto, uploadInspectionPhoto } from "@/lib/inspection-photo-upload";
import { apiErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import {
  buildAffectedAreaPayload,
  hydrateAffectedAreaDraft,
} from "@/lib/forms/affected-area-payload";
import {
  ROOM_TYPES,
  formatRoomZoneLabel,
  newRoomEntryId,
  nextRoomName,
} from "@/lib/forms/room-identity";
import { buildMoistureReadingDraftPayload } from "@/lib/forms/moisture-reading-draft-payload";
import {
  calculateClassificationPreview as computeClassificationPreview,
  manualClassificationPayload,
  resumedManualClassification,
} from "@/lib/forms/classification-preview";
import {
  fromNormalizedMoistureMapPoint,
  toNormalizedMoistureMapPoint,
} from "@/lib/nir-moisture-map-coordinates";
import { latestEnvironmentalReading } from "@/lib/inspections/latest-environmental-reading";
import { linkedReadingsAreaConflict, unlinkedReadingsAreaAmbiguity } from "@/lib/moisture/reading-room-join";
import {
  isCapacitorIOS,
  getCurrentLocation,
  fireHaptic,
  scheduleFollowUpReminder,
} from "@/lib/capacitor";
import MoistureMappingCanvas from "@/components/inspection/MoistureMappingCanvas";
import ClassificationSuggestion from "@/components/inspection/ClassificationSuggestion";
import ClaimTypePicker from "@/components/inspection/ClaimTypePicker";
import NIRClaimAssessmentPanel from "@/components/inspection/NIRClaimAssessmentPanel";
import { MakeSafeChecklist } from "@/components/inspection/MakeSafeChecklist";
import {
  asIicrcClaimType,
  isWaterDamageClaim,
  moistureReadingsRequired,
  type IicrcClaimType,
} from "@/lib/nir-standards-mapping";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NIRTechnicianInputFormProps {
  reportId?: string;
  /** Pre-fill form from guided interview (e.g. interviewData from URL) */
  initialData?: Record<string, unknown>;
  onComplete?: (inspectionId: string) => void;
  onCancel?: () => void;
}

// Surface types for moisture readings (dropdown only)
const SURFACE_TYPES = [
  "Drywall",
  "Wood",
  "Carpet",
  "Concrete",
  "Tile",
  "Vinyl",
  "Hardwood",
  "Particle Board",
  "Plaster",
  "Other",
];

// Water source types (dropdown only)
const WATER_SOURCES = ["Clean Water", "Grey Water", "Black Water"];

// Material types for affected areas
const MATERIAL_TYPES = [
  "Drywall",
  "Carpet",
  "Wood",
  "Tile",
  "Concrete",
  "Vinyl",
  "Hardwood",
  "Particle Board",
  "Plaster",
  "Insulation",
  "Ceiling",
  "Baseboards",
  "Other",
];

// Scope item types (checklist/dropdown only)
const SCOPE_ITEM_TYPES = [
  { id: "remove_carpet", label: "Remove Carpet" },
  { id: "sanitize_materials", label: "Sanitize Materials" },
  { id: "install_dehumidification", label: "Install Dehumidification" },
  { id: "install_air_movers", label: "Install Air Movers" },
  { id: "extract_standing_water", label: "Extract Standing Water" },
  { id: "demolish_drywall", label: "Demolish Drywall" },
  { id: "apply_antimicrobial", label: "Apply Antimicrobial Treatment" },
  { id: "dry_out_structure", label: "Dry Out Structure" },
  { id: "containment_setup", label: "Containment Setup" },
  { id: "ppe_required", label: "PPE Required" },
];

// Equipment types for scope items
const EQUIPMENT_TYPES = [
  "Air Mover",
  "LGR Dehumidifier",
  "Desiccant Dehumidifier",
  "Refrigerant Dehumidifier",
  "Air Scrubber",
  "Thermal Imaging Camera",
  "Moisture Meter",
  "Other",
];

// Water Category options for classification UI
const WATER_CATEGORIES = [
  {
    value: "1",
    label: "Category 1 - Clean Water",
    description: "Sanitary source, no contamination risk",
  },
  {
    value: "2",
    label: "Category 2 - Grey Water",
    description: "Significant contamination, may cause discomfort or sickness",
  },
  {
    value: "3",
    label: "Category 3 - Black Water",
    description: "Grossly contaminated, pathogenic agents present",
  },
];

// Water Class options for classification UI
const WATER_CLASSES = [
  {
    value: "1",
    label: "Class 1 - Slow Rate of Evaporation",
    description: "Minimal water absorption, low evaporation load",
  },
  {
    value: "2",
    label: "Class 2 - Fast Rate of Evaporation",
    description: "Water absorption into materials, moderate evaporation load",
  },
  {
    value: "3",
    label: "Class 3 - Fastest Rate of Evaporation",
    description: "Water absorption from overhead, high evaporation load",
  },
  {
    value: "4",
    label: "Class 4 - Specialty Drying Situations",
    description: "Deep water absorption, specialty drying required",
  },
];

// RA-7711: claim type and IICRC S500 water category/class for each Quick Fill
// template. Mould has no water classification.
const QUICK_FILL_CLASSIFICATION: Record<
  string,
  { claimType: IicrcClaimType; category?: string; waterClass?: string }
> = {
  "residential-burst-pipe": { claimType: "WATER", category: "1", waterClass: "2" },
  "commercial-hvac-failure": { claimType: "WATER", category: "1", waterClass: "3" },
  "mould-remediation": { claimType: "MOULD" },
  "storm-damage": { claimType: "WATER", category: "2", waterClass: "3" },
  "flood-damage": { claimType: "WATER", category: "3", waterClass: "3" },
};

export default function NIRTechnicianInputForm({
  reportId,
  initialData,
  onComplete,
  onCancel,
}: NIRTechnicianInputFormProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [creatingInspection, setCreatingInspection] = useState(false);
  const inspectionIdRef = useRef<string | null>(null);
  const inspectionCreationRef = useRef<{
    key: string;
    body: string;
    inFlight: Promise<string | null> | null;
  } | null>(null);
  const legacyUnresolvedKeyRef = useRef<string | null>(null);
  const [creationRecovery, setCreationRecovery] = useState<"idle" | "checking" | "retryable" | "legacy_missing" | "unresolved">("idle");
  const [recoveryCheck, setRecoveryCheck] = useState(0);
  const clientIdForCreation = typeof initialData?.clientId === "string" ? initialData.clientId : null;
  const legacyAttemptStorageKey = `ra.nir-inspection-attempt:${reportId ?? "standalone"}:${clientIdForCreation ?? "unlinked"}`;
  const attemptStorageKey = session?.user?.id
    ? `ra.nir-inspection-attempt:${session.user.id}:${reportId ?? "standalone"}:${clientIdForCreation ?? "unlinked"}`
    : null;
  const legacyDismissedStorageKey = attemptStorageKey ? `${attemptStorageKey}:legacy-dismissed` : null;

  // A remount has lost the original request body. Recover only its opaque
  // key from storage, then ask the server for an owner-scoped committed ID.
  useEffect(() => {
    if (!attemptStorageKey) {
      setCreationRecovery("checking");
      return;
    }
    let key: string | null;
    let usingLegacy = false;
    try {
      key = sessionStorage.getItem(attemptStorageKey);
      // Older builds stored the opaque key without a user ID. Read it only
      // when this user has no scoped key; never copy an unverified key into
      // another signed-in user's namespace.
      if (!key) {
        const legacyKey = sessionStorage.getItem(legacyAttemptStorageKey);
        if (legacyKey && legacyKey !== sessionStorage.getItem(legacyDismissedStorageKey!)) {
          key = legacyKey;
          usingLegacy = true;
        }
      }
    } catch {
      setCreationRecovery("unresolved");
      return;
    }
    if (!key) {
      legacyUnresolvedKeyRef.current = null;
      setCreationRecovery("idle");
      return;
    }
    let cancelled = false;
    setCreationRecovery("checking");
    const recover = async () => {
      try {
        const query = new URLSearchParams({ creationStatus: "1" });
        if (reportId) query.set("reportId", reportId);
        if (clientIdForCreation) query.set("clientId", clientIdForCreation);
        const response = await fetch(`/api/inspections?${query}`, {
          headers: { "Idempotency-Key": key },
        });
        if (!response.ok) throw new Error("Inspection recovery read failed");
        const result = await response.json();
        if (cancelled) return;
        const saved = result.inspection;
        const savedClaimType = asIicrcClaimType(saved?.claimType);
        if (result.state === "complete" && typeof saved?.id === "string" &&
            savedClaimType && typeof saved.propertyAddress === "string" &&
            typeof saved.propertyPostcode === "string") {
          setClaimType(savedClaimType);
          setPropertyAddress(saved.propertyAddress);
          setPropertyPostcode(saved.propertyPostcode);
          setInspectionDate(typeof saved.inspectionDate === "string" ? saved.inspectionDate.slice(0, 10) : "");
          setDamageDescription(typeof saved.lossDescription === "string" ? saved.lossDescription : "");
          setTechnicianName(typeof saved.technicianName === "string" ? saved.technicianName : "");
          inspectionIdRef.current = saved.id;
          setInspectionId(saved.id);
          try { sessionStorage.removeItem(attemptStorageKey); } catch { /* saved ID is verified */ }
          try {
            if (sessionStorage.getItem(legacyAttemptStorageKey) === key) sessionStorage.removeItem(legacyAttemptStorageKey);
          } catch { /* saved ID is verified */ }
          setCreationRecovery("idle");
        } else if (result.state === "rejected") {
          try {
            sessionStorage.removeItem(attemptStorageKey);
            if (sessionStorage.getItem(legacyAttemptStorageKey) === key) sessionStorage.removeItem(legacyAttemptStorageKey);
            setCreationRecovery("idle");
          } catch {
            setCreationRecovery("unresolved");
          }
        } else if (usingLegacy && (result.state === "retryable_missing" || result.state === "missing")) {
          legacyUnresolvedKeyRef.current = key;
          setCreationRecovery("legacy_missing");
        } else if (result.state === "retryable_missing") {
          setCreationRecovery("retryable");
        } else {
          setCreationRecovery("unresolved");
        }
      } catch {
        if (!cancelled) setCreationRecovery("unresolved");
      }
    };
    void recover();
    return () => { cancelled = true; };
  }, [attemptStorageKey, legacyAttemptStorageKey, legacyDismissedStorageKey, reportId, clientIdForCreation, recoveryCheck]);

  const dismissUnverifiedLegacyAttempt = () => {
    const legacyKey = legacyUnresolvedKeyRef.current;
    if (!legacyKey || !attemptStorageKey || !legacyDismissedStorageKey) return;
    if (!window.confirm("Check your existing inspections first. A previous draft may have been saved. Start a new draft only if you found no matching job. Continue?")) return;
    try {
      if (sessionStorage.getItem(legacyAttemptStorageKey) !== legacyKey ||
          sessionStorage.getItem(attemptStorageKey)) {
        setRecoveryCheck((value) => value + 1);
        return;
      }
      // Keep the old pointer intact for the original user of a shared tab.
      sessionStorage.setItem(legacyDismissedStorageKey, legacyKey);
      if (sessionStorage.getItem(legacyDismissedStorageKey) !== legacyKey) throw new Error("Reset was not retained");
      legacyUnresolvedKeyRef.current = null;
      setCreationRecovery("idle");
    } catch {
      setCreationRecovery("unresolved");
    }
  };

  // Environmental Data
  const [environmentalData, setEnvironmentalData] = useState<{
    ambientTemperature: number | null;
    humidityLevel: number | null;
    dewPoint: number | null;
    airCirculation: boolean;
    weatherConditions: string;
  }>({
    ambientTemperature: null,
    humidityLevel: null,
    dewPoint: null,
    airCirculation: false,
    weatherConditions: "",
  });
  const measuredEnvironmentalData =
    environmentalData.ambientTemperature !== null &&
    environmentalData.humidityLevel !== null
      ? {
          ...environmentalData,
          ambientTemperature: environmentalData.ambientTemperature,
          humidityLevel: environmentalData.humidityLevel,
        }
      : null;
  const hasPartialEnvironmentalData =
    (environmentalData.ambientTemperature === null) !==
    (environmentalData.humidityLevel === null);
  const partialEnvironmentalMessage =
    "Enter both temperature and humidity, or clear both before saving.";

  // Moisture Readings
  const [moistureReadings, setMoistureReadings] = useState<
    Array<{
      id: string;
      location: string;
      surfaceType: string;
      moistureLevel: number;
      depth: "Surface" | "Subsurface";
      sketchRoomId?: string | null;
      isBaseline?: boolean;
      isMonitoringPoint?: boolean;
      // Loaded with the reading so the classification preview can match a
      // linked reading to its room, as submit does (RA-7610).
      sketchRoom?: { id: string; name: string } | null;
    }>
  >([]);
  // B23: the reading and environmental rows this form loaded or has saved.
  // Draft save deletes only these, so a reading captured on another screen
  // after the form opened is never erased.
  const savedReadingIds = useRef<Set<string>>(new Set());
  const savedEnvironmentalId = useRef<string | null>(null);

  // Moisture Mapping (Visual Floor Plan)
  const [moistureMapPoints, setMoistureMapPoints] = useState<
    Array<{
      id: string;
      x: number;
      y: number;
      reading: {
        id: string;
        location: string;
        surfaceType: string;
        moistureLevel: number;
        depth: string;
        notes: string | null;
      };
    }>
  >([]);
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState<string | null>(
    null,
  );

  const [newMoistureReading, setNewMoistureReading] = useState({
    location: "",
    surfaceType: SURFACE_TYPES[0],
    moistureLevel: 0,
    depth: "Surface" as "Surface" | "Subsurface",
  });

  // Affected Areas
  const [affectedAreas, setAffectedAreas] = useState<
    Array<{
      id: string;
      roomZoneId: string;
      roomType: string;
      customRoomName?: string;
      length: number;
      width: number;
      height: number;
      affectedSquareFootage: number;
      materials: string[];
      waterSource: string;
      timeSinceLoss: number | null;
      originalDescription?: string | null;
      detailsKnown?: boolean;
    }>
  >([]);

  const [editingAffectedAreaId, setEditingAffectedAreaId] = useState<string | null>(null);
  const [recalculateAffectedArea, setRecalculateAffectedArea] = useState(false);

  const [newAffectedArea, setNewAffectedArea] = useState({
    roomType: ROOM_TYPES[0] as string,
    roomName: "",
    length: 0,
    width: 0,
    height: 2.7, // Default ceiling height
    affectedSquareFootage: 0,
    materials: [] as string[],
    waterSource: WATER_SOURCES[0],
    timeSinceLoss: 0 as number | null,
    originalDescription: null as string | null,
  });

  // Scope Items (checklist)
  const [selectedScopeItems, setSelectedScopeItems] = useState<Set<string>>(
    new Set(),
  );
  const [scopeItemSpecs, setScopeItemSpecs] = useState<Record<string, string>>(
    {},
  );

  // Manual Classification (optional override)
  const [manualClassification, setManualClassification] = useState<{
    category: string;
    class: string;
  } | null>(null);

  // RA-7709: true once the form has held a complete choice this session
  // (restored on resume or picked). Clearing it afterwards is then sent as an
  // explicit clear; a form that never had one leaves the field out.
  const hadManualChoice = useRef(false);
  // RA-7744: the temperature/humidity a saved dew point was loaded with.
  const hydratedDewPointInputs = useRef<{
    ambientTemperature: number | null;
    humidityLevel: number | null;
  } | null>(null);
  useEffect(() => {
    if (manualClassification?.category && manualClassification.class) {
      hadManualChoice.current = true;
    }
  }, [manualClassification]);

  // Damage description — feeds the auto-classifier
  const [damageDescription, setDamageDescription] = useState("");

  // Equipment Selection
  const [equipmentSelection, setEquipmentSelection] = useState<
    Array<{
      id: string;
      type: string;
      quantity: number;
    }>
  >([]);

  const [newEquipment, setNewEquipment] = useState({
    type: "Air Mover",
    quantity: 1,
  });

  // Drying Duration
  const [dryingDuration, setDryingDuration] = useState(4); // days

  // Photos - Store uploaded photo URLs from Cloudinary
  const [photos, setPhotos] = useState<
    Array<{
      id: string;
      url: string;
      file: File | null;
      originalFile?: File | null;
      uploading?: boolean;
      prepared?: boolean;
      retryKey?: string;
      error?: string | null;
    }>
  >([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoWorkCount = useRef(0);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const verifiedPhotoCount = photos.filter((photo) =>
    Boolean(photo.url) && !photo.uploading && !photo.error && photo.id !== deletingPhotoId,
  ).length;

  // Claim type — IICRC standard that governs this job. Picked BEFORE evidence
  // capture starts so the correct field surface renders (RA-1029 P1 #7).
  const [claimType, setClaimType] = useState<IicrcClaimType | null>(null);

  // Property Address (required)
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyPostcode, setPropertyPostcode] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");

  // RA-1842 — Native iOS only: surface "Use my current location" button so
  // App Review can observe meaningful native functionality (Guideline 4.2).
  const [isNativeIOS, setIsNativeIOS] = useState(false);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    setIsNativeIOS(isCapacitorIOS());
  }, []);

  const handleUseCurrentLocation = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentLocation();
      if (!coords) {
        await fireHaptic("warning");
        toast.error(
          "Couldn't get your location. Check Location permission in Settings.",
        );
        return;
      }
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "json");
      url.searchParams.set("lat", String(coords.latitude));
      url.searchParams.set("lon", String(coords.longitude));
      url.searchParams.set("addressdetails", "1");
      const res = await fetch(url.toString(), {
        headers: { "Accept-Language": "en-AU" },
      });
      if (!res.ok) throw new Error("reverse_geocode_failed");
      const data = (await res.json()) as {
        display_name?: string;
        address?: { postcode?: string };
      };
      if (data.display_name) setPropertyAddress(data.display_name);
      if (data.address?.postcode) setPropertyPostcode(data.address.postcode);
      await fireHaptic("success");
      toast.success("Location captured");
    } catch {
      await fireHaptic("warning");
      toast.error("Couldn't reverse-geocode that location");
    } finally {
      setLocating(false);
    }
  };
  const [technicianName, setTechnicianName] = useState("");

  // Validation state
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  // Review/Summary step
  const [showReview, setShowReview] = useState(false);

  // Quick Fill feature
  const [showQuickFillModal, setShowQuickFillModal] = useState(false);
  const [quickFillCredits, setQuickFillCredits] = useState<number | null>(null);
  const [hasUnlimitedQuickFill, setHasUnlimitedQuickFill] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Quick Fill Use Cases for NIR
  const nirUseCases = [
    {
      id: "residential-burst-pipe",
      name: "Residential Burst Pipe",
      description:
        "Standard residential water damage from burst pipe affecting master bedroom and ensuite",
    },
    {
      id: "commercial-hvac-failure",
      name: "Commercial HVAC Failure",
      description:
        "Large-scale commercial office water damage from HVAC system failure",
    },
    {
      id: "mould-remediation",
      name: "Mould Remediation",
      description:
        "Residential property with extensive mould growth due to long-term moisture",
    },
    {
      id: "storm-damage",
      name: "Storm Damage - Roof Leak",
      description:
        "Residential property with water damage from severe storm causing roof penetration",
    },
    {
      id: "flood-damage",
      name: "Flood Damage - Category 3",
      description:
        "Severe flood damage from overflowing river affecting ground floor",
    },
  ];

  const populateQuickFillData = (useCaseId: string) => {
    let useCaseData: any;

    switch (useCaseId) {
      case "residential-burst-pipe":
        useCaseData = {
          propertyAddress: "123 Main Street, Suburb, NSW 2000",
          propertyPostcode: "2000",
          technicianName: "Mark O'Connor",
          environmentalData: {
            ambientTemperature: 22,
            humidityLevel: 65,
            dewPoint: 15.2,
            airCirculation: true,
          },
          moistureReadings: [
            {
              id: Date.now().toString(),
              location: "Master Bedroom - Floor",
              surfaceType: "Carpet",
              moistureLevel: 45.5,
              depth: "Surface",
            },
            {
              id: (Date.now() + 1).toString(),
              location: "Master Bedroom - Wall",
              surfaceType: "Drywall",
              moistureLevel: 38.2,
              depth: "Subsurface",
            },
            {
              id: (Date.now() + 2).toString(),
              location: "Ensuite - Floor",
              surfaceType: "Tile",
              moistureLevel: 52.1,
              depth: "Surface",
            },
            {
              id: (Date.now() + 3).toString(),
              location: "Ensuite - Wall",
              surfaceType: "Drywall",
              moistureLevel: 41.8,
              depth: "Subsurface",
            },
          ],
          affectedAreas: [
            {
              id: newRoomEntryId(),
              roomZoneId: "Master Bedroom",
              roomType: "Master Bedroom",
              length: 5.5,
              width: 4.0,
              height: 2.7,
              affectedSquareFootage: 22.0,
              materials: ["Carpet", "Drywall"],
              waterSource: "Clean Water",
              timeSinceLoss: 24,
            },
            {
              id: newRoomEntryId(),
              roomZoneId: "Ensuite",
              roomType: "Ensuite",
              length: 3.0,
              width: 2.5,
              height: 2.4,
              affectedSquareFootage: 7.5,
              materials: ["Tile", "Drywall"],
              waterSource: "Clean Water",
              timeSinceLoss: 24,
            },
          ],
          selectedScopeItems: new Set([
            "remove_carpet",
            "extract_standing_water",
            "install_dehumidification",
            "install_air_movers",
            "demolish_drywall",
            "apply_antimicrobial",
            "dry_out_structure",
          ]),
          equipmentSelection: [
            {
              id: Date.now().toString(),
              type: "LGR Dehumidifier",
              quantity: 2,
            },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 4 },
          ],
          dryingDuration: 4,
        };
        break;
      case "commercial-hvac-failure":
        useCaseData = {
          propertyAddress: "456 Business Park Drive, Melbourne VIC 3000",
          propertyPostcode: "3000",
          technicianName: "David Chen",
          environmentalData: {
            ambientTemperature: 24,
            humidityLevel: 70,
            dewPoint: 18.1,
            airCirculation: false,
          },
          moistureReadings: [
            {
              id: Date.now().toString(),
              location: "3rd Floor - Office Area - Ceiling",
              surfaceType: "Drywall",
              moistureLevel: 58.3,
              depth: "Subsurface",
            },
            {
              id: (Date.now() + 1).toString(),
              location: "3rd Floor - Server Room - Floor",
              surfaceType: "Concrete",
              moistureLevel: 42.1,
              depth: "Surface",
            },
            {
              id: (Date.now() + 2).toString(),
              location: "2nd Floor - Office Area - Wall",
              surfaceType: "Drywall",
              moistureLevel: 35.7,
              depth: "Subsurface",
            },
          ],
          affectedAreas: [
            {
              id: newRoomEntryId(),
              roomZoneId: "3rd Floor - Office Area",
              roomType: "Other",
              customRoomName: "3rd Floor - Office Area",
              length: 15.0,
              width: 10.0,
              height: 3.0,
              affectedSquareFootage: 150.0,
              materials: ["Drywall", "Carpet"],
              waterSource: "Clean Water",
              timeSinceLoss: 12,
            },
          ],
          selectedScopeItems: new Set([
            "extract_standing_water",
            "install_dehumidification",
            "install_air_movers",
            "demolish_drywall",
            "containment_setup",
            "ppe_required",
          ]),
          equipmentSelection: [
            {
              id: Date.now().toString(),
              type: "LGR Dehumidifier",
              quantity: 3,
            },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 8 },
          ],
          dryingDuration: 7,
        };
        break;
      case "mould-remediation":
        useCaseData = {
          propertyAddress: "789 Oak Street, Brisbane QLD 4000",
          propertyPostcode: "4000",
          technicianName: "Emma Thompson",
          environmentalData: {
            ambientTemperature: 26,
            humidityLevel: 75,
            dewPoint: 21.2,
            airCirculation: false,
          },
          moistureReadings: [
            {
              id: Date.now().toString(),
              location: "Bathroom - Wall Behind Shower",
              surfaceType: "Drywall",
              moistureLevel: 62.4,
              depth: "Subsurface",
            },
            {
              id: (Date.now() + 1).toString(),
              location: "Bathroom - Ceiling",
              surfaceType: "Plaster",
              moistureLevel: 55.8,
              depth: "Subsurface",
            },
            {
              id: (Date.now() + 2).toString(),
              location: "Laundry - Wall",
              surfaceType: "Drywall",
              moistureLevel: 48.2,
              depth: "Subsurface",
            },
          ],
          affectedAreas: [
            {
              id: newRoomEntryId(),
              roomZoneId: "Bathroom",
              roomType: "Bathroom",
              length: 3.5,
              width: 2.5,
              height: 2.4,
              affectedSquareFootage: 8.75,
              materials: ["Drywall", "Plaster"],
              waterSource: "Grey Water",
              timeSinceLoss: 720,
            },
          ],
          selectedScopeItems: new Set([
            "demolish_drywall",
            "apply_antimicrobial",
            "containment_setup",
            "ppe_required",
            "sanitize_materials",
          ]),
          equipmentSelection: [
            {
              id: Date.now().toString(),
              type: "Desiccant Dehumidifier",
              quantity: 2,
            },
            { id: (Date.now() + 1).toString(), type: "Air Mover", quantity: 6 },
          ],
          dryingDuration: 10,
        };
        break;
      default:
        useCaseData = {};
    }

    // Populate form with use case data
    if (useCaseData.propertyAddress)
      setPropertyAddress(useCaseData.propertyAddress);
    if (useCaseData.propertyPostcode)
      setPropertyPostcode(useCaseData.propertyPostcode);
    if (useCaseData.technicianName)
      setTechnicianName(useCaseData.technicianName);
    if (useCaseData.environmentalData)
      setEnvironmentalData(useCaseData.environmentalData);
    if (useCaseData.moistureReadings)
      setMoistureReadings(
        useCaseData.moistureReadings.map((reading: { id: string }) => ({
          ...reading,
          id: crypto.randomUUID(),
        })),
      );
    if (useCaseData.affectedAreas) setAffectedAreas(useCaseData.affectedAreas);
    if (useCaseData.selectedScopeItems)
      setSelectedScopeItems(useCaseData.selectedScopeItems);
    if (useCaseData.equipmentSelection)
      setEquipmentSelection(useCaseData.equipmentSelection);
    if (useCaseData.dryingDuration)
      setDryingDuration(useCaseData.dryingDuration);

    // RA-7711: the template carries its claim type and, for water claims, the
    // IICRC category and class, so the filled form is classified.
    const classification = QUICK_FILL_CLASSIFICATION[useCaseId];
    if (classification) {
      setClaimType(classification.claimType);
      setManualClassification(
        classification.category && classification.waterClass
          ? {
              category: classification.category,
              class: classification.waterClass,
            }
          : null,
      );
    }

    setShowQuickFillModal(false);
    toast.success("Quick Fill data populated successfully!");
  };

  // Pre-fill form from guided interview (e.g. inspections/new?interviewData=...)
  useEffect(() => {
    if (!initialData || Object.keys(initialData).length === 0) return;
    if (typeof initialData.propertyAddress === "string")
      setPropertyAddress(initialData.propertyAddress);
    if (typeof initialData.propertyPostcode === "string")
      setPropertyPostcode(initialData.propertyPostcode);
    if (typeof initialData.inspectionDate === "string")
      setInspectionDate(initialData.inspectionDate.slice(0, 10));
    if (typeof initialData.damageDescription === "string")
      setDamageDescription(initialData.damageDescription);
    const initialClaim = asIicrcClaimType(
      typeof initialData.claimType === "string" ? initialData.claimType : null,
    );
    if (initialClaim) setClaimType(initialClaim);
    if (typeof initialData.technicianName === "string")
      setTechnicianName(initialData.technicianName);
    // Ambient temperature: interview sends ambientTemperature (from mapping) or temperatureCurrent
    const tempRaw =
      initialData.ambientTemperature ?? initialData.temperatureCurrent;
    if (typeof tempRaw === "number" && !Number.isNaN(tempRaw))
      setEnvironmentalData((prev) => ({
        ...prev,
        ambientTemperature: tempRaw,
      }));
    else if (typeof tempRaw === "string") {
      const t = parseFloat(tempRaw);
      if (!Number.isNaN(t))
        setEnvironmentalData((prev) => ({ ...prev, ambientTemperature: t }));
    }
    // Humidity: interview sends humidityLevel (from mapping) or humidityCurrent
    const humidityRaw =
      initialData.humidityLevel ?? initialData.humidityCurrent;
    if (typeof humidityRaw === "number" && !Number.isNaN(humidityRaw))
      setEnvironmentalData((prev) => ({ ...prev, humidityLevel: humidityRaw }));
    else if (typeof humidityRaw === "string") {
      const h = parseFloat(humidityRaw);
      if (!Number.isNaN(h))
        setEnvironmentalData((prev) => ({ ...prev, humidityLevel: h }));
    }
    if (
      typeof initialData.dewPoint === "number" ||
      typeof initialData.dewPoint === "string"
    ) {
      const d =
        typeof initialData.dewPoint === "string"
          ? parseFloat(initialData.dewPoint)
          : initialData.dewPoint;
      if (!Number.isNaN(d))
        setEnvironmentalData((prev) => ({ ...prev, dewPoint: d }));
    }
    if (typeof initialData.airCirculation === "boolean")
      setEnvironmentalData((prev) => ({
        ...prev,
        airCirculation: initialData.airCirculation as boolean,
      }));
    if (typeof initialData.weatherConditions === "string")
      setEnvironmentalData((prev) => ({
        ...prev,
        weatherConditions: initialData.weatherConditions as string,
      }));
    // RA-7709: interview answers (initialData.waterCategory / waterClass) are
    // not seeded into the manual override. They come from the interview's own
    // derivation, and seeding them recorded an untouched submit as a
    // "Technician manual classification override". The technician's own
    // choice is made with the Category / Class selectors below.
  }, [initialData]);

  // Initialize inspection if reportId provided
  useEffect(() => {
    if (reportId && !inspectionId) {
      initializeInspection();
    }
  }, [reportId]);

  // Fetch Quick Fill credits on mount
  useEffect(() => {
    const fetchQuickFillCredits = async () => {
      try {
        const response = await fetch("/api/user/quick-fill-credits");
        if (response.ok) {
          const data = await response.json();
          setQuickFillCredits(data.creditsRemaining);
          setHasUnlimitedQuickFill(data.hasUnlimited || false);
        }
      } catch (error) {
        // Non-fatal: credits display will fall back to 0
        console.error("Failed to fetch Quick Fill credits:", error);
      }
    };
    fetchQuickFillCredits();
  }, []);

  const initializeInspection = async () => {
    if (!reportId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/inspections?reportId=${reportId}`, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.inspection) {
          inspectionIdRef.current = data.inspection.id;
          setInspectionId(data.inspection.id);
          // Load existing data
          // RA-7740: the API returns environmentalData as a LIST of readings
          // (EnvironmentalData[]); this form holds one reading. Load the
          // latest; an empty list keeps measurements unknown.
          const latestReading = latestEnvironmentalReading(
            data.inspection.environmentalData,
          );
          savedEnvironmentalId.current = latestReading?.id ?? null;
          savedReadingIds.current = new Set(
            (data.inspection.moistureReadings ?? []).map(
              (reading: { id: string }) => reading.id,
            ),
          );
          if (latestReading) {
            // RA-7744: a recorded dew point stays as recorded. Remember the
            // temperature/humidity it was saved with; the calculation below
            // only runs once the technician changes one of them.
            if (latestReading.dewPoint != null) {
              hydratedDewPointInputs.current = {
                ambientTemperature: latestReading.ambientTemperature,
                humidityLevel: latestReading.humidityLevel,
              };
            }
            setEnvironmentalData((prev) => ({
              ambientTemperature:
                latestReading.ambientTemperature ?? prev.ambientTemperature,
              humidityLevel: latestReading.humidityLevel ?? prev.humidityLevel,
              dewPoint: latestReading.dewPoint ?? prev.dewPoint,
              airCirculation:
                latestReading.airCirculation ?? prev.airCirculation,
              weatherConditions:
                latestReading.weatherConditions ?? prev.weatherConditions,
            }));
          }
          if (data.inspection.moistureReadings) {
            setMoistureReadings(data.inspection.moistureReadings);

            // Load moisture map points if coordinates exist
            const pointsWithCoords = data.inspection.moistureReadings
              .filter((r: any) => r.mapX !== null && r.mapY !== null)
              .map((r: any) => {
                const point = fromNormalizedMoistureMapPoint({
                  mapX: r.mapX,
                  mapY: r.mapY,
                });
                return {
                  id: r.id,
                  ...point,
                  reading: {
                    id: r.id,
                    location: r.location,
                    surfaceType: r.surfaceType,
                    moistureLevel: r.moistureLevel,
                    depth: r.depth,
                    notes: r.notes || null,
                  },
                };
              });
            setMoistureMapPoints(pointsWithCoords);
          }

          if (data.inspection.floorPlanImageUrl) {
            setFloorPlanImageUrl(data.inspection.floorPlanImageUrl);
          }

          // Load photos
          if (data.inspection.photos && Array.isArray(data.inspection.photos)) {
            const loadedPhotos = data.inspection.photos.map((photo: any) => ({
              id: photo.id,
              url: photo.url,
              file: null,
              uploading: false,
            }));
            setPhotos(loadedPhotos);
          }
          if (data.inspection.affectedAreas) {
            setAffectedAreas(
              data.inspection.affectedAreas.map(hydrateAffectedAreaDraft),
            );
          }
          if (data.inspection.scopeItems) {
            const selected = new Set<string>(
              data.inspection.scopeItems.map(
                (item: any) => item.itemType as string,
              ),
            );
            setSelectedScopeItems(selected);
          }
          if (data.inspection.propertyAddress) {
            setPropertyAddress(data.inspection.propertyAddress);
          }
          if (data.inspection.propertyPostcode) {
            setPropertyPostcode(data.inspection.propertyPostcode);
          }
          if (data.inspection.technicianName) {
            setTechnicianName(data.inspection.technicianName);
          }
          setInspectionDate(data.inspection.inspectionDate?.slice(0, 10) ?? "");
          setDamageDescription(data.inspection.lossDescription ?? "");
          const resumedChoice = resumedManualClassification(data.inspection);
          if (resumedChoice) {
            setManualClassification(resumedChoice);
          }
          const hydratedClaim = asIicrcClaimType(data.inspection.claimType);
          if (hydratedClaim) {
            setClaimType(hydratedClaim);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load inspection data", error);
    } finally {
      setLoading(false);
    }
  };

  const linkedAreaConflict = linkedReadingsAreaConflict(moistureReadings, affectedAreas);
  const unlinkedAreaAmbiguity = unlinkedReadingsAreaAmbiguity(moistureReadings, affectedAreas);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!claimType) {
      errors.claimType =
        "Claim type is required — select the IICRC standard that governs this job";
    }

    if (!propertyAddress.trim()) {
      errors.propertyAddress = "Property address is required";
    }

    if (!propertyPostcode.trim()) {
      errors.propertyPostcode = "Property postcode is required";
    }

    if (moistureReadingsRequired(claimType) && moistureReadings.length === 0) {
      errors.moistureReadings = "At least one moisture reading is required";
    }

    if (affectedAreas.length === 0) {
      errors.affectedAreas = "At least one affected area is required";
    } else {
      // Validate each area has materials
      const areasWithoutMaterials = affectedAreas.filter(
        (a) => !a.materials || a.materials.length === 0,
      );
      if (areasWithoutMaterials.length > 0) {
        errors.affectedAreas =
          "All affected areas must have materials recorded. Edit any area with missing details.";
      } else if (affectedAreas.some((a) => a.length <= 0 || a.width <= 0 || a.height <= 0)) {
        errors.affectedAreas =
          "All affected areas need dimensions. Edit any area with missing details.";
      }
    }
    if (linkedAreaConflict) {
      errors.affectedAreas ??=
        "Each drawn room with linked moisture readings must match its own affected area. Review room links and make area names unique before submitting.";
    }
    if (unlinkedAreaAmbiguity) {
      errors.affectedAreas ??=
        "A location-only moisture reading may refer to a renamed area. Review its location and the affected area name before submitting.";
    }

    // Photos are optional during initial save, but will be validated before final submission
    // Validate that all photos are uploaded (not still uploading) if any photos exist
    const stillUploading = uploadingPhotos || photos.some((p) => p.uploading);
    if (deletingPhotoId) {
      errors.photos = "Please wait for photo removal to finish";
    } else if (stillUploading) {
      errors.photos = "Please wait for all photos to finish uploading";
    } else if (photos.some((photo) => photo.file && photo.error)) {
      errors.photos = "Retry or remove failed photos before submitting";
    }

    // Validate environmental data ranges
    if (
      (environmentalData.ambientTemperature !== null &&
        (environmentalData.ambientTemperature < -20 ||
          environmentalData.ambientTemperature > 55))
    ) {
      errors.temperature = "Temperature must be between -20°C and 55°C";
    }

    if (
      (environmentalData.humidityLevel !== null &&
        (environmentalData.humidityLevel < 0 ||
          environmentalData.humidityLevel > 100))
    ) {
      errors.humidity = "Humidity must be between 0% and 100%";
    }
    if (hasPartialEnvironmentalData) {
      errors.temperature = partialEnvironmentalMessage;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddMoistureReading = () => {
    if (!newMoistureReading.location.trim()) {
      toast.error("Please enter a location");
      return;
    }

    if (
      newMoistureReading.moistureLevel < 0 ||
      newMoistureReading.moistureLevel > 100
    ) {
      toast.error("Moisture level must be between 0% and 100%");
      return;
    }

    setMoistureReadings([
      ...moistureReadings,
      {
        id: crypto.randomUUID(),
        ...newMoistureReading,
      },
    ]);

    setNewMoistureReading({
      location: "",
      surfaceType: SURFACE_TYPES[0],
      moistureLevel: 0,
      depth: "Surface",
    });

    toast.success("Moisture reading added");
  };

  const handleRemoveMoistureReading = (id: string) => {
    setMoistureReadings(moistureReadings.filter((r) => r.id !== id));
    toast.success("Moisture reading removed");
  };

  // Calculate area from dimensions
  const calculateArea = (length: number, width: number): number => {
    return length * width;
  };

  // Handle material toggle
  const handleMaterialToggle = (material: string) => {
    const currentMaterials = newAffectedArea.materials;
    if (currentMaterials.includes(material)) {
      setNewAffectedArea({
        ...newAffectedArea,
        materials: currentMaterials.filter((m) => m !== material),
      });
    } else {
      setNewAffectedArea({
        ...newAffectedArea,
        materials: [...currentMaterials, material],
      });
    }
  };

  // Update area when dimensions change
  useEffect(() => {
    if (newAffectedArea.length > 0 && newAffectedArea.width > 0) {
      const calculatedArea = calculateArea(
        newAffectedArea.length,
        newAffectedArea.width,
      );
      setNewAffectedArea((prev) => ({
        ...prev,
        affectedSquareFootage: calculatedArea,
      }));
    }
  }, [newAffectedArea.length, newAffectedArea.width]);

  const handleAddAffectedArea = () => {
    const editingArea = editingAffectedAreaId
      ? affectedAreas.find((area) => area.id === editingAffectedAreaId)
      : undefined;
    if (editingAffectedAreaId && !editingArea) {
      toast.error("The area being edited is no longer available");
      return;
    }
    const roomName = formatRoomZoneLabel(
      newAffectedArea.roomType,
      newAffectedArea.roomName,
    );

    if (!roomName) {
      toast.error("Please select or enter a room name");
      return;
    }
    if (roomName.length > 200) {
      toast.error("Room name must be 200 characters or fewer");
      return;
    }

    if (
      affectedAreas.some(
        (area) =>
          area.id !== editingAffectedAreaId &&
          area.roomZoneId.trim().toLocaleLowerCase() ===
          roomName.toLocaleLowerCase(),
      )
    ) {
      toast.error("This room name already exists. Enter a distinct name or number.");
      return;
    }

    if (newAffectedArea.length <= 0 || newAffectedArea.width <= 0) {
      toast.error("Please enter valid length and width dimensions");
      return;
    }

    if (newAffectedArea.height <= 0) {
      toast.error("Please enter a valid height dimension");
      return;
    }

    if (newAffectedArea.materials.length === 0) {
      toast.error("Please select at least one affected material");
      return;
    }

    const calculatedArea = calculateArea(
      newAffectedArea.length,
      newAffectedArea.width,
    );

    const savedArea = {
      ...editingArea,
      id: editingArea?.id ?? newRoomEntryId(),
      roomZoneId: roomName,
      roomType: newAffectedArea.roomType,
      customRoomName: newAffectedArea.roomName.trim() || undefined,
      length: newAffectedArea.length,
      width: newAffectedArea.width,
      height: newAffectedArea.height,
      affectedSquareFootage: editingArea && !recalculateAffectedArea
        ? editingArea.affectedSquareFootage
        : calculatedArea,
      materials: [...newAffectedArea.materials],
      waterSource: newAffectedArea.waterSource,
      timeSinceLoss: newAffectedArea.timeSinceLoss,
      originalDescription: newAffectedArea.originalDescription,
      detailsKnown: true,
    };
    if ((buildAffectedAreaPayload(savedArea).description?.length ?? 0) > 2000) {
      toast.error("Existing area note is too long with dimensions. Shorten it in the note field before updating.");
      return;
    }
    setAffectedAreas(editingArea
      ? affectedAreas.map((area) => area.id === editingArea.id ? savedArea : area)
      : [...affectedAreas, savedArea]);
    setEditingAffectedAreaId(null);
    setRecalculateAffectedArea(false);

    setNewAffectedArea({
      roomType: ROOM_TYPES[0],
      roomName: nextRoomName(
        ROOM_TYPES[0],
        [...affectedAreas.map((area) => area.roomZoneId), roomName],
      ),
      length: 0,
      width: 0,
      height: 2.7,
      affectedSquareFootage: 0,
      materials: [],
      waterSource: WATER_SOURCES[0],
      timeSinceLoss: 0,
      originalDescription: null,
    });

    toast.success(editingArea ? "Affected area updated" : "Affected area added");
  };

  const handleEditAffectedArea = (area: (typeof affectedAreas)[number]) => {
    setEditingAffectedAreaId(area.id);
    // A form-authored room whose recorded size already equals L×W should keep
    // recalculating when dimensions change. Historical or smaller affected
    // footprints stay unchanged until the technician explicitly opts in.
    setRecalculateAffectedArea(
      area.detailsKnown !== false &&
      area.length > 0 &&
      area.width > 0 &&
      Math.abs(area.affectedSquareFootage - area.length * area.width) < 0.01,
    );
    setNewAffectedArea({
      roomType: area.roomType,
      roomName: area.customRoomName ?? area.roomZoneId,
      length: area.length,
      width: area.width,
      height: area.height,
      affectedSquareFootage: area.affectedSquareFootage,
      materials: [...area.materials],
      waterSource: area.waterSource,
      timeSinceLoss: area.timeSinceLoss,
      originalDescription: area.originalDescription ?? null,
    });
    document.getElementById("affected-area-room-name")?.focus();
  };

  const handleCancelAffectedAreaEdit = () => {
    setEditingAffectedAreaId(null);
    setRecalculateAffectedArea(false);
    setNewAffectedArea({
      roomType: ROOM_TYPES[0],
      roomName: nextRoomName(ROOM_TYPES[0], affectedAreas.map((area) => area.roomZoneId)),
      length: 0,
      width: 0,
      height: 2.7,
      affectedSquareFootage: 0,
      materials: [],
      waterSource: WATER_SOURCES[0],
      timeSinceLoss: 0,
      originalDescription: null,
    });
  };

  const handleRemoveAffectedArea = (id: string) => {
    if (editingAffectedAreaId === id) handleCancelAffectedAreaEdit();
    setAffectedAreas(affectedAreas.filter((a) => a.id !== id));
    toast.success("Affected area removed");
  };

  const handleScopeItemToggle = (itemId: string) => {
    const newSelected = new Set(selectedScopeItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      // Remove spec if deselecting
      const newSpecs = { ...scopeItemSpecs };
      delete newSpecs[itemId];
      setScopeItemSpecs(newSpecs);
    } else {
      newSelected.add(itemId);
    }
    setSelectedScopeItems(newSelected);
  };

  const uploadSelectedPhoto = async (
    entry: (typeof photos)[number],
    currentInspectionId: string,
  ): Promise<boolean> => {
    if (!entry.file || !entry.retryKey) return false;
    let file = entry.file;
    let prepared = entry.prepared === true;
    setPhotos((prev) => prev.map((photo) =>
      photo.id === entry.id ? { ...photo, uploading: true, error: null } : photo,
    ));
    try {
      if (!prepared) {
        file = await prepareInspectionPhoto(file);
        prepared = true;
        setPhotos((prev) => prev.map((photo) =>
          photo.id === entry.id ? { ...photo, file, prepared } : photo,
        ));
      }
      const saved = await uploadInspectionPhoto(currentInspectionId, file, entry.retryKey);
      setPhotos((prev) => prev.map((photo) =>
        photo.id === entry.id
          ? { id: saved.id, url: saved.url, file: null, uploading: false }
          : photo,
      ));
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Photo upload failed";
      setPhotos((prev) => prev.map((photo) =>
        photo.id === entry.id
          ? { ...photo, file, prepared, uploading: false, error: message }
          : photo,
      ));
      return false;
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Always clear so the same file can be re-selected after a blocked attempt
    const resetInput = () => {
      if (e.target) e.target.value = "";
    };
    if (files.length === 0) return;

    if (!claimType) {
      toast.error("Select a claim type before uploading photos");
      resetInput();
      return;
    }
    if (!propertyAddress.trim() || !propertyPostcode.trim()) {
      toast.error("Enter property address and postcode before uploading photos");
      resetInput();
      return;
    }

    const entries = files.map((file) => {
      const key = `nir-photo-${crypto.randomUUID()}`;
      return {
        id: `pending-${key}`,
        url: "",
        file,
        originalFile: file,
        uploading: true,
        prepared: false,
        retryKey: key,
        error: null,
      };
    });
    setPhotos((prev) => [...prev, ...entries]);
    photoWorkCount.current++;
    setUploadingPhotos(true);
    try {
      const currentInspectionId = await ensureInspectionExists(true);
      if (!currentInspectionId) {
        const ids = new Set(entries.map((entry) => entry.id));
        setPhotos((prev) => prev.map((photo) => ids.has(photo.id)
          ? { ...photo, uploading: false, error: "Inspection creation is unconfirmed. Retry this photo to check the same request." }
          : photo,
        ));
        return;
      }
      let savedCount = 0;
      for (const entry of entries) {
        if (await uploadSelectedPhoto(entry, currentInspectionId)) savedCount++;
      }
      if (savedCount > 0) toast.success(`${savedCount} photo(s) uploaded successfully`);
      if (savedCount < entries.length) toast.error("Some photos need retry. Your selected files are still here.");
    } finally {
      photoWorkCount.current--;
      setUploadingPhotos(photoWorkCount.current > 0);
      resetInput();
    }
  };

  const handleRetryPhoto = async (entry: (typeof photos)[number]) => {
    photoWorkCount.current++;
    setUploadingPhotos(true);
    try {
      const currentInspectionId = await ensureInspectionExists(true);
      if (!currentInspectionId) return;
      const saved = await uploadSelectedPhoto(entry, currentInspectionId);
      if (saved) toast.success("Photo attached and verified");
      else toast.error("Photo still needs retry. Your selected file is still here.");
    } finally {
      photoWorkCount.current--;
      setUploadingPhotos(photoWorkCount.current > 0);
    }
  };

  const handleSaveOriginalPhoto = (entry: (typeof photos)[number]) => {
    const original = entry.originalFile ?? entry.file;
    if (!original) return;
    const url = URL.createObjectURL(original);
    const link = document.createElement("a");
    link.href = url;
    link.download = original.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleRemoveFailedPhoto = (entry: (typeof photos)[number]) => {
    if (!window.confirm(
      "This upload may have reached the inspection, but attachment was not verified. Save the original photo first. Remove this local selection?",
    )) return;
    setPhotos((prev) => prev.filter((photo) => photo.id !== entry.id));
  };

  const handleRemovePhoto = async (photoId: string) => {
    if (!inspectionId || deletingPhotoId) return;
    if (!window.confirm("Permanently remove this photo from this inspection?")) return;
    setDeletingPhotoId(photoId);
    const path = `/api/inspections/${encodeURIComponent(inspectionId)}/photos`;
    try {
      let removed = false;
      try {
        const response = await fetch(`${path}/${encodeURIComponent(photoId)}`, { method: "DELETE" });
        removed = response.ok;
      } catch {
        // The server may have committed deletion before the response was lost.
      }
      if (!removed) {
        try {
          const readback = await fetch(path, { cache: "no-store" });
          if (readback.ok) {
            const data = await readback.json();
            // GET returns at most 500; absence from a full page does not
            // establish that an older photo was deleted.
            removed = Array.isArray(data?.photos) && data.photos.length < 500 &&
              !data.photos.some((photo: { id?: string }) => photo.id === photoId);
          }
        } catch {
          // Keep the local row when attachment state cannot be verified.
        }
      }
      if (removed) {
        setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
        toast.success("Photo removed");
      } else {
        toast.error("Could not verify photo removal. The photo remains visible; please try again.");
      }
    } finally {
      setDeletingPhotoId(null);
    }
  };

  // Calculate expected classification preview
  const calculateClassificationPreview = () =>
    computeClassificationPreview({
      affectedAreas,
      moistureReadings,
      environmentalData: measuredEnvironmentalData,
      manualClassification,
    });

  const handleReview = () => {
    // Additional validation for review - require photos
    const reviewErrors: Record<string, string> = {};

    if (deletingPhotoId) {
      reviewErrors.photos = "Please wait for photo removal to finish";
    } else if (verifiedPhotoCount === 0) {
      reviewErrors.photos = "At least one photo is required before submitting";
    }
    if (photos.some((photo) => photo.error)) {
      reviewErrors.photos = "Retry or remove photos that have not been verified";
    }

    // Validate that all photos are uploaded (not still uploading)
    const stillUploading = uploadingPhotos || photos.some((p) => p.uploading);
    if (stillUploading) {
      reviewErrors.photos = "Please wait for all photos to finish uploading";
    }

    if (Object.keys(reviewErrors).length > 0) {
      setValidationErrors(reviewErrors);
      toast.error("Please fix validation errors before reviewing");
      return;
    }

    if (!validateForm()) {
      toast.error("Please fix validation errors before reviewing");
      return;
    }
    setShowReview(true);
  };

  // Auto-create inspection when property info is entered
  const ensureInspectionExists = (showToast = false): Promise<string | null> => {
    // This ref is updated before React renders, so overlapping actions share
    // one creation request and continue against the same saved inspection.
    const knownId = inspectionIdRef.current || inspectionId;
    if (knownId) return Promise.resolve(knownId);
    const pending = inspectionCreationRef.current;
    if (pending?.inFlight) return pending.inFlight;
    if (!attemptStorageKey) {
      setCreationRecovery("unresolved");
      if (showToast) toast.error("Signed-in account unavailable for inspection creation.");
      return Promise.resolve(null);
    }
    let storedKey: string | null;
    try {
      storedKey = sessionStorage.getItem(attemptStorageKey);
    } catch {
      setCreationRecovery("unresolved");
      if (showToast) toast.error("Inspection creation cannot be verified while browser storage is unavailable.");
      return Promise.resolve(null);
    }
    if (creationRecovery === "checking" || creationRecovery === "unresolved" || creationRecovery === "legacy_missing" ||
        (storedKey && !pending && creationRecovery !== "retryable") ||
        (storedKey && pending && storedKey !== pending.key) ||
        (creationRecovery === "retryable" && !storedKey)) {
      if (creationRecovery !== "legacy_missing") setCreationRecovery("unresolved");
      if (showToast) toast.error("Inspection creation is unconfirmed. Check its status before trying again.");
      return Promise.resolve(null);
    }
    if (!claimType || !propertyAddress.trim() || !propertyPostcode.trim()) {
      return Promise.resolve(null);
    }

    const body = JSON.stringify({
      reportId,
      clientId: clientIdForCreation ?? undefined,
      propertyAddress,
      propertyPostcode,
      inspectionDate: inspectionDate || null,
      lossDescription: damageDescription.trim() || undefined,
      technicianName: technicianName || undefined,
      claimType,
    });
    if (pending && pending.body !== body) {
      if (showToast) toast.error(
        "Inspection creation is unconfirmed. Restore the original claim type, address, postcode, attendance, description and technician before retrying.",
      );
      return Promise.resolve(null);
    }
    const attempt = pending ?? {
      key: storedKey && creationRecovery === "retryable"
        ? storedKey : `nir-inspection-${Date.now()}-${crypto.randomUUID()}`,
      body,
      inFlight: null,
    };
    if (!isRecentlyIssuedCreationKey(attempt.key, "nir-inspection")) {
      setCreationRecovery("unresolved");
      if (showToast) toast.error("Inspection creation is unconfirmed. Check its status before trying again.");
      return Promise.resolve(null);
    }
    try {
      sessionStorage.setItem(attemptStorageKey, attempt.key);
      if (sessionStorage.getItem(attemptStorageKey) !== attempt.key) {
        throw new Error("Inspection attempt key was not retained");
      }
    } catch {
      setCreationRecovery("unresolved");
      if (showToast) toast.error("Inspection creation cannot be verified while browser storage is unavailable.");
      return Promise.resolve(null);
    }
    inspectionCreationRef.current = attempt;
    setCreatingInspection(true);

    const inFlight = (async (): Promise<string | null> => {
      try {
        const response = await fetch("/api/inspections", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": attempt.key,
          },
          // Keep the exact body with this key if the server committed but its
          // response was lost. POST /api/inspections uses withIdempotency.
          body: attempt.body,
        });
        if (response.ok) {
          const data = await response.json();
          const savedId = data?.inspection?.id;
          if (typeof savedId !== "string" || !savedId) {
            throw new Error("Inspection creation could not be verified");
          }
          inspectionIdRef.current = savedId;
          setInspectionId(savedId);
          inspectionCreationRef.current = null;
          setCreationRecovery("idle");
          try { sessionStorage.removeItem(attemptStorageKey); } catch { /* saved ID is verified */ }
          try {
            if (sessionStorage.getItem(legacyAttemptStorageKey) === attempt.key) sessionStorage.removeItem(legacyAttemptStorageKey);
          } catch { /* saved ID is verified */ }
          if (showToast) toast.success("Inspection created. You can now upload photos and floor plan.");
          return savedId;
        }
        const error = await response.json().catch(() => null);
        const message = (typeof error?.error === "string" && error.error) ||
          error?.error?.message || "Failed to create inspection";
        // Only a pending idempotency reservation, timeout, rate limit, or
        // server failure may have committed without a usable response.
        // Report/client/property conflicts are definite 409s: rotate the key
        // so a corrected form can be submitted without a cached rejection.
        const pendingConflict = response.status === 409 &&
          (message === "A request with this Idempotency-Key is already in progress. Retry shortly." ||
            message.includes("could not be verified") ||
            message.includes("reused with a different request body"));
        if (response.status >= 400 && response.status < 500 &&
            !pendingConflict && ![401, 403, 408, 425, 429].includes(response.status)) {
          inspectionCreationRef.current = null;
          try {
            sessionStorage.removeItem(attemptStorageKey);
            setCreationRecovery("idle");
          } catch { setCreationRecovery("unresolved"); }
        } else if (creationRecovery === "retryable" && pendingConflict) {
          setCreationRecovery("unresolved");
        }
        if (showToast) toast.error(message);
      } catch {
        if (showToast) toast.error("Inspection creation could not be verified. Retry to check the same request.");
      } finally {
        if (inspectionCreationRef.current === attempt) attempt.inFlight = null;
        setCreatingInspection(false);
      }
      return null;
    })();
    attempt.inFlight = inFlight;
    return inFlight;
  };

  const saveDraftSnapshot = async (currentInspectionId: string) => {
    if (hasPartialEnvironmentalData) {
      throw new Error(partialEnvironmentalMessage);
    }
    // B23: every row carries its id, and baseIds names the rows this form
    // loaded or sent. The server deletes only those the form no longer holds.
    // Ids are recorded before sending: if the reply is lost after the save
    // committed, the next save still knows these rows are the form's own.
    const readingIds = moistureReadings.map((reading) => reading.id);
    for (const readingId of readingIds) savedReadingIds.current.add(readingId);
    const environmentalId = measuredEnvironmentalData
      ? (savedEnvironmentalId.current ??= crypto.randomUUID())
      : null;
    const response = await fetch(
      `/api/inspections/${currentInspectionId}/draft-snapshot`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lossDescription: damageDescription.trim(),
          inspectionDate: inspectionDate || null,
          technicianName: technicianName.trim(),
          environmentalData: measuredEnvironmentalData && {
            ...measuredEnvironmentalData,
            id: environmentalId,
          },
          baseIds: {
            moistureReadings: [...savedReadingIds.current],
            environmentalData: savedEnvironmentalId.current
              ? [savedEnvironmentalId.current]
              : [],
          },
          moistureReadings: moistureReadings.map((reading) => {
            const mapPoint = moistureMapPoints.find(
              (point) => point.id === reading.id,
            );
            const normalizedPoint = mapPoint
              ? toNormalizedMoistureMapPoint(mapPoint)
              : null;
            return buildMoistureReadingDraftPayload(reading, normalizedPoint);
          }),
          affectedAreas: affectedAreas.map(buildAffectedAreaPayload),
          scopeItems: Array.from(selectedScopeItems).flatMap((itemId) => {
            const item = SCOPE_ITEM_TYPES.find((candidate) => candidate.id === itemId);
            return item
              ? [
                  {
                    itemType: itemId,
                    description: item.label,
                    specification: scopeItemSpecs[itemId] || null,
                  },
                ]
              : [];
          }),
          manualClassification: manualClassificationPayload(
            manualClassification,
            hadManualChoice.current,
          ),
        }),
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        apiErrorMessage(data) ?? "Failed to synchronise inspection draft",
      );
    }
    // Confirmed: rows the form removed are gone, so stop naming them.
    savedReadingIds.current = new Set(readingIds);
    savedEnvironmentalId.current = environmentalId;
  };

  const handleSubmit = async () => {
    // Validate photos are required for final submission
    if (deletingPhotoId) {
      setValidationErrors({ photos: "Please wait for photo removal to finish" });
      toast.error("Please wait for photo removal to finish");
      return;
    }
    if (verifiedPhotoCount === 0) {
      setValidationErrors({
        photos: "At least one photo is required before submitting",
      });
      toast.error("Please upload at least one photo before submitting");
      return;
    }

    if (photos.some((photo) => photo.error)) {
      setValidationErrors({ photos: "Retry or remove photos that have not been verified" });
      toast.error("Retry or remove unverified photos before submitting");
      return;
    }

    const stillUploading = uploadingPhotos || photos.some((p) => p.uploading);
    if (stillUploading) {
      setValidationErrors({
        photos: "Please wait for all photos to finish uploading",
      });
      toast.error("Please wait for all photos to finish uploading");
      return;
    }

    if (!validateForm()) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    setSaving(true);

    try {
      // Step 1: Ensure inspection exists (should already exist from auto-create)
      let currentInspectionId = inspectionId;

      if (!currentInspectionId) {
        currentInspectionId = await ensureInspectionExists(true); // Show toast
        if (!currentInspectionId) {
          throw new Error("Failed to create inspection");
        }
      }

      // A draft save is a snapshot. Synchronise the editable child records in
      // one transaction so retries and repeated saves cannot append duplicates.
      await saveDraftSnapshot(currentInspectionId);

      // Save floor plan image URL if one has been uploaded.
      if (floorPlanImageUrl) {
        const floorPlanRes = await fetch(
          `/api/inspections/${currentInspectionId}/floor-plan`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: floorPlanImageUrl,
            }),
          },
        );
        if (!floorPlanRes.ok) throw new Error("Failed to save floor plan");
      }

      // Photos are already uploaded to Cloudinary via handlePhotoUpload.
      // No need to upload again here - they're already saved in the database

      // Submit for processing.
      const submitResponse = await fetch(
        `/api/inspections/${currentInspectionId}/submit`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": `inspection-submit-${currentInspectionId}`,
          },
        },
      );

      if (!submitResponse.ok) {
        const error = await submitResponse.json().catch(() => null);
        const blockers = Array.isArray(error?.blockers)
          ? error.blockers
              .map((b: { label?: string }) => b?.label)
              .filter(Boolean)
              .join("; ")
          : "";
        throw new Error(
          [error?.error || "Failed to submit inspection", blockers]
            .filter(Boolean)
            .join(" — "),
        );
      }

      void fireHaptic("success");
      toast.success(
        "Inspection submitted successfully! Processing classification and scope determination...",
      );

      // RA-1842 — Native iOS only: offer to schedule a local follow-up
      // notification right after submission. Reviewers see real native
      // notification permission + scheduling, satisfying Guideline 4.2.
      if (currentInspectionId && isNativeIOS) {
        void offerFollowUpReminder(currentInspectionId, propertyAddress);
      }

      if (onComplete && currentInspectionId) {
        onComplete(currentInspectionId);
      }
    } catch (error: any) {
      void fireHaptic("warning");
      toast.error(error.message || "Failed to submit inspection");
    } finally {
      setSaving(false);
    }
  };

  // Lightweight prompt that schedules a +24h local notification when the
  // user confirms. No-op if not running in the iOS shell or permission
  // denied. Stays below the modal threshold to keep the submit path fast.
  async function offerFollowUpReminder(
    inspectionId: string,
    address: string,
  ): Promise<void> {
    const wantsReminder = window.confirm(
      "Schedule a 24-hour follow-up reminder for this site?",
    );
    if (!wantsReminder) return;
    const ok = await scheduleFollowUpReminder({
      id: Math.floor(Date.now() / 1000) % 2_147_483_647,
      title: "Re-check site",
      body: address ? `Follow-up due: ${address}` : "Follow-up inspection due",
      at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      extra: { inspectionId },
    });
    if (ok) toast.success("Reminder scheduled for 24 hours");
  }

  // Calculate dew point (simplified)
  useEffect(() => {
    const temp = environmentalData.ambientTemperature;
    const humidity = environmentalData.humidityLevel;
    if (temp === null || humidity === null) {
      setEnvironmentalData((prev) =>
        prev.dewPoint === null ? prev : { ...prev, dewPoint: null },
      );
      return;
    }
    // RA-7744: do not overwrite a saved dew point on load.
    const saved = hydratedDewPointInputs.current;
    if (saved) {
      if (
        (saved.ambientTemperature ?? temp) === temp &&
        (saved.humidityLevel ?? humidity) === humidity
      ) {
        return;
      }
      hydratedDewPointInputs.current = null;
    }
    // Simplified dew point calculation (Magnus formula approximation)
    const dewPoint = temp - (100 - humidity) / 5;
    setEnvironmentalData((prev) => ({
      ...prev,
      dewPoint: Math.round(dewPoint * 10) / 10,
    }));
  }, [environmentalData.ambientTemperature, environmentalData.humidityLevel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  // RA-7709: includes the technician's choice when both fields are set — the
  // same rule the draft save and the submit route apply.
  const classificationPreview = calculateClassificationPreview();

  // Review/Summary View
  if (showReview) {
    return (
      <div
        className={cn(
          "max-w-7xl mx-auto space-y-6",
          "text-neutral-900 dark:text-neutral-100",
        )}
      >
        <div className="mb-6">
          <h2
            className={cn(
              "text-2xl font-semibold mb-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            Review & Submit Inspection
          </h2>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>
            Review all entered data. The system will automatically classify and
            determine scope after submission.
          </p>
        </div>

        {/* Property Information Summary */}
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <MapPin className="w-5 h-5" />
            Property Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Address:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {propertyAddress}
              </p>
            </div>
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Postcode:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {propertyPostcode}
              </p>
            </div>
            {technicianName && (
              <div>
                <span className={cn("text-neutral-600 dark:text-slate-400")}>
                  Technician:
                </span>
                <p
                  className={cn(
                    "font-medium",
                    "text-neutral-900 dark:text-white",
                  )}
                >
                  {technicianName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Environmental Data Summary */}
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <Thermometer className="w-5 h-5" />
            Environmental Data
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Temperature:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {environmentalData.ambientTemperature === null
                  ? "Not recorded"
                  : `${environmentalData.ambientTemperature}°C`}
              </p>
            </div>
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Humidity:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {environmentalData.humidityLevel === null
                  ? "Not recorded"
                  : `${environmentalData.humidityLevel}%`}
              </p>
            </div>
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Dew Point:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {environmentalData.dewPoint === null
                  ? "Not recorded"
                  : `${environmentalData.dewPoint.toFixed(1)}°C`}
              </p>
            </div>
            <div>
              <span className={cn("text-neutral-600 dark:text-slate-400")}>
                Air Circulation:
              </span>
              <p
                className={cn(
                  "font-medium",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {environmentalData.ambientTemperature === null ||
                environmentalData.humidityLevel === null
                  ? "Not recorded"
                  : environmentalData.airCirculation
                    ? "Yes"
                    : "No"}
              </p>
            </div>
          </div>
        </div>

        {/* Moisture Readings Summary — water only */}
        {isWaterDamageClaim(claimType) && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <Droplets className="w-5 h-5" />
            Moisture Readings ({moistureReadings.length})
          </h3>
          <div className="space-y-2">
            {moistureReadings.map((reading) => (
              <div
                key={reading.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg text-sm",
                  "bg-neutral-100 dark:bg-slate-900/50",
                )}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      "font-medium",
                      "text-neutral-900 dark:text-white",
                    )}
                  >
                    {reading.location}
                  </span>
                  <span className={cn("text-neutral-600 dark:text-slate-400")}>
                    {reading.surfaceType}
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      "text-cyan-600 dark:text-cyan-400",
                    )}
                  >
                    {reading.moistureLevel}%
                  </span>
                  <span className={cn("text-neutral-600 dark:text-slate-400")}>
                    {reading.depth}
                  </span>
                </div>
              </div>
            ))}
            {classificationPreview && (
              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p
                  className={cn("text-sm", "text-cyan-700 dark:text-cyan-400")}
                >
                  <strong>Average Moisture:</strong>{" "}
                  {classificationPreview.avgMoisture.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Affected Areas Summary */}
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <MapPin className="w-5 h-5" />
            Affected Areas ({affectedAreas.length})
          </h3>
          <div className="space-y-3">
            {affectedAreas.map((area) => (
              <div
                key={area.id}
                className={cn(
                  "p-4 rounded-lg",
                  "bg-neutral-100 dark:bg-slate-900/50",
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={cn(
                          "font-medium text-base",
                          "text-neutral-900 dark:text-white",
                        )}
                      >
                        {area.roomZoneId}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded",
                          "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400",
                        )}
                      >
                        {area.affectedSquareFootage.toFixed(2)} m²
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        {area.length > 0 && area.width > 0
                          ? `${area.length}m × ${area.width}m × ${area.height}m`
                          : "Dimensions need re-entry"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span
                        className={cn(
                          "text-xs",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Materials:
                      </span>
                      {area.materials.map((material, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            "bg-neutral-200 dark:bg-slate-800 text-neutral-800 dark:text-slate-300",
                          )}
                        >
                          {material}
                        </span>
                      ))}
                      {area.materials.length === 0 && <span>Needs re-entry</span>}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-4 text-xs",
                        "text-neutral-600 dark:text-slate-400",
                      )}
                    >
                      <span>
                        Water Source:{" "}
                        <span
                          className={cn("text-cyan-600 dark:text-cyan-400")}
                        >
                          {area.waterSource}
                        </span>
                      </span>
                      <span>Time Since Loss: {area.timeSinceLoss == null ? "Unknown" : `${area.timeSinceLoss} hrs`}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {classificationPreview && (
              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p
                  className={cn("text-sm", "text-cyan-700 dark:text-cyan-400")}
                >
                  <strong>Total Affected Area:</strong>{" "}
                  {classificationPreview.totalArea.toFixed(2)} m²
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Expected Classification Preview */}
        {classificationPreview && (
          <div className="p-6 rounded-lg border-2 border-cyan-500/50 bg-brand-navy">
            <h3
              className={cn(
                "text-lg font-semibold mb-4 flex items-center gap-2",
                "text-neutral-900 dark:text-white",
              )}
            >
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Expected Auto-Classification Preview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className={cn(
                  "p-4 rounded-lg",
                  "bg-neutral-100 dark:bg-slate-900/50",
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  Water Category
                </span>
                <p
                  className={cn(
                    "text-2xl font-bold mt-1",
                    "text-cyan-600 dark:text-cyan-400",
                  )}
                >
                  Category {classificationPreview.category}
                </p>
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  {classificationPreview.category === "3"
                    ? "Black Water (Contaminated)"
                    : classificationPreview.category === "2"
                      ? "Grey Water (Significant Contamination)"
                      : "Clean Water (Sanitary Source)"}
                </p>
              </div>
              <div
                className={cn(
                  "p-4 rounded-lg",
                  "bg-neutral-100 dark:bg-slate-900/50",
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  Water Class
                </span>
                <p
                  className={cn(
                    "text-2xl font-bold mt-1",
                    "text-cyan-600 dark:text-cyan-400",
                  )}
                >
                  Class {classificationPreview.class}
                </p>
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  {classificationPreview.class === "4"
                    ? "Bound Water / Deep Saturation"
                    : classificationPreview.class === "3"
                      ? "Large Area Affected"
                      : classificationPreview.class === "2"
                        ? "Medium Area Affected"
                        : "Least Water / Small Area"}
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p
                className={cn("text-sm", "text-amber-800 dark:text-amber-400")}
              >
                <strong>Note:</strong> This is a preview based on your entered
                data. The system will perform final classification after
                submission using IICRC S500 standards.
              </p>
            </div>
          </div>
        )}

        {/* Scope Items Summary */}
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <ClipboardCheck className="w-5 h-5 text-cyan-400" />
            Selected Scope Items ({selectedScopeItems.size})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from(selectedScopeItems).map((itemId) => {
              const item = SCOPE_ITEM_TYPES.find((i) => i.id === itemId);
              return item ? (
                <div
                  key={itemId}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg text-sm",
                    "bg-neutral-100 dark:bg-slate-900/50",
                  )}
                >
                  <CheckCircle className="w-4 h-4 text-cyan-400" />
                  <span className={cn("text-neutral-900 dark:text-white")}>
                    {item.label}
                  </span>
                </div>
              ) : null;
            })}
          </div>
          <p
            className={cn(
              "text-xs mt-4",
              "text-neutral-600 dark:text-slate-400",
            )}
          >
            Additional scope items will be automatically determined by the
            system based on the final classification.
          </p>
        </div>

        {/* Visual Moisture Mapping Summary */}
        {moistureReadings.length > 0 && moistureMapPoints.length > 0 && (
          <div
            className={cn(
              "p-6 rounded-lg border",
              "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-4 flex items-center gap-2",
                "text-neutral-900 dark:text-white",
              )}
            >
              <Map className="w-5 h-5 text-cyan-400" />
              Visual Moisture Mapping
            </h3>
            <MoistureMappingCanvas
              readings={moistureReadings.map((r) => ({
                id: r.id,
                location: r.location,
                surfaceType: r.surfaceType,
                moistureLevel: r.moistureLevel,
                depth: r.depth,
                notes: null,
              }))}
              initialPoints={moistureMapPoints}
              initialBackgroundImage={floorPlanImageUrl}
              readonly={true}
            />
          </div>
        )}

        {/* Photos Summary */}
        {photos.length > 0 && (
          <div
            className={cn(
              "p-6 rounded-lg border",
              "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-4 flex items-center gap-2",
                "text-neutral-900 dark:text-white",
              )}
            >
              <Camera className="w-5 h-5" />
              Photos ({photos.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((photo, index) => (
                <div key={photo.id || index} className="relative">
                  {photo.uploading ? (
                    <div
                      className={cn(
                        "w-full h-32 rounded-lg border-2 flex items-center justify-center",
                        "border-neutral-300 dark:border-slate-600 bg-neutral-100 dark:bg-slate-900/50",
                      )}
                    >
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                    </div>
                  ) : (
                    <img
                      src={
                        photo.url ||
                        (photo.file ? URL.createObjectURL(photo.file) : "")
                      }
                      alt={`Photo ${index + 1}`}
                      className={cn(
                        "w-full h-32 object-cover rounded-lg border-2",
                        "border-neutral-300 dark:border-slate-600",
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pt-4 border-t border-slate-700">
          <button
            type="button"
            onClick={() => setShowReview(false)}
            className={cn(
              "px-6 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md",
              "border border-neutral-300 dark:border-slate-600 hover:bg-neutral-100 dark:hover:bg-slate-700/50 hover:border-neutral-400 dark:hover:border-slate-500",
              "text-neutral-900 dark:text-white",
            )}
          >
            Back to Edit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || deletingPhotoId !== null}
            className="flex items-center gap-2 px-6 py-2 bg-brand-navy rounded-lg font-medium hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-white group"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                <span>Submit for Auto-Classification</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "max-w-7xl mx-auto space-y-6",
        "text-neutral-900 dark:text-neutral-100",
      )}
    >
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2
            className={cn(
              "text-2xl font-semibold mb-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            NIR Technician Input Form
          </h2>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>
            Measure and observe only. The system will automatically interpret
            and classify.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (
              !hasUnlimitedQuickFill &&
              (quickFillCredits === null || quickFillCredits <= 0)
            ) {
              toast.error(
                "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.",
              );
              return;
            }

            if (!hasUnlimitedQuickFill) {
              setLoadingCredits(true);
              try {
                const response = await fetch("/api/user/quick-fill-credits", {
                  method: "POST",
                });

                if (response.ok) {
                  const data = await response.json();
                  setQuickFillCredits(data.creditsRemaining);
                  setShowQuickFillModal(true);
                } else {
                  const error = await response.json();
                  if (error.requiresUpgrade) {
                    toast.error(
                      "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.",
                    );
                  } else {
                    toast.error(
                      error.error || "Failed to use Quick Fill credit",
                    );
                  }
                }
              } catch (error) {
                toast.error("Failed to check Quick Fill credits");
              } finally {
                setLoadingCredits(false);
              }
            } else {
              setShowQuickFillModal(true);
            }
          }}
          disabled={
            loadingCredits ||
            (!hasUnlimitedQuickFill &&
              (quickFillCredits === null || quickFillCredits <= 0))
          }
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
            "bg-brand-navy",
            "text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed",
            "hover:scale-[1.02] active:scale-[0.98]",
          )}
        >
          {loadingCredits ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          <span>
            {hasUnlimitedQuickFill
              ? "Quick Fill"
              : quickFillCredits !== null && quickFillCredits > 0
                ? `Quick Fill (${quickFillCredits})`
                : "No Credits"}
          </span>
        </button>
      </div>

      {/* Claim type — IICRC standard governing this job (RA-1029 P1 #7) */}
      <ClaimTypePicker
        value={claimType}
        onChange={(v) => {
          setClaimType(v);
          // Clear any prior validation error on selection.
          if (validationErrors.claimType) {
            setValidationErrors((prev) => {
              const { claimType: _omit, ...rest } = prev;
              return rest;
            });
          }
        }}
        error={validationErrors.claimType}
        disabled={!!inspectionId || creatingInspection}
      />
      {creationRecovery !== "idle" && !inspectionId && (
        <div role="alert" className="rounded-lg border border-amber-400 p-3 text-sm">
          <p>{creationRecovery === "checking"
            ? "Checking whether this inspection was saved..."
            : creationRecovery === "retryable"
              ? "No saved request was found. Review the details and retry the same protected attempt."
              : creationRecovery === "legacy_missing"
                ? "An older inspection attempt could not be verified. Check existing jobs before starting a new draft."
              : "Inspection creation is unconfirmed. Check its status before starting another job."}</p>
          <button type="button" onClick={() => setRecoveryCheck((value) => value + 1)}
            className="mt-2 underline">
            Check status
          </button>
          {creationRecovery === "legacy_missing" && (
            <button type="button" onClick={dismissUnverifiedLegacyAttempt} className="ml-3 underline">
              I checked jobs; start fresh
            </button>
          )}
        </div>
      )}
      {claimType && !inspectionId && (
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          Save Draft or upload a floor plan to create the inspection before
          completing its assessment.
        </p>
      )}

      {/* Claim-type assessment panel (S520 / S540 / S700 / S500) — RA-1029 */}
      {inspectionId && claimType && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <Shield className="w-5 h-5" />
            Claim-type evidence
          </h3>
          <NIRClaimAssessmentPanel
            inspectionId={inspectionId}
            lockedClaimType={claimType}
            // RA-7709: a Category / Class pick in the panel is the
            // technician's choice, shown in the preview and saved as such.
            onWaterClassificationSaved={setManualClassification}
          />
        </div>
      )}

      {/* Property Information */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <MapPin className="w-5 h-5" />
          Property Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Property Address <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              disabled={creatingInspection}
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
              placeholder="Full property address"
            />
            {isNativeIOS && (
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating || creatingInspection}
                className={cn(
                  "mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs",
                  "bg-cyan-600 hover:bg-cyan-700 text-white transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {locating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Locate className="w-3.5 h-3.5" />
                )}
                {locating ? "Locating…" : "Use my current location"}
              </button>
            )}
            {validationErrors.propertyAddress && (
              <p className="text-destructive text-xs mt-1">
                {validationErrors.propertyAddress}
              </p>
            )}
          </div>

          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Postcode <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              disabled={creatingInspection}
              maxLength={4}
              value={propertyPostcode}
              onChange={(e) =>
                setPropertyPostcode(e.target.value.replace(/\D/g, ""))
              }
              className={cn(
                "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
              placeholder="0000"
            />
            {validationErrors.propertyPostcode && (
              <p className="text-destructive text-xs mt-1">
                {validationErrors.propertyPostcode}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-slate-300">
              Inspection attendance date (optional)
            </label>
            <input
              type="date"
              disabled={creatingInspection}
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400">
              Leave blank until someone has attended the property.
            </p>
          </div>

          <div className="md:col-span-2">
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Technician Name
            </label>
            <input
              type="text"
              disabled={creatingInspection}
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
              placeholder="Your name"
            />
          </div>
        </div>
      </div>

      {/* Environmental Data */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <Thermometer className="w-5 h-5" />
          Environmental Data
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Ambient Temperature (°C)
            </label>
            <input
              type="number"
              min="-20"
              max="55"
              value={environmentalData.ambientTemperature ?? ""}
              onChange={(e) =>
                setEnvironmentalData((prev) => ({
                  ...prev,
                  ambientTemperature:
                    e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              className={cn(
                "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
            />
            {validationErrors.temperature && (
              <p className="text-destructive text-xs mt-1">
                {validationErrors.temperature}
              </p>
            )}
          </div>

          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Humidity Level (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={environmentalData.humidityLevel ?? ""}
              onChange={(e) =>
                setEnvironmentalData((prev) => ({
                  ...prev,
                  humidityLevel:
                    e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              className={cn(
                "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
            />
            {validationErrors.humidity && (
              <p className="text-destructive text-xs mt-1">
                {validationErrors.humidity}
              </p>
            )}
          </div>

          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-1",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Dew Point (°C)
            </label>
            <input
              type="number"
              value={environmentalData.dewPoint?.toFixed(1) ?? ""}
              disabled
              className={cn(
                "w-full px-4 py-2 rounded-lg cursor-not-allowed",
                "bg-neutral-100 dark:bg-slate-700/30 border border-neutral-200 dark:border-slate-600",
                "text-neutral-500 dark:text-slate-400",
              )}
            />
            <p
              className={cn(
                "text-xs mt-1",
                "text-neutral-600 dark:text-slate-400",
              )}
            >
              Auto-calculated
            </p>
          </div>

          <div className="flex items-end">
            <label
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              <input
                type="checkbox"
                checked={environmentalData.airCirculation}
                onChange={(e) =>
                  setEnvironmentalData((prev) => ({
                    ...prev,
                    airCirculation: e.target.checked,
                  }))
                }
                className={cn(
                  "w-4 h-4 rounded border text-cyan-500 focus:ring-cyan-500",
                  "border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-700",
                )}
              />
              Air Circulation
            </label>
          </div>
        </div>
      </div>

      {/* Moisture Readings + map — S500 water only (RA-1029) */}
      {isWaterDamageClaim(claimType) && (
        <>
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <Droplets className="w-5 h-5" />
          Moisture Readings{" "}
          <span className="text-destructive">*</span>
        </h3>

        {validationErrors.moistureReadings && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className={cn("text-sm", "text-destructive")}>
              {validationErrors.moistureReadings}
            </p>
          </div>
        )}

        {/* Add New Moisture Reading */}
        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 rounded-lg",
            "bg-neutral-100 dark:bg-slate-900/50",
          )}
        >
          <div>
            <label
              className={cn(
                "block text-xs font-medium mb-1",
                "text-neutral-600 dark:text-slate-400",
              )}
            >
              Location
            </label>
            <input
              type="text"
              value={newMoistureReading.location}
              onChange={(e) =>
                setNewMoistureReading((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
              className={cn(
                "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
              placeholder="Room/Zone"
            />
          </div>

          <div>
            <label
              className={cn(
                "block text-xs font-medium mb-1",
                "text-neutral-600 dark:text-slate-400",
              )}
            >
              Surface Type
            </label>
            <select
              value={newMoistureReading.surfaceType}
              onChange={(e) =>
                setNewMoistureReading((prev) => ({
                  ...prev,
                  surfaceType: e.target.value,
                }))
              }
              className={cn(
                "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
            >
              {SURFACE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className={cn(
                "block text-xs font-medium mb-1",
                "text-neutral-600 dark:text-slate-400",
              )}
            >
              Moisture (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={newMoistureReading.moistureLevel}
              onChange={(e) =>
                setNewMoistureReading((prev) => ({
                  ...prev,
                  moistureLevel: parseFloat(e.target.value) || 0,
                }))
              }
              className={cn(
                "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
            />
          </div>

          <div>
            <label
              className={cn(
                "block text-xs font-medium mb-1",
                "text-neutral-600 dark:text-slate-400",
              )}
            >
              Depth
            </label>
            <select
              value={newMoistureReading.depth}
              onChange={(e) =>
                setNewMoistureReading((prev) => ({
                  ...prev,
                  depth: e.target.value as "Surface" | "Subsurface",
                }))
              }
              className={cn(
                "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
              )}
            >
              <option value="Surface">Surface</option>
              <option value="Subsurface">Subsurface</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAddMoistureReading}
              className="w-full px-4 py-2 bg-brand-navy text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
              <span className="font-medium">Add Reading</span>
            </button>
          </div>
        </div>

        {/* Existing Moisture Readings */}
        {moistureReadings.length > 0 && (
          <div className="space-y-2">
            {moistureReadings.map((reading) => (
              <div
                key={reading.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg text-sm",
                  "bg-neutral-100 dark:bg-slate-900/50",
                )}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      "font-medium",
                      "text-neutral-900 dark:text-white",
                    )}
                  >
                    {reading.location}
                  </span>
                  <span className={cn("text-neutral-600 dark:text-slate-400")}>
                    {reading.surfaceType}
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      "text-cyan-600 dark:text-cyan-400",
                    )}
                  >
                    {reading.moistureLevel}%
                  </span>
                  <span className={cn("text-neutral-600 dark:text-slate-400")}>
                    {reading.depth}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMoistureReading(reading.id)}
                  className={cn(
                    "p-1.5 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group",
                    "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10",
                  )}
                  title="Remove reading"
                >
                  <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visual Moisture Mapping (Floor Plan Overlay) */}
      {moistureReadings.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
          )}
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            <Map className="w-5 h-5 text-cyan-400" />
            Visual Moisture Mapping (Floor Plan Overlay)
          </h3>
          <p
            className={cn(
              "text-sm mb-4",
              "text-neutral-600 dark:text-slate-400",
            )}
          >
            Upload a floor plan image and place your moisture readings on the
            map to visualize the affected areas.
            {!inspectionId &&
              (!propertyAddress.trim() || !propertyPostcode.trim()) && (
                <span className="block mt-2 text-amber-400 text-xs">
                  Select a claim type and enter property address and postcode,
                  then Save Draft or upload a floor plan to create the inspection.
                </span>
              )}
            {inspectionId && (
              <span className="block mt-2 text-success text-xs">
                Inspection ready. You can upload floor plan and photos.
              </span>
            )}
          </p>

          <MoistureMappingCanvas
            readings={moistureReadings.map((r) => ({
              id: r.id,
              location: r.location,
              surfaceType: r.surfaceType,
              moistureLevel: r.moistureLevel,
              depth: r.depth,
              notes: null,
            }))}
            initialPoints={moistureMapPoints}
            initialBackgroundImage={floorPlanImageUrl}
            onPointsChange={(points) => {
              setMoistureMapPoints(points);
            }}
            onBackgroundImageChange={(url) => {
              setFloorPlanImageUrl(url);
            }}
            onImageUpload={async (file) => {
              // Auto-create inspection if it doesn't exist
              let currentInspectionId = inspectionId;
              if (!currentInspectionId) {
                if (!propertyAddress.trim() || !propertyPostcode.trim()) {
                  toast.error(
                    "Please enter property address and postcode first",
                  );
                  throw new Error("Property info required");
                }

                currentInspectionId = await ensureInspectionExists(true); // Show toast
                if (!currentInspectionId) {
                  throw new Error("No inspection ID");
                }
              }

              const formData = new FormData();
              formData.append("file", file);
              formData.append("type", "floor-plan");

              const response = await fetch(
                `/api/inspections/${currentInspectionId}/floor-plan`,
                {
                  method: "POST",
                  body: formData,
                },
              );

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to upload floor plan");
              }

              const data = await response.json();
              setFloorPlanImageUrl(data.imageUrl);
              return data.imageUrl;
            }}
          />
        </div>
      )}
        </>
      )}

      {/* Affected Areas */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <MapPin className="w-5 h-5" />
          Affected Areas{" "}
          <span className="text-destructive">*</span>
        </h3>

        {validationErrors.affectedAreas && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className={cn("text-sm", "text-destructive")}>
              {validationErrors.affectedAreas}
            </p>
          </div>
        )}
        {linkedAreaConflict && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            Each drawn room with linked moisture readings must match its own
            affected area. Review room links and make area names unique before
            submitting. Numbered and custom names must match in both places.
          </p>
        )}
        {unlinkedAreaAmbiguity && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            A location-only moisture reading may refer to a renamed area.
            Review its location and the affected area name before submitting.
          </p>
        )}

        {/* Add New Affected Area */}
        <div
          className={cn(
            "space-y-4 mb-4 p-4 rounded-lg",
            "bg-neutral-100 dark:bg-slate-900/50",
          )}
        >
          {editingAffectedAreaId && (
            <p className="text-sm text-cyan-700 dark:text-cyan-300">
              Editing an existing area. Its ID and attached records stay with this area.
            </p>
          )}
          {/* Room Picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Room Type{" "}
                <span className="text-destructive">*</span>
              </label>
              <select
                value={newAffectedArea.roomType}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    roomType: e.target.value,
                    roomName: nextRoomName(
                      e.target.value,
                      affectedAreas.map((area) => area.roomZoneId),
                    ),
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              >
                {ROOM_TYPES.map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </div>

              <div>
                <label
                  className={cn(
                    "block text-xs font-medium mb-1",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  Room name or number{" "}
                  {newAffectedArea.roomType === "Other" && (
                    <span className="text-destructive">*</span>
                  )}
                </label>
                <input
                  id="affected-area-room-name"
                  type="text"
                  value={newAffectedArea.roomName}
                  onChange={(e) =>
                    setNewAffectedArea((prev) => ({
                      ...prev,
                      roomName: e.target.value,
                    }))
                  }
                  maxLength={200}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                    "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                    "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                  )}
                  placeholder="e.g. 4 or Rear Lounge"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved as: {formatRoomZoneLabel(newAffectedArea.roomType, newAffectedArea.roomName) || "Enter a room name"}
                </p>
              </div>
          </div>

          {editingAffectedAreaId && (
            <div>
              <label htmlFor="existing-area-note" className="block text-xs font-medium mb-1">
                Existing area note
              </label>
              <textarea
                id="existing-area-note"
                value={newAffectedArea.originalDescription ?? ""}
                onChange={(event) => setNewAffectedArea((prev) => ({
                  ...prev,
                  originalDescription: event.target.value || null,
                }))}
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700/50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This note stays with the area. If it is too long to fit with
                dimensions, shorten it here before updating.
              </p>
            </div>
          )}

          {/* Dimensions for Area Calculation */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Length (m){" "}
                <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.length}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    length: parseFloat(e.target.value) || 0,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
                placeholder="0.0"
              />
            </div>

            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Width (m){" "}
                <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.width}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    width: parseFloat(e.target.value) || 0,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
                placeholder="0.0"
              />
            </div>

            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Height (m)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.height}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    height: parseFloat(e.target.value) || 0,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
                placeholder="2.7"
              />
            </div>

            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Length × Width (m²)
              </label>
              <input
                type="number"
                value={newAffectedArea.affectedSquareFootage.toFixed(2)}
                disabled
                className={cn(
                  "w-full px-3 py-2 rounded-lg text-sm cursor-not-allowed",
                  "bg-neutral-100 dark:bg-slate-700/30 border border-neutral-200 dark:border-slate-600",
                  "text-neutral-500 dark:text-slate-400",
                )}
              />
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-neutral-600 dark:text-slate-500",
                )}
              >
                Auto-calculated: Length × Width
              </p>
            </div>
          </div>

          {editingAffectedAreaId && (
            <label className="flex items-start gap-2 text-sm text-neutral-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={recalculateAffectedArea}
                onChange={(event) => setRecalculateAffectedArea(event.target.checked)}
              />
              <span>
                Replace the recorded affected area with length × width.
                Otherwise its current size stays unchanged.
              </span>
            </label>
          )}

          {/* Materials Selection */}
          <div>
            <label
              className={cn(
                "block text-xs font-medium mb-2",
                "text-neutral-700 dark:text-slate-400",
              )}
            >
              Affected Materials{" "}
              <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MATERIAL_TYPES.map((material) => (
                <label
                  key={material}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
                    "bg-neutral-100 dark:bg-slate-800/50 hover:bg-neutral-200 dark:hover:bg-slate-700/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={newAffectedArea.materials.includes(material)}
                    onChange={() => handleMaterialToggle(material)}
                    className={cn(
                      "w-4 h-4 rounded border text-cyan-500 focus:ring-cyan-500",
                      "border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-700",
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      "text-neutral-900 dark:text-white",
                    )}
                  >
                    {material}
                  </span>
                </label>
              ))}
            </div>
            {newAffectedArea.materials.length > 0 && (
              <p className="text-xs text-cyan-400 mt-2">
                Selected: {newAffectedArea.materials.join(", ")}
              </p>
            )}
          </div>

          {/* Water Source and Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Water Source
              </label>
              <select
                value={newAffectedArea.waterSource}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    waterSource: e.target.value,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              >
                {!WATER_SOURCES.includes(newAffectedArea.waterSource) && (
                  <option value={newAffectedArea.waterSource}>
                    {newAffectedArea.waterSource}
                  </option>
                )}
                {WATER_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Time Since Loss (hrs)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newAffectedArea.timeSinceLoss ?? ""}
                onChange={(e) =>
                  setNewAffectedArea((prev) => ({
                    ...prev,
                    timeSinceLoss: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddAffectedArea}
                className="w-full px-4 py-2 bg-brand-navy text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group"
              >
                <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
                <span className="font-medium">{editingAffectedAreaId ? "Update Area" : "Add Area"}</span>
              </button>
              {editingAffectedAreaId && (
                <button
                  type="button"
                  onClick={handleCancelAffectedAreaEdit}
                  className="mt-2 w-full rounded border border-neutral-300 px-4 py-2 text-sm dark:border-slate-600"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Existing Affected Areas */}
        {affectedAreas.length > 0 && (
          <div className="space-y-2">
            {affectedAreas.map((area) => (
              <div
                key={area.id}
                className={cn(
                  "p-3 rounded-lg border",
                  "bg-white dark:bg-slate-900/50 border-neutral-200 dark:border-slate-700/50",
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={cn(
                          "font-medium",
                          "text-neutral-900 dark:text-white",
                        )}
                      >
                        {area.roomZoneId}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded",
                          "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400",
                        )}
                      >
                        {area.affectedSquareFootage.toFixed(2)} m²
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        {area.length > 0 && area.width > 0
                          ? `${area.length}m × ${area.width}m × ${area.height}m`
                          : "Dimensions need re-entry"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span
                        className={cn("text-neutral-600 dark:text-slate-400")}
                      >
                        Materials:
                      </span>
                      {area.materials.map((material, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "px-2 py-0.5 rounded",
                            "bg-neutral-200 dark:bg-slate-800 text-neutral-800 dark:text-slate-300",
                          )}
                        >
                          {material}
                        </span>
                      ))}
                      {area.materials.length === 0 && <span>Needs re-entry</span>}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-4 mt-2 text-xs",
                        "text-neutral-600 dark:text-slate-400",
                      )}
                    >
                      <span>Source: {area.waterSource}</span>
                      <span>Time: {area.timeSinceLoss == null ? "Unknown" : `${area.timeSinceLoss} hrs`}</span>
                    </div>
                  </div>
                  <div className="ml-4 flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleEditAffectedArea(area)}
                    className="p-1.5 rounded-md text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300"
                    title="Edit area"
                    aria-label={`Edit ${area.roomZoneId}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveAffectedArea(area.id)}
                    className={cn(
                      "p-1.5 rounded-md transition-all duration-200 hover:scale-110 active:scale-95 group",
                      "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10",
                    )}
                    title="Remove area"
                  >
                    <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Classification / equipment / drying — S500 water only (RA-1029) */}
      {isWaterDamageClaim(claimType) && (
        <>
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <Shield className="w-5 h-5 text-cyan-400" />
          IICRC Classification (Optional Manual Override)
        </h3>
        <p
          className={cn("text-sm mb-4", "text-neutral-600 dark:text-slate-400")}
        >
          The system will automatically classify based on your data. You can
          manually override the classification if needed.
        </p>

        {/* Damage description — feeds rule-based auto-classifier */}
        <div className="mb-4">
          <label
            className={cn(
              "block text-sm font-medium mb-1",
              "text-neutral-700 dark:text-slate-300",
            )}
          >
            Describe the Damage (optional — improves auto-classification)
          </label>
          <textarea
            rows={3}
            disabled={creatingInspection}
            value={damageDescription}
            onChange={(e) => setDamageDescription(e.target.value)}
            className={cn(
              "w-full px-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 resize-none",
              "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
              "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
            )}
            placeholder="e.g. Burst pipe in bathroom, grey water from washing machine overflow, sewage backup in basement…"
          />
          <ClassificationSuggestion
            description={damageDescription}
            averageMoistureReading={
              moistureReadings.length > 0
                ? moistureReadings.reduce(
                    (sum: number, r: { moistureLevel: number }) =>
                      sum + r.moistureLevel,
                    0,
                  ) / moistureReadings.length
                : undefined
            }
            onApply={(result, _claimTypes) => {
              if (result.damageCategory || result.damageClass) {
                setManualClassification({
                  category: result.damageCategory
                    ? String(result.damageCategory)
                    : (manualClassification?.category ?? ""),
                  class: result.damageClass
                    ? String(result.damageClass)
                    : (manualClassification?.class ?? ""),
                });
              }
              // _claimTypes carries the full multi-loss selection — available for future
              // scope generation call-sites that accept claimTypes: string[].
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Water Category Selector */}
          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-3",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Water Category (IICRC S500)
            </label>
            <div className="space-y-2">
              {WATER_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                    "bg-neutral-100 dark:bg-slate-900/50 border border-neutral-200 dark:border-slate-600",
                    "hover:bg-neutral-200 dark:hover:bg-slate-900/70",
                  )}
                >
                  <input
                    type="radio"
                    name="waterCategory"
                    value={category.value}
                    checked={manualClassification?.category === category.value}
                    onChange={(e) =>
                      setManualClassification((prev) => ({
                        ...prev,
                        category: e.target.value,
                        class: prev?.class || "",
                      }))
                    }
                    className={cn(
                      "mt-1 w-4 h-4 text-cyan-500 focus:ring-cyan-500",
                      "border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-700",
                    )}
                  />
                  <div className="flex-1">
                    <div
                      className={cn(
                        "font-medium text-sm",
                        "text-neutral-900 dark:text-white",
                      )}
                    >
                      {category.label}
                    </div>
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        "text-neutral-600 dark:text-slate-400",
                      )}
                    >
                      {category.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Water Class Selector */}
          <div>
            <label
              className={cn(
                "block text-sm font-medium mb-3",
                "text-neutral-700 dark:text-slate-300",
              )}
            >
              Water Class (IICRC S500)
            </label>
            <div className="space-y-2">
              {WATER_CLASSES.map((waterClass) => (
                <label
                  key={waterClass.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                    "bg-neutral-100 dark:bg-slate-900/50 border border-neutral-200 dark:border-slate-600",
                    "hover:bg-neutral-200 dark:hover:bg-slate-900/70",
                  )}
                >
                  <input
                    type="radio"
                    name="waterClass"
                    value={waterClass.value}
                    checked={manualClassification?.class === waterClass.value}
                    onChange={(e) =>
                      setManualClassification((prev) => ({
                        category: prev?.category || "",
                        class: e.target.value,
                      }))
                    }
                    className={cn(
                      "mt-1 w-4 h-4 text-cyan-500 focus:ring-cyan-500",
                      "border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-700",
                    )}
                  />
                  <div className="flex-1">
                    <div
                      className={cn(
                        "font-medium text-sm",
                        "text-neutral-900 dark:text-white",
                      )}
                    >
                      {waterClass.label}
                    </div>
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        "text-neutral-600 dark:text-slate-400",
                      )}
                    >
                      {waterClass.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {manualClassification && (
          <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <p className={cn("text-sm", "text-cyan-700 dark:text-cyan-400")}>
              <strong>Manual Override Active:</strong> Category{" "}
              {manualClassification.category}, Class{" "}
              {manualClassification.class}
            </p>
            <button
              type="button"
              onClick={() => setManualClassification(null)}
              className={cn(
                "mt-2 text-xs underline",
                "text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300",
              )}
            >
              Clear manual override (use auto-classification)
            </button>
          </div>
        )}
      </div>

      {/* Scope Items (Checklist) */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <ClipboardCheck className="w-5 h-5 text-cyan-400" />
          Scope Items
        </h3>
        <p
          className={cn("text-sm mb-4", "text-neutral-600 dark:text-slate-400")}
        >
          Select all applicable scope items. The system will automatically
          determine required items based on classification.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {SCOPE_ITEM_TYPES.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                "bg-neutral-100 dark:bg-slate-900/50",
              )}
            >
              <input
                type="checkbox"
                checked={selectedScopeItems.has(item.id)}
                onChange={() => handleScopeItemToggle(item.id)}
                className={cn(
                  "w-4 h-4 rounded border text-cyan-500 focus:ring-cyan-500",
                  "border-neutral-300 dark:border-slate-600 bg-white dark:bg-slate-700",
                )}
              />
              <label
                className={cn(
                  "text-sm flex-1",
                  "text-neutral-900 dark:text-white",
                )}
              >
                {item.label}
              </label>
              {item.id === "demolish_drywall" &&
                selectedScopeItems.has(item.id) && (
                  <input
                    type="text"
                    placeholder="Height (e.g., 2ft)"
                    value={scopeItemSpecs[item.id] || ""}
                    onChange={(e) =>
                      setScopeItemSpecs((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className="w-24 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                  />
                )}
            </div>
          ))}
        </div>

        {/* Equipment Selection */}
        <div className="mb-6">
          <h4
            className={cn(
              "text-sm font-semibold mb-3",
              "text-neutral-800 dark:text-slate-300",
            )}
          >
            Equipment Required
          </h4>
          <div
            className={cn(
              "grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-lg",
              "bg-neutral-100 dark:bg-slate-900/50",
            )}
          >
            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Equipment Type
              </label>
              <select
                value={newEquipment.type}
                onChange={(e) =>
                  setNewEquipment((prev) => ({ ...prev, type: e.target.value }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              >
                {EQUIPMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={newEquipment.quantity}
                onChange={(e) =>
                  setNewEquipment((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 1,
                  }))
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  if (newEquipment.quantity < 1) {
                    toast.error("Quantity must be at least 1");
                    return;
                  }
                  setEquipmentSelection([
                    ...equipmentSelection,
                    {
                      id: Date.now().toString(),
                      ...newEquipment,
                    },
                  ]);
                  setNewEquipment({ type: EQUIPMENT_TYPES[0], quantity: 1 });
                  toast.success("Equipment added");
                }}
                className="w-full px-4 py-2 bg-brand-navy text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add</span>
              </button>
            </div>
          </div>

          {equipmentSelection.length > 0 && (
            <div className="space-y-2">
              {equipmentSelection.map((eq) => (
                <div
                  key={eq.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg text-sm",
                    "bg-neutral-100 dark:bg-slate-900/50",
                  )}
                >
                  <span className={cn("text-neutral-900 dark:text-white")}>
                    {eq.quantity}x {eq.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEquipmentSelection(
                        equipmentSelection.filter((e) => e.id !== eq.id),
                      );
                      toast.success("Equipment removed");
                    }}
                    className={cn(
                      "p-1 rounded transition-colors",
                      "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10",
                    )}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drying Duration */}
        <div>
          <h4
            className={cn(
              "text-sm font-semibold mb-3",
              "text-neutral-800 dark:text-slate-300",
            )}
          >
            Drying Duration
          </h4>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label
                className={cn(
                  "block text-xs font-medium mb-1",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                Estimated Drying Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={dryingDuration}
                onChange={(e) =>
                  setDryingDuration(parseInt(e.target.value) || 4)
                }
                className={cn(
                  "w-full px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 text-sm",
                  "bg-neutral-50 dark:bg-slate-700/50 border border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-slate-400",
                )}
              />
            </div>
            <div className="pt-6">
              <span
                className={cn(
                  "text-sm",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                {dryingDuration === 1 ? "1 day" : `${dryingDuration} days`}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Estimated duration for complete drying based on affected area and
            classification
          </p>
        </div>
      </div>
        </>
      )}

      {/* Photos */}
      <div
        className={cn(
          "p-6 rounded-lg border",
          "bg-white dark:bg-slate-800/30 border-neutral-200 dark:border-slate-700/50",
        )}
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            "text-neutral-900 dark:text-white",
          )}
        >
          <Camera className="w-5 h-5" />
          Photos <span className="text-destructive">*</span>
        </h3>

        {validationErrors.photos && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-destructive text-sm">{validationErrors.photos}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.id || index} className="relative">
              {photo.uploading ? (
                <div
                  className={cn(
                    "w-full h-32 rounded-lg border-2 flex items-center justify-center",
                    "border-neutral-300 dark:border-slate-600 bg-neutral-100 dark:bg-slate-900/50",
                  )}
                >
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                </div>
              ) : photo.error && photo.file ? (
                <div role="status" className="min-h-32 rounded-lg border border-amber-500/50 p-2 text-xs">
                  <p className="font-medium break-all">{photo.originalFile?.name ?? photo.file.name}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">{photo.error}</p>
                  <p className="mt-1 text-amber-700 dark:text-amber-300">The upload may have reached this inspection. Retry with the same file, or save your original before removing this selection.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={uploadingPhotos} onClick={() => void handleRetryPhoto(photo)} className="rounded border px-2 py-1 disabled:opacity-50">
                      Retry this photo
                    </button>
                    <button type="button" onClick={() => handleSaveOriginalPhoto(photo)} className="rounded border px-2 py-1">
                      Save original copy
                    </button>
                    <button type="button" onClick={() => handleRemoveFailedPhoto(photo)} className="rounded border px-2 py-1">
                      Remove selection
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={
                      photo.url ||
                      (photo.file ? URL.createObjectURL(photo.file) : "")
                    }
                    alt={`Photo ${index + 1}`}
                    className={cn(
                      "w-full h-32 object-cover rounded-lg border-2",
                      "border-neutral-300 dark:border-slate-600",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => void handleRemovePhoto(photo.id)}
                    disabled={deletingPhotoId !== null}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 hover:scale-110 active:scale-95 transition-all duration-200 shadow-md hover:shadow-lg group"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90" />
                  </button>
                </>
              )}
            </div>
          ))}

          <label
            className={cn(
              "w-full h-32 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 group bg-slate-900/50",
              uploadingPhotos
                ? "border-slate-500 cursor-wait opacity-50"
                : "border-slate-600 hover:border-cyan-500 hover:bg-slate-800/50 hover:scale-[1.02] active:scale-[0.98]",
            )}
          >
            <div className="text-center">
              {uploadingPhotos ? (
                <Loader2 className="w-8 h-8 text-cyan-400 mx-auto mb-2 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 mx-auto mb-2 transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1" />
              )}
              <span
                className={cn(
                  "text-xs transition-colors duration-200 font-medium",
                  uploadingPhotos
                    ? "text-slate-500"
                    : "text-slate-400 group-hover:text-cyan-400",
                )}
              >
                {uploadingPhotos ? "Uploading..." : "Add Photo"}
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              // Keep enabled so the file picker always opens; prerequisites are
              // validated in handlePhotoUpload with a toast (disabled inputs
              // swallow clicks and look like "nothing happens").
              disabled={uploadingPhotos}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {!claimType
            ? "Select a claim type, then enter address and postcode before uploading photos."
            : !propertyAddress.trim() || !propertyPostcode.trim()
              ? "Enter property address and postcode first. Inspection will be created automatically, then you can upload photos."
              : inspectionId
                ? "Upload photos of each affected area. Photos are saved to Cloudinary with a timestamp."
                : "Photos upload as soon as you pick them — the inspection is created automatically if needed."}
        </p>
      </div>

      {inspectionId && (
        <div className="space-y-2">
          <MakeSafeChecklist inspectionId={inspectionId} />
          <p className="text-xs text-muted-foreground">
            Mark applicable stabilisation items complete (or leave as N/A), then
            save the checklist before submitting.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="sticky bottom-0 z-10 flex justify-end gap-4 py-4 px-0 bg-white dark:bg-slate-950 border-t border-neutral-200 dark:border-slate-800">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "px-6 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md",
              "border border-neutral-300 dark:border-slate-600 hover:bg-neutral-100 dark:hover:bg-slate-700/50 hover:border-neutral-400 dark:hover:border-slate-500",
              "text-neutral-900 dark:text-white",
            )}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            // Save draft (auto-create inspection and save data without requiring photos)
            try {
              setSaving(true);
              if (!claimType) {
                toast.error("Please select a claim type first");
                setSaving(false);
                return;
              }
              if (!propertyAddress.trim() || !propertyPostcode.trim()) {
                toast.error("Please enter property address and postcode first");
                setSaving(false);
                return;
              }
              if (hasPartialEnvironmentalData) {
                toast.error(partialEnvironmentalMessage);
                setSaving(false);
                return;
              }

              let currentInspectionId =
                inspectionId || (await ensureInspectionExists(true)); // Show toast

              if (!currentInspectionId) {
                toast.error("Failed to create inspection. Please try again.");
                setSaving(false);
                return;
              }

              if (currentInspectionId) {
                await saveDraftSnapshot(currentInspectionId);

                if (floorPlanImageUrl) {
                  const floorPlanResponse = await fetch(
                    `/api/inspections/${currentInspectionId}/floor-plan`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ imageUrl: floorPlanImageUrl }),
                    },
                  );
                  if (!floorPlanResponse.ok) {
                    throw new Error("Failed to save floor plan");
                  }
                }

                toast.success(
                  "Draft saved successfully! You can now upload photos and floor plan.",
                );
              } else {
                toast.error("Failed to save draft");
              }
            } catch (error: any) {
              toast.error(error.message || "Failed to save draft");
            } finally {
              setSaving(false);
            }
          }}
          disabled={
            saving || deletingPhotoId !== null || !propertyAddress.trim() || !propertyPostcode.trim()
          }
          className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 text-white hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={handleReview}
          disabled={saving || deletingPhotoId !== null}
          className="flex items-center gap-2 px-6 py-2 bg-brand-navy rounded-lg font-medium hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none text-white group"
        >
          <ClipboardCheck className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
          <span>Review & Submit</span>
          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
      </div>

      {/* Quick Fill Modal */}
      <Dialog open={showQuickFillModal} onOpenChange={setShowQuickFillModal}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-white flex items-center gap-2">
              <Zap className="w-6 h-6 text-purple-400" />
              Quick Fill Test Data
            </DialogTitle>
            <DialogDescription
              className={cn("text-neutral-600 dark:text-slate-400")}
            >
              Choose a use case to populate the form with sample NIR inspection
              data for testing
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
            {nirUseCases.map((useCase) => (
              <button
                key={useCase.id}
                type="button"
                onClick={() => populateQuickFillData(useCase.id)}
                className="w-full p-4 rounded-lg border-2 border-slate-700 bg-slate-800 hover:border-purple-500 hover:bg-slate-800/80 transition-all text-left group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-white group-hover:text-purple-300 transition-colors">
                      {useCase.name}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {useCase.description}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-purple-400 transition-colors flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
