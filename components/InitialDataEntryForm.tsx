"use client";

import { PropertyDataDisplay } from "@/components/property-data-display";
import { PropertyLookupButton } from "@/components/property-lookup-button";
import {
  AustralianAddressSearch,
  type ParsedAddress,
} from "@/components/forms/AustralianAddressSearch";
import {
  ReviewSection,
  ReportTypeSelection,
  QuickFillDialog,
  SURFACE_TYPES,
  WATER_SOURCES,
  SCOPE_ITEM_TYPES,
  type ScopeArea,
} from "@/components/inspection/data-entry";
import type { UseCaseData } from "@/components/inspection/data-entry/use-case-data";
import {
  afdUnits,
  airMovers,
  calculateTotalAmps,
  calculateTotalCost,
  calculateTotalDailyCost,
  desiccantDehumidifiers,
  getEquipmentDailyRate,
  getEquipmentGroupById,
  lgrDehumidifiers,
  type EquipmentSelection,
} from "@/lib/equipment-matrix";
import {
  calculateAFDUnitsRequired,
  calculateAirMoversRequired,
  calculateDryingPotential,
  calculateTotalVolume,
  calculateWaterRemovalTarget,
} from "@/lib/psychrometric-calculations";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Crown,
  Droplets,
  FileText,
  Info,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Sparkles,
  Thermometer,
  User,
  UserCog,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

interface InitialDataEntryFormProps {
  onSuccess?: (
    reportId: string,
    reportType?: "basic" | "enhanced" | "optimised",
  ) => void;
  initialReportId?: string | null; // Report ID when editing existing report
  initialData?: {
    clientName?: string;
    clientContactDetails?: string;
    propertyAddress?: string;
    propertyPostcode?: string;
    claimReferenceNumber?: string;
    incidentDate?: string;
    technicianAttendanceDate?: string;
    technicianName?: string;
    technicianFieldReport?: string;
    // Property Intelligence
    buildingAge?: string;
    structureType?: string;
    accessNotes?: string;
    // New Fields
    propertyId?: string;
    jobNumber?: string;
    reportInstructions?: string;
    // Additional Contact Information
    builderDeveloperCompanyName?: string;
    builderDeveloperContact?: string;
    builderDeveloperAddress?: string;
    builderDeveloperPhone?: string;
    ownerManagementContactName?: string;
    ownerManagementPhone?: string;
    ownerManagementEmail?: string;
    // Previous Maintenance & Repair History
    lastInspectionDate?: string;
    buildingChangedSinceLastInspection?: string;
    structureChangesSinceLastInspection?: string;
    previousLeakage?: string;
    emergencyRepairPerformed?: string;
    // Hazard Profile
    insurerName?: string;
    methamphetamineScreen?: string;
    methamphetamineTestCount?: string;
    biologicalMouldDetected?: boolean;
    biologicalMouldCategory?: string;
    // Timeline Estimation
    phase1StartDate?: string;
    phase1EndDate?: string;
    phase2StartDate?: string;
    phase2EndDate?: string;
    phase3StartDate?: string;
    phase3EndDate?: string;
    // Equipment & Tools Selection
    psychrometricWaterClass?: number;
    psychrometricTemperature?: number;
    psychrometricHumidity?: number;
    psychrometricSystemType?: "open" | "closed";
    scopeAreas?: Array<{
      name: string;
      length: number;
      width: number;
      height: number;
      wetPercentage: number;
    }>;
    equipmentMentioned?: string[];
    estimatedDryingDuration?: number;
    equipmentDeployment?: Array<{
      equipmentName: string;
      quantity: number;
      dailyRate: number;
      duration: number;
      totalCost: number;
    }>;
    totalEquipmentCost?: number;
    // NIR Inspection Data
    nirData?: {
      moistureReadings?: Array<{
        location: string;
        surfaceType: string;
        moistureLevel: number;
        depth: "Surface" | "Subsurface";
      }>;
      affectedAreas?: Array<{
        roomZoneId: string;
        affectedSquareFootage: number;
        waterSource: string;
        timeSinceLoss: number;
      }>;
      scopeItems?: string[];
    };
  };
  subscriptionStatus?: string;
}

// Helper function to normalize date strings to YYYY-MM-DD format
function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";

  // If already in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse various date formats
  const formats = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/, // DD/MM/YY or DD-MM-YY
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      let year, month, day;

      if (match[3].length === 4) {
        // Full year
        if (format === formats[0]) {
          // DD/MM/YYYY
          day = match[1].padStart(2, "0");
          month = match[2].padStart(2, "0");
          year = match[3];
        } else {
          // YYYY/MM/DD
          year = match[1];
          month = match[2].padStart(2, "0");
          day = match[3].padStart(2, "0");
        }
      } else {
        // 2-digit year
        day = match[1].padStart(2, "0");
        month = match[2].padStart(2, "0");
        const twoDigitYear = parseInt(match[3]);
        year = twoDigitYear > 50 ? `19${match[3]}` : `20${match[3]}`;
      }

      return `${year}-${month}-${day}`;
    }
  }

  // If we can't parse it, try using Date object
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch (e) {
    // Ignore parsing errors
  }

  return "";
}

export default function InitialDataEntryForm({
  onSuccess,
  initialReportId,
  initialData,
  subscriptionStatus,
}: InitialDataEntryFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const isTrial =
    subscriptionStatus === "TRIAL" || subscriptionStatus === "trial";
  const [quickFillCredits, setQuickFillCredits] = useState<number | null>(null);
  const [hasUnlimitedQuickFill, setHasUnlimitedQuickFill] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Assignee selection state (Manager for Technicians, Admin for Managers)
  const [assignees, setAssignees] = useState<
    Array<{ id: string; name: string | null; email: string }>
  >([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [formData, setFormData] = useState({
    clientName: initialData?.clientName || "",
    clientContactDetails: initialData?.clientContactDetails || "",
    propertyAddress: initialData?.propertyAddress || "",
    propertyPostcode: initialData?.propertyPostcode || "",
    claimReferenceNumber: initialData?.claimReferenceNumber || "",
    incidentDate: normalizeDate(initialData?.incidentDate || ""),
    technicianAttendanceDate: normalizeDate(
      initialData?.technicianAttendanceDate || "",
    ),
    technicianName: initialData?.technicianName || "",
    technicianFieldReport: initialData?.technicianFieldReport || "",
    // Property Intelligence
    buildingAge: initialData?.buildingAge || "",
    structureType: initialData?.structureType || "",
    accessNotes: initialData?.accessNotes || "",
    // New Fields: Property ID and Job No.
    propertyId: initialData?.propertyId || "",
    jobNumber: initialData?.jobNumber || "",
    // Cover Page: Instructions/Standards References
    reportInstructions: initialData?.reportInstructions || "",
    // Additional Contact Information
    builderDeveloperCompanyName: initialData?.builderDeveloperCompanyName || "",
    builderDeveloperContact: initialData?.builderDeveloperContact || "",
    builderDeveloperAddress: initialData?.builderDeveloperAddress || "",
    builderDeveloperPhone: initialData?.builderDeveloperPhone || "",
    ownerManagementContactName: initialData?.ownerManagementContactName || "",
    ownerManagementPhone: initialData?.ownerManagementPhone || "",
    ownerManagementEmail: initialData?.ownerManagementEmail || "",
    // Previous Maintenance & Repair History
    lastInspectionDate: normalizeDate(initialData?.lastInspectionDate || ""),
    buildingChangedSinceLastInspection:
      initialData?.buildingChangedSinceLastInspection || "",
    structureChangesSinceLastInspection:
      initialData?.structureChangesSinceLastInspection || "",
    previousLeakage: initialData?.previousLeakage || "",
    emergencyRepairPerformed: initialData?.emergencyRepairPerformed || "",
    // Hazard Profile
    insurerName: initialData?.insurerName || "",
    methamphetamineScreen: initialData?.methamphetamineScreen || "NEGATIVE",
    methamphetamineTestCount: initialData?.methamphetamineTestCount || "",
    biologicalMouldDetected: initialData?.biologicalMouldDetected || false,
    biologicalMouldCategory: initialData?.biologicalMouldCategory || "",
    // Timeline Estimation
    phase1StartDate: normalizeDate(initialData?.phase1StartDate || ""),
    phase1EndDate: normalizeDate(initialData?.phase1EndDate || ""),
    phase2StartDate: normalizeDate(initialData?.phase2StartDate || ""),
    phase2EndDate: normalizeDate(initialData?.phase2EndDate || ""),
    phase3StartDate: normalizeDate(initialData?.phase3StartDate || ""),
    phase3EndDate: normalizeDate(initialData?.phase3EndDate || ""),
  });

  // Analysis State
  const [reportId, setReportId] = useState<string | null>(
    initialReportId || null,
  );
  const [pricingConfig, setPricingConfig] = useState<any>(null);
  const hasAutoSelectedEquipment = useRef(false);

  // Property Lookup State (Phase 5)
  const [propertyData, setPropertyData] = useState<{
    yearBuilt?: number | null;
    wallMaterial?: string | null;
    wallConstruction?: string | null;
    roofMaterial?: string | null;
    floorType?: string | null;
    floorArea?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    landArea?: number | null;
    stories?: number | null;
  } | null>(null);
  const [propertyDataFetchedAt, setPropertyDataFetchedAt] = useState<
    string | null
  >(null);
  const [propertyLookupExpiresAt, setPropertyLookupExpiresAt] = useState<
    string | null
  >(null);

  // Update reportId when initialReportId prop changes
  useEffect(() => {
    if (initialReportId) {
      setReportId(initialReportId);
    }
  }, [initialReportId]);

  // Review and Report Type Selection State
  const [showReview, setShowReview] = useState(false);
  const [showReportTypeSelection, setShowReportTypeSelection] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<
    "basic" | "enhanced" | "optimised" | null
  >(null);

  // Use Case Selection Modal State
  const [showUseCaseModal, setShowUseCaseModal] = useState(false);

  // Wizard Step Management
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const requiresAssignee =
    session?.user?.role === "USER" || session?.user?.role === "MANAGER";

  // Define all steps
  const steps = [
    {
      id: 0,
      title: "Client Information",
      icon: User,
      description: "Enter client details and contact information",
      requiredFields: ["clientName"],
    },
    {
      id: 1,
      title: "Assignee Selection",
      icon: UserCog,
      description: "Assign report to manager or admin",
      requiredFields: ["selectedAssigneeId"],
      conditional: requiresAssignee,
    },
    {
      id: 2,
      title: "Property Information",
      icon: MapPin,
      description: "Property address, structure details, and access notes",
      requiredFields: ["propertyAddress", "propertyPostcode"],
    },
    {
      id: 3,
      title: "Claim Information",
      icon: FileText,
      description: "Insurance claim details and incident information",
      requiredFields: [],
    },
    {
      id: 4,
      title: "Cover Page Information",
      icon: FileText,
      description: "Report instructions and standards references",
      requiredFields: [],
    },
    {
      id: 5,
      title: "Additional Contacts",
      icon: User,
      description: "Builder, developer, and owner management contacts",
      requiredFields: [],
    },
    {
      id: 6,
      title: "Maintenance History",
      icon: Clock,
      description: "Previous inspection and repair history",
      requiredFields: [],
    },
    {
      id: 7,
      title: "Technician Report",
      icon: FileText,
      description: "Field report from the technician",
      requiredFields: ["technicianFieldReport"],
    },
    {
      id: 8,
      title: "NIR Inspection Data",
      icon: CheckCircle,
      description: "Moisture readings, affected areas, and scope items",
      requiredFields: [],
    },
    {
      id: 9,
      title: "Hazard Profile",
      icon: AlertTriangle,
      description: "Methamphetamine screening and biological mould detection",
      requiredFields: [],
    },
    {
      id: 10,
      title: "Timeline Estimation",
      icon: Clock,
      description: "Phase dates for make-safe, remediation, and verification",
      requiredFields: [],
    },
    {
      id: 11,
      title: "Equipment & Tools",
      icon: Wrench,
      description: "Psychrometric assessment and equipment selection",
      requiredFields: [],
    },
  ];

  // Filter steps based on conditions
  const visibleSteps = steps.filter(
    (step) => !step.conditional || step.conditional === true,
  );

  // Keep current step in bounds when visible steps change
  useEffect(() => {
    if (currentStep >= visibleSteps.length) {
      setCurrentStep(Math.max(0, visibleSteps.length - 1));
    }
  }, [currentStep, visibleSteps.length]);

  // Skip assignee step when not required
  useEffect(() => {
    if (!requiresAssignee && visibleSteps[currentStep]?.id === 1) {
      setCurrentStep((prev) => Math.min(prev + 1, visibleSteps.length - 1));
    }
  }, [currentStep, requiresAssignee, visibleSteps]);

  // Validate current step
  const validateStep = (stepIndex: number): boolean => {
    const step = visibleSteps[stepIndex];
    if (!step) return false;

    // Special validation for assignee step
    if (step.id === 1) {
      if (!requiresAssignee) return true;
      if (requiresAssignee && !selectedAssigneeId) {
        return false;
      }
      return true;
    }

    // Validate required fields
    for (const field of step.requiredFields) {
      if (field === "selectedAssigneeId") {
        if (!selectedAssigneeId) return false;
      } else if (
        !formData[field as keyof typeof formData] ||
        (typeof formData[field as keyof typeof formData] === "string" &&
          formData[field as keyof typeof formData].toString().trim() === "")
      ) {
        return false;
      }
    }
    return true;
  };

  // Handle next step
  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error("Please complete all required fields before proceeding");
      return;
    }

    // Mark current step as completed
    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    // Move to next step
    if (currentStep < visibleSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Check if step is accessible (all previous steps completed)
  const isStepAccessible = (stepIndex: number): boolean => {
    if (stepIndex === 0) return true;
    for (let i = 0; i < stepIndex; i++) {
      if (!completedSteps.has(i) && !validateStep(i)) {
        return false;
      }
    }
    return true;
  };

  // Equipment: Psychrometric Assessment
  const [waterClass, setWaterClass] = useState<1 | 2 | 3 | 4>(
    (initialData?.psychrometricWaterClass as 1 | 2 | 3 | 4) || 2,
  );
  const [temperature, setTemperature] = useState(
    initialData?.psychrometricTemperature || 25,
  );
  const [humidity, setHumidity] = useState(
    initialData?.psychrometricHumidity || 60,
  );
  const [systemType, setSystemType] = useState<"open" | "closed">(
    initialData?.psychrometricSystemType || "closed",
  );

  // Equipment: Scope Areas
  const [areas, setAreas] = useState<ScopeArea[]>(() => {
    if (initialData?.scopeAreas && initialData.scopeAreas.length > 0) {
      return initialData.scopeAreas.map((area, index) => ({
        id: `area-${Date.now()}-${index}`,
        name: area.name,
        length: area.length,
        width: area.width,
        height: area.height,
        wetPercentage: area.wetPercentage,
      }));
    }
    return [];
  });
  const [newArea, setNewArea] = useState<Omit<ScopeArea, "id">>({
    name: "",
    length: 4,
    width: 4,
    height: 2.7,
    wetPercentage: 100,
  });

  // Equipment: Equipment Selection
  const [equipmentSelections, setEquipmentSelections] = useState<
    EquipmentSelection[]
  >([]);
  const [durationDays, setDurationDays] = useState(
    initialData?.estimatedDryingDuration || 4,
  );

  // NIR State (only used when reportType is 'nir')
  const [nirEnvironmentalData, setNirEnvironmentalData] = useState({
    ambientTemperature: 25,
    humidityLevel: 60,
    dewPoint: 0,
    airCirculation: false,
  });

  const [nirMoistureReadings, setNirMoistureReadings] = useState<
    Array<{
      id: string;
      location: string;
      surfaceType: string;
      moistureLevel: number;
      depth: "Surface" | "Subsurface";
    }>
  >([]);

  const [newNirMoistureReading, setNewNirMoistureReading] = useState({
    location: "",
    surfaceType: "Drywall",
    moistureLevel: 0,
    depth: "Surface" as "Surface" | "Subsurface",
  });

  const [nirAffectedAreas, setNirAffectedAreas] = useState<
    Array<{
      id: string;
      roomZoneId: string;
      affectedSquareFootage: number;
      waterSource: string;
      timeSinceLoss: number;
    }>
  >([]);

  const [newNirAffectedArea, setNewNirAffectedArea] = useState({
    roomZoneId: "",
    affectedSquareFootage: 0,
    waterSource: "Clean Water",
    timeSinceLoss: 0,
  });

  const [nirSelectedScopeItems, setNirSelectedScopeItems] = useState<
    Set<string>
  >(new Set());
  // Photos are now only in Optimised flow (Tier 3), not in initial data entry

  // Calculate dew point for NIR
  useEffect(() => {
    const temp = nirEnvironmentalData.ambientTemperature;
    const humidity = nirEnvironmentalData.humidityLevel;
    const dewPoint = temp - (100 - humidity) / 5;
    setNirEnvironmentalData((prev) => ({
      ...prev,
      dewPoint: Math.round(dewPoint * 10) / 10,
    }));
  }, [
    nirEnvironmentalData.ambientTemperature,
    nirEnvironmentalData.humidityLevel,
  ]);

  // Fetch pricing config on mount
  useEffect(() => {
    const fetchPricingConfig = async () => {
      try {
        const response = await fetch("/api/pricing-config");
        if (response.ok) {
          const data = await response.json();
          // Use pricingConfig if available, otherwise use defaults (for free users)
          const config = data.pricingConfig || data.defaults || data;
          if (config) {
            setPricingConfig(config);
          }
        }
      } catch (error) {
        // Error fetching pricing config
      }
    };
    fetchPricingConfig();
  }, []);

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
        // Error fetching credits
      }
    };
    fetchQuickFillCredits();
  }, []);

  // Fetch assignees (Managers for Technicians, Admins for Managers)
  useEffect(() => {
    const fetchAssignees = async () => {
      const userRole = session?.user?.role;
      // Only fetch for Technicians (USER) and Managers (MANAGER)
      if (userRole === "USER" || userRole === "MANAGER") {
        setLoadingAssignees(true);
        try {
          const response = await fetch("/api/team/assignees");
          if (response.ok) {
            const data = await response.json();
            setAssignees(data.assignees || []);
            // Auto-select if there's only one assignee
            if (data.assignees?.length === 1) {
              setSelectedAssigneeId(data.assignees[0].id);
            }
          }
        } catch (error) {
          // Error fetching assignees
        } finally {
          setLoadingAssignees(false);
        }
      }
    };
    fetchAssignees();
  }, [session?.user?.role]);

  // Load NIR data and equipment data when reportId is available
  useEffect(() => {
    const loadReportData = async () => {
      if (!reportId) {
        return;
      }

      try {
        // Load NIR data
        const nirResponse = await fetch(`/api/reports/${reportId}/nir-data`);
        if (nirResponse.ok) {
          const nirData = await nirResponse.json();
          if (nirData.nirData) {
            // Load moisture readings
            if (
              nirData.nirData.moistureReadings &&
              Array.isArray(nirData.nirData.moistureReadings) &&
              nirData.nirData.moistureReadings.length > 0
            ) {
              const readings = nirData.nirData.moistureReadings.map(
                (r: any, idx: number) => ({
                  id: `mr-${Date.now()}-${idx}`,
                  location: r.location || "",
                  surfaceType: r.surfaceType || "Drywall",
                  moistureLevel: r.moistureLevel || 0,
                  depth: r.depth || ("Surface" as "Surface" | "Subsurface"),
                }),
              );
              setNirMoistureReadings(readings);
            }

            // Load affected areas
            if (
              nirData.nirData.affectedAreas &&
              Array.isArray(nirData.nirData.affectedAreas) &&
              nirData.nirData.affectedAreas.length > 0
            ) {
              const areas = nirData.nirData.affectedAreas.map(
                (a: any, idx: number) => ({
                  id: `aa-${Date.now()}-${idx}`,
                  roomZoneId: a.roomZoneId || "",
                  affectedSquareFootage: a.affectedSquareFootage || 0,
                  waterSource: a.waterSource || "Clean Water",
                  timeSinceLoss: a.timeSinceLoss || 0,
                }),
              );
              setNirAffectedAreas(areas);
            }

            // Load scope items
            if (
              nirData.nirData.scopeItems &&
              Array.isArray(nirData.nirData.scopeItems) &&
              nirData.nirData.scopeItems.length > 0
            ) {
              const selectedItems = new Set<string>(
                nirData.nirData.scopeItems
                  .filter((item: any) => item.isSelected !== false)
                  .map((item: any) => (item.itemType || item.id) as string),
              );
              setNirSelectedScopeItems(selectedItems);
            }
          }
        }

        // Load equipment data
        const equipmentResponse = await fetch(
          `/api/reports/${reportId}/equipment`,
        );
        if (equipmentResponse.ok) {
          const equipmentData = await equipmentResponse.json();

          if (equipmentData.psychrometricAssessment) {
            const psychro = equipmentData.psychrometricAssessment;
            if (psychro.waterClass) setWaterClass(psychro.waterClass);
            if (psychro.temperature !== undefined)
              setTemperature(psychro.temperature);
            if (psychro.humidity !== undefined) setHumidity(psychro.humidity);
            if (psychro.systemType) setSystemType(psychro.systemType);
          }

          if (
            equipmentData.scopeAreas &&
            Array.isArray(equipmentData.scopeAreas)
          ) {
            setAreas(
              equipmentData.scopeAreas.map((area: any, index: number) => ({
                id: `area-${Date.now()}-${index}`,
                name: area.name || "",
                length: area.length || 4,
                width: area.width || 4,
                height: area.height || 2.7,
                wetPercentage: area.wetPercentage || 100,
              })),
            );
          }

          if (
            equipmentData.equipmentSelection &&
            Array.isArray(equipmentData.equipmentSelection)
          ) {
            setEquipmentSelections(equipmentData.equipmentSelection);
            hasAutoSelectedEquipment.current = true; // Mark as already set to prevent auto-selection
          }

          if (equipmentData.estimatedDryingDuration) {
            setDurationDays(equipmentData.estimatedDryingDuration);
          }
        }
      } catch (error) {
        // Error loading report data
      }
    };

    loadReportData();
  }, [reportId]);

  // Populate NIR data from initialData when PDF is uploaded
  useEffect(() => {
    if (initialData?.nirData) {
      // Populate moisture readings
      if (
        initialData.nirData.moistureReadings &&
        Array.isArray(initialData.nirData.moistureReadings) &&
        initialData.nirData.moistureReadings.length > 0
      ) {
        const readings = initialData.nirData.moistureReadings.map(
          (r: any, idx: number) => ({
            id: `mr-upload-${Date.now()}-${idx}`,
            location: r.location || "",
            surfaceType: r.surfaceType || "Drywall",
            moistureLevel:
              typeof r.moistureLevel === "number"
                ? r.moistureLevel
                : parseFloat(r.moistureLevel) || 0,
            depth:
              r.depth === "Subsurface"
                ? ("Subsurface" as const)
                : ("Surface" as const),
          }),
        );
        setNirMoistureReadings(readings);
      }

      // Populate affected areas
      if (
        initialData.nirData.affectedAreas &&
        Array.isArray(initialData.nirData.affectedAreas) &&
        initialData.nirData.affectedAreas.length > 0
      ) {
        const areas = initialData.nirData.affectedAreas.map(
          (a: any, idx: number) => ({
            id: `aa-upload-${Date.now()}-${idx}`,
            roomZoneId: a.roomZoneId || "",
            affectedSquareFootage:
              typeof a.affectedSquareFootage === "number"
                ? a.affectedSquareFootage
                : parseFloat(a.affectedSquareFootage) || 0,
            waterSource: a.waterSource || "Clean Water",
            timeSinceLoss:
              typeof a.timeSinceLoss === "number"
                ? a.timeSinceLoss
                : parseFloat(a.timeSinceLoss) || 0,
          }),
        );
        setNirAffectedAreas(areas);
      }

      // Populate scope items
      if (
        initialData.nirData.scopeItems &&
        Array.isArray(initialData.nirData.scopeItems) &&
        initialData.nirData.scopeItems.length > 0
      ) {
        const selectedItems = new Set<string>(initialData.nirData.scopeItems);
        setNirSelectedScopeItems(selectedItems);
      }
    }
  }, [initialData?.nirData]);

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        clientName: initialData.clientName || "",
        clientContactDetails: initialData.clientContactDetails || "",
        propertyAddress: initialData.propertyAddress || "",
        propertyPostcode: initialData.propertyPostcode || "",
        claimReferenceNumber: initialData.claimReferenceNumber || "",
        incidentDate: normalizeDate(initialData.incidentDate || ""),
        technicianAttendanceDate: normalizeDate(
          initialData.technicianAttendanceDate || "",
        ),
        technicianName: initialData.technicianName || "",
        technicianFieldReport: initialData.technicianFieldReport || "",
        // Property Intelligence
        buildingAge: initialData.buildingAge || "",
        structureType: initialData.structureType || "",
        accessNotes: initialData.accessNotes || "",
        // New Fields
        propertyId: initialData.propertyId || "",
        jobNumber: initialData.jobNumber || "",
        reportInstructions: initialData.reportInstructions || "",
        builderDeveloperCompanyName:
          initialData.builderDeveloperCompanyName || "",
        builderDeveloperContact: initialData.builderDeveloperContact || "",
        builderDeveloperAddress: initialData.builderDeveloperAddress || "",
        builderDeveloperPhone: initialData.builderDeveloperPhone || "",
        ownerManagementContactName:
          initialData.ownerManagementContactName || "",
        ownerManagementPhone: initialData.ownerManagementPhone || "",
        ownerManagementEmail: initialData.ownerManagementEmail || "",
        lastInspectionDate: normalizeDate(initialData.lastInspectionDate || ""),
        buildingChangedSinceLastInspection:
          initialData.buildingChangedSinceLastInspection || "",
        structureChangesSinceLastInspection:
          initialData.structureChangesSinceLastInspection || "",
        previousLeakage: initialData.previousLeakage || "",
        emergencyRepairPerformed: initialData.emergencyRepairPerformed || "",
        // Hazard Profile
        insurerName: initialData.insurerName || "",
        methamphetamineScreen: initialData.methamphetamineScreen || "NEGATIVE",
        methamphetamineTestCount: initialData.methamphetamineTestCount || "",
        biologicalMouldDetected: initialData.biologicalMouldDetected || false,
        biologicalMouldCategory: initialData.biologicalMouldCategory || "",
        // Timeline Estimation
        phase1StartDate: normalizeDate(initialData.phase1StartDate || ""),
        phase1EndDate: normalizeDate(initialData.phase1EndDate || ""),
        phase2StartDate: normalizeDate(initialData.phase2StartDate || ""),
        phase2EndDate: normalizeDate(initialData.phase2EndDate || ""),
        phase3StartDate: normalizeDate(initialData.phase3StartDate || ""),
        phase3EndDate: normalizeDate(initialData.phase3EndDate || ""),
      });

      // Update Equipment & Tools Selection data - MUST be set before auto-selection
      if (initialData.psychrometricWaterClass) {
        setWaterClass(initialData.psychrometricWaterClass as 1 | 2 | 3 | 4);
      }
      if (
        initialData.psychrometricTemperature !== undefined &&
        initialData.psychrometricTemperature !== null
      ) {
        setTemperature(initialData.psychrometricTemperature);
      }
      if (
        initialData.psychrometricHumidity !== undefined &&
        initialData.psychrometricHumidity !== null
      ) {
        setHumidity(initialData.psychrometricHumidity);
      }
      if (initialData.psychrometricSystemType) {
        setSystemType(initialData.psychrometricSystemType);
      }
      if (initialData.scopeAreas && initialData.scopeAreas.length > 0) {
        const areasToSet = initialData.scopeAreas.map((area, index) => ({
          id: `area-${Date.now()}-${index}`,
          name: area.name || `Area ${index + 1}`,
          length: area.length || 4,
          width: area.width || 4,
          height: area.height || 2.7,
          wetPercentage: area.wetPercentage || 100,
        }));

        setAreas(areasToSet);

        setTimeout(() => {
          if (pricingConfig && !hasAutoSelectedEquipment.current) {
            // The auto-selection useEffect will handle this
          }
        }, 100);
      }
      if (initialData.estimatedDryingDuration) {
        setDurationDays(initialData.estimatedDryingDuration);
      }

      // Populate equipment from extracted equipment deployment data (from PDF)
      if (
        initialData.equipmentDeployment &&
        Array.isArray(initialData.equipmentDeployment) &&
        initialData.equipmentDeployment.length > 0
      ) {
        const equipmentSelectionsFromPDF: EquipmentSelection[] = [];

        initialData.equipmentDeployment.forEach((eq: any) => {
          // Try to match equipment name to equipment group
          // Look for patterns like "55L/Day", "800 CFM", "LGR", "Desiccant", "Air Mover"
          const eqName = (eq.equipmentName || "").toLowerCase();
          let matchedGroupId: string | null = null;

          // Match dehumidifiers by capacity (e.g., "55L/Day" -> look for 55L capacity)
          if (
            eqName.includes("l/day") ||
            eqName.includes("lgr") ||
            eqName.includes("dehumidifier")
          ) {
            const capacityMatch = eqName.match(/(\d+)\s*l/);
            if (capacityMatch) {
              const capacity = parseInt(capacityMatch[1]);
              // Find matching LGR group by capacity
              const matchingGroup = lgrDehumidifiers.find((g) => {
                const groupCapacity = g.capacity.match(/(\d+)/);
                return groupCapacity && parseInt(groupCapacity[1]) === capacity;
              });
              if (matchingGroup) {
                matchedGroupId = matchingGroup.id;
              }
            }
            // If no exact match, use first LGR as fallback
            if (!matchedGroupId && lgrDehumidifiers.length > 0) {
              matchedGroupId = lgrDehumidifiers[0].id;
            }
          }
          // Match air movers by CFM (e.g., "800 CFM" -> look for 800 CFM airflow)
          else if (
            eqName.includes("cfm") ||
            eqName.includes("air mover") ||
            eqName.includes("fan")
          ) {
            const cfmMatch = eqName.match(/(\d+)\s*cfm/);
            if (cfmMatch) {
              const cfm = parseInt(cfmMatch[1]);
              // Find matching air mover by airflow
              const matchingGroup = airMovers.find((g) => {
                return g.airflow && Math.abs(g.airflow - cfm) < 100; // Allow 100 CFM tolerance
              });
              if (matchingGroup) {
                matchedGroupId = matchingGroup.id;
              }
            }
            // If no exact match, use first air mover as fallback
            if (!matchedGroupId && airMovers.length > 0) {
              matchedGroupId = airMovers[0].id;
            }
          }
          // Match desiccant dehumidifiers
          else if (eqName.includes("desiccant")) {
            if (desiccantDehumidifiers.length > 0) {
              matchedGroupId = desiccantDehumidifiers[0].id;
            }
          }

          if (matchedGroupId && pricingConfig) {
            const dailyRate =
              eq.dailyRate ||
              getEquipmentDailyRate(matchedGroupId, pricingConfig);
            equipmentSelectionsFromPDF.push({
              groupId: matchedGroupId,
              quantity: eq.quantity || 1,
              dailyRate: dailyRate,
            });

            // Use duration from equipment deployment if available
            if (eq.duration && eq.duration > 0) {
              setDurationDays(eq.duration);
            }
          }
        });

        if (equipmentSelectionsFromPDF.length > 0) {
          setEquipmentSelections(equipmentSelectionsFromPDF);
          hasAutoSelectedEquipment.current = true; // Prevent auto-selection when using PDF data
        }
      }
    }
  }, [initialData, pricingConfig]);

  // Auto-select equipment when areas are set and pricing config is loaded
  useEffect(() => {
    // Only auto-select if:
    // 1. pricingConfig is loaded
    // 2. We have areas (either from state or initialData)
    // 3. We have psychrometric data
    // 4. We haven't already auto-selected equipment
    const areasToUse =
      areas.length > 0
        ? areas
        : initialData?.scopeAreas?.map((area, index) => ({
            id: `temp-area-${index}`,
            name: area.name,
            length: area.length,
            width: area.width,
            height: area.height,
            wetPercentage: area.wetPercentage,
          })) || [];

    const waterClassToUse =
      waterClass ||
      (initialData?.psychrometricWaterClass as 1 | 2 | 3 | 4) ||
      2;
    const tempToUse =
      temperature || initialData?.psychrometricTemperature || 25;
    const humidityToUse = humidity || initialData?.psychrometricHumidity || 60;

    const shouldAutoSelect =
      pricingConfig &&
      areasToUse.length > 0 &&
      waterClassToUse &&
      tempToUse !== undefined &&
      humidityToUse !== undefined &&
      !hasAutoSelectedEquipment.current &&
      !(
        initialData?.equipmentDeployment &&
        initialData.equipmentDeployment.length > 0
      ); // Don't auto-select if PDF has equipment data

    if (shouldAutoSelect) {
      // Calculate targets based on areas and water class
      const { totalVolume, totalAffectedArea } =
        calculateTotalVolume(areasToUse);
      const waterRemovalTarget = calculateWaterRemovalTarget(
        totalVolume,
        waterClassToUse,
        totalAffectedArea,
      );
      const airMoversRequired = calculateAirMoversRequired(
        totalAffectedArea,
        waterClassToUse,
      );

      // Auto-select equipment (S500-aligned targets)
      const selections: EquipmentSelection[] = [];

      // Dehumidification (L/Day target) - choose the smallest number of units by starting with the largest LGR
      let remainingCapacity = waterRemovalTarget;
      const lgrGroups = [...lgrDehumidifiers].sort((a, b) => {
        const aCap = parseInt((a.capacity.match(/(\d+)/) || [])[1] || "0");
        const bCap = parseInt((b.capacity.match(/(\d+)/) || [])[1] || "0");
        return bCap - aCap;
      });

      for (const group of lgrGroups) {
        if (remainingCapacity <= 0) break;
        const capacityMatch = group.capacity.match(/(\d+)/);
        const capacity = capacityMatch ? parseInt(capacityMatch[1]) : 0;
        if (!capacity) continue;

        const needed = Math.ceil(remainingCapacity / capacity);
        if (needed > 0) {
          const rate = getEquipmentDailyRate(group.id, pricingConfig);
          selections.push({
            groupId: group.id,
            quantity: needed,
            dailyRate: rate,
          });
          remainingCapacity -= capacity * needed;
        }
      }

      // Air movers - S500 count is "units", independent of individual CFM model
      if (airMoversRequired > 0) {
        const preferredAirMover =
          totalAffectedArea > 80
            ? "airmover-2500"
            : totalAffectedArea > 30
              ? "airmover-1500"
              : "airmover-800";
        const rate = getEquipmentDailyRate(preferredAirMover, pricingConfig);
        selections.push({
          groupId: preferredAirMover,
          quantity: airMoversRequired,
          dailyRate: rate,
        });
      }

      if (selections.length > 0) {
        setEquipmentSelections(selections);
        hasAutoSelectedEquipment.current = true;
      }
    }
  }, [areas, pricingConfig, waterClass, temperature, humidity, initialData]);

  // Equipment Calculations
  const dryingPotential = calculateDryingPotential({
    waterClass,
    temperature,
    humidity,
    systemType,
  });

  // Use areas from state, or fallback to initialData.scopeAreas if areas is empty
  const areasForCalculation =
    areas.length > 0
      ? areas
      : initialData?.scopeAreas && initialData.scopeAreas.length > 0
        ? initialData.scopeAreas.map((area, index) => ({
            id: `calc-area-${index}`,
            name: area.name,
            length: area.length,
            width: area.width,
            height: area.height,
            wetPercentage: area.wetPercentage,
          }))
        : [];

  const { totalVolume, totalAffectedArea } =
    calculateTotalVolume(areasForCalculation);
  const waterRemovalTarget = calculateWaterRemovalTarget(
    totalVolume,
    waterClass,
    totalAffectedArea,
  );
  const airMoversRequired = calculateAirMoversRequired(
    totalAffectedArea,
    waterClass,
  );

  // Determine whether air filtration is required (mould and/or Category 2/3 contamination indicators).
  const requiresAFD =
    Boolean(formData.biologicalMouldDetected) ||
    nirAffectedAreas.some(
      (a) => (a.waterSource || "").toLowerCase() !== "clean water",
    );

  const afdUnitsRequired = calculateAFDUnitsRequired(
    totalAffectedArea,
    requiresAFD,
  );

  const totalAmps = calculateTotalAmps(equipmentSelections);
  const totalDailyCost = calculateTotalDailyCost(
    equipmentSelections,
    pricingConfig,
  );
  const totalCost = calculateTotalCost(
    equipmentSelections,
    durationDays,
    pricingConfig,
  );

  const totalEquipmentCapacity = equipmentSelections.reduce((total, sel) => {
    const group = getEquipmentGroupById(sel.groupId);
    if (
      group &&
      (sel.groupId.startsWith("lgr-") || sel.groupId.startsWith("desiccant-"))
    ) {
      const capacityMatch = group.capacity.match(/(\d+)/);
      if (capacityMatch) {
        return total + parseInt(capacityMatch[1]) * sel.quantity;
      }
    }
    return total;
  }, 0);

  const totalAirflow = equipmentSelections.reduce((total, sel) => {
    // Only count air movers toward "air movement" target (exclude AFD units which also have airflow).
    if (!sel.groupId.startsWith("airmover-")) return total;
    const group = getEquipmentGroupById(sel.groupId);
    if (group && group.airflow) {
      return total + group.airflow * sel.quantity;
    }
    return total;
  }, 0);

  const totalAirMoverUnits = equipmentSelections.reduce((total, sel) => {
    if (!sel.groupId.startsWith("airmover-")) return total;
    return total + sel.quantity;
  }, 0);

  const totalAFDUnits = equipmentSelections.reduce((total, sel) => {
    if (!sel.groupId.startsWith("afd-")) return total;
    return total + sel.quantity;
  }, 0);

  // Equipment Helper Functions
  const handleAddArea = () => {
    if (!newArea.name.trim()) {
      toast.error("Please enter an area name");
      return;
    }
    const area: ScopeArea = {
      ...newArea,
      id: Date.now().toString(),
    };
    setAreas([...areas, area]);
    setNewArea({
      name: "",
      length: 4,
      width: 4,
      height: 2.7,
      wetPercentage: 100,
    });
    toast.success("Area added");
  };

  const handleRemoveArea = (id: string) => {
    setAreas(areas.filter((a) => a.id !== id));
    toast.success("Area removed");
  };

  const handleEquipmentQuantityChange = (groupId: string, delta: number) => {
    setEquipmentSelections((prev) => {
      const existing = prev.find((s) => s.groupId === groupId);
      if (existing) {
        const newQuantity = Math.max(0, existing.quantity + delta);
        if (newQuantity === 0) {
          return prev.filter((s) => s.groupId !== groupId);
        }
        return prev.map((s) =>
          s.groupId === groupId ? { ...s, quantity: newQuantity } : s,
        );
      } else if (delta > 0) {
        const group = getEquipmentGroupById(groupId);
        const rate = pricingConfig
          ? getEquipmentDailyRate(groupId, pricingConfig)
          : 0;
        return [
          ...prev,
          {
            groupId,
            quantity: 1,
            dailyRate: rate,
          },
        ];
      }
      return prev;
    });
  };

  const handleAutoSelect = () => {
    const selections: EquipmentSelection[] = [];
    // Dehumidification (L/Day target) - choose the smallest number of units by starting with the largest LGR
    let remainingCapacity = waterRemovalTarget;
    const lgrGroups = [...lgrDehumidifiers].sort((a, b) => {
      const aCap = parseInt((a.capacity.match(/(\d+)/) || [])[1] || "0");
      const bCap = parseInt((b.capacity.match(/(\d+)/) || [])[1] || "0");
      return bCap - aCap;
    });

    for (const group of lgrGroups) {
      if (remainingCapacity <= 0) break;
      const capacityMatch = group.capacity.match(/(\d+)/);
      const capacity = capacityMatch ? parseInt(capacityMatch[1]) : 0;
      if (!capacity) continue;

      const needed = Math.ceil(remainingCapacity / capacity);
      if (needed > 0) {
        const rate = pricingConfig
          ? getEquipmentDailyRate(group.id, pricingConfig)
          : 0;
        selections.push({
          groupId: group.id,
          quantity: needed,
          dailyRate: rate,
        });
        remainingCapacity -= capacity * needed;
      }
    }

    // Air movers - S500 count is "units", independent of individual CFM model
    if (airMoversRequired > 0) {
      const preferredAirMover =
        totalAffectedArea > 80
          ? "airmover-2500"
          : totalAffectedArea > 30
            ? "airmover-1500"
            : "airmover-800";
      const rate = pricingConfig
        ? getEquipmentDailyRate(preferredAirMover, pricingConfig)
        : 0;
      selections.push({
        groupId: preferredAirMover,
        quantity: airMoversRequired,
        dailyRate: rate,
      });
    }

    // AFD units (HEPA / air scrubbers) - only when contamination/mould indicators require it
    if (afdUnitsRequired > 0) {
      const afdGroupId = afdUnits[0]?.id || "afd-500";
      const rate = pricingConfig
        ? getEquipmentDailyRate(afdGroupId, pricingConfig)
        : 0;
      selections.push({
        groupId: afdGroupId,
        quantity: afdUnitsRequired,
        dailyRate: rate,
      });
    }
    setEquipmentSelections(selections);
    toast.success("Equipment auto-selected based on targets");
  };

  const handleReportTypeChoice = async (
    choice: "basic" | "enhanced" | "optimised",
  ) => {
    if (!reportId) return;

    if (isTrial && choice !== "basic") {
      toast.error(
        "Free plan allows 3 Basic reports only. Upgrade to unlock Enhanced or Optimised.",
      );
      return;
    }

    setLoading(true);
    try {
      // Update report with reportDepthLevel
      const reportDepthLevel =
        choice === "basic"
          ? "Basic"
          : choice === "enhanced"
            ? "Enhanced"
            : "Optimised";
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDepthLevel,
        }),
      });

      if (response.ok) {
        setSelectedReportType(choice);
        setShowReportTypeSelection(false);
        toast.success(`Report type set to ${choice}`);
        if (onSuccess) {
          onSuccess(reportId, choice);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update report type");
      }
    } catch (error) {
      toast.error("Failed to update report type");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate required fields
    if (!formData.clientName.trim()) {
      toast.error("Client name is required");
      setLoading(false);
      return;
    }

    if (!formData.propertyAddress.trim()) {
      toast.error("Property address is required");
      setLoading(false);
      return;
    }

    if (!formData.propertyPostcode.trim()) {
      toast.error("Property postcode is required");
      setLoading(false);
      return;
    }

    // Validate technician field report (required for all report types)
    if (!formData.technicianFieldReport.trim()) {
      toast.error("Technician field report is required");
      setLoading(false);
      return;
    }

    // Validate assignee selection for Technicians and Managers
    const userRole = session?.user?.role;
    if (
      (userRole === "USER" || userRole === "MANAGER") &&
      !selectedAssigneeId
    ) {
      toast.error(
        `Please select a ${userRole === "USER" ? "Manager" : "Admin"} for this report`,
      );
      setLoading(false);
      return;
    }

    try {
      // Prepare NIR data
      const nirData = {
        moistureReadings:
          nirMoistureReadings.length > 0
            ? nirMoistureReadings.map((r) => ({
                location: r.location,
                surfaceType: r.surfaceType,
                moistureLevel: r.moistureLevel,
                depth: r.depth,
              }))
            : [],
        affectedAreas:
          nirAffectedAreas.length > 0
            ? nirAffectedAreas.map((a) => ({
                roomZoneId: a.roomZoneId,
                affectedSquareFootage: a.affectedSquareFootage,
                waterSource: a.waterSource,
                timeSinceLoss: a.timeSinceLoss,
              }))
            : [],
        scopeItems: Array.from(nirSelectedScopeItems).map((itemId) => {
          const item = SCOPE_ITEM_TYPES.find((i) => i.id === itemId);
          return {
            itemType: itemId,
            description: item?.label || itemId,
            autoDetermined: false,
            isSelected: true,
          };
        }),
        photos: [], // Photos are only in Tier 3, not initial entry
      };

      // Prepare equipment data
      const equipmentData =
        areas.length > 0 || equipmentSelections.length > 0
          ? {
              psychrometricAssessment: {
                waterClass,
                temperature,
                humidity,
                systemType,
                dryingPotential,
              },
              scopeAreas: areas,
              equipmentSelection: equipmentSelections,
              equipmentCostTotal: totalCost,
              estimatedDryingDuration: durationDays,
              metrics: {
                totalVolume,
                totalAffectedArea,
                waterRemovalTarget,
                airMoversRequired,
                totalAmps,
                totalDailyCost,
              },
            }
          : null;

      // Prepare assignee data based on user role
      const assigneeData: {
        assignedManagerId?: string;
        assignedAdminId?: string;
      } = {};
      if (userRole === "USER" && selectedAssigneeId) {
        assigneeData.assignedManagerId = selectedAssigneeId;
      } else if (userRole === "MANAGER" && selectedAssigneeId) {
        assigneeData.assignedAdminId = selectedAssigneeId;
      }

      // Single API call to save all data
      const response = await fetch("/api/reports/initial-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ...assigneeData, // Include assignee selection
          incidentDate: formData.incidentDate
            ? new Date(formData.incidentDate).toISOString()
            : null,
          technicianAttendanceDate: formData.technicianAttendanceDate
            ? new Date(formData.technicianAttendanceDate).toISOString()
            : null,
          lastInspectionDate: formData.lastInspectionDate
            ? new Date(formData.lastInspectionDate).toISOString()
            : null,
          // Include NIR data if provided
          nirData:
            nirData.moistureReadings.length > 0 ||
            nirData.affectedAreas.length > 0 ||
            nirData.scopeItems.length > 0
              ? nirData
              : null,
          // Include equipment data if provided
          equipmentData: equipmentData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newReportId = data.report.id;
        setReportId(newReportId);
        toast.success("All data saved successfully");

        // Show review page first, then report type selection
        setShowReview(true);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save data");
      }
    } catch (error) {
      toast.error("Failed to save data");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    field: string,
    value: string | number | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Use Case Data — definitions in @/components/inspection/data-entry/use-case-data

  // Populate form data based on selected use case (data from extracted module)
  const populateUseCaseData = (useCase: UseCaseData) => {
    setFormData(useCase.formData as typeof formData);
    setNirMoistureReadings(useCase.nirMoistureReadings);
    setNirAffectedAreas(useCase.nirAffectedAreas);
    setNirSelectedScopeItems(useCase.nirSelectedScopeItems);
    setNirEnvironmentalData(useCase.nirEnvironmentalData);
    setWaterClass(useCase.waterClass);
    setTemperature(useCase.temperature);
    setHumidity(useCase.humidity);
    setSystemType(useCase.systemType);
    setAreas(useCase.areas);
    setDurationDays(useCase.durationDays);

    // Update equipment rates from current pricing config
    const equipmentSelectionsWithRates = useCase.equipmentSelections.map(
      (sel) => ({
        ...sel,
        dailyRate: pricingConfig
          ? getEquipmentDailyRate(sel.groupId, pricingConfig)
          : sel.dailyRate,
      }),
    );
    setEquipmentSelections(equipmentSelectionsWithRates);

    toast.success(`Form filled with "${useCase.name}" use case data`);
    setShowUseCaseModal(false);
  };

  // Quick Fill with Test Data - Check credits and show modal
  const handleQuickFill = async () => {
    // Check if user has credits or unlimited access
    if (
      !hasUnlimitedQuickFill &&
      (quickFillCredits === null || quickFillCredits <= 0)
    ) {
      toast.error(
        "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.",
      );
      router.push("/dashboard/pricing");
      return;
    }

    // Deduct credit if not unlimited
    if (!hasUnlimitedQuickFill) {
      setLoadingCredits(true);
      try {
        const response = await fetch("/api/user/quick-fill-credits", {
          method: "POST",
        });

        if (response.ok) {
          const data = await response.json();
          setQuickFillCredits(data.creditsRemaining);
          setShowUseCaseModal(true);
        } else {
          const error = await response.json();
          if (error.requiresUpgrade) {
            toast.error(
              "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.",
            );
            router.push("/dashboard/pricing");
          } else {
            toast.error(error.error || "Failed to use Quick Fill credit");
          }
        }
      } catch (error) {
        toast.error("Failed to check Quick Fill credits");
      } finally {
        setLoadingCredits(false);
      }
    } else {
      // Unlimited access - just open modal
      setShowUseCaseModal(true);
    }
  };

  // Prevent modal from opening if user has no credits (extra safeguard)
  const handleModalOpenChange = (open: boolean) => {
    if (
      open &&
      !hasUnlimitedQuickFill &&
      (quickFillCredits === null || quickFillCredits <= 0)
    ) {
      toast.error(
        "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.",
      );
      return;
    }
    setShowUseCaseModal(open);
  };

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2
              className={cn(
                "text-2xl font-semibold mb-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              Initial Data Entry
            </h2>
            <p className={cn("text-neutral-600 dark:text-neutral-400")}>
              Complete each step to build your report. All fields marked with *
              are required.
            </p>
          </div>
          <button
            type="button"
            onClick={handleQuickFill}
            disabled={
              loadingCredits ||
              (!hasUnlimitedQuickFill &&
                (quickFillCredits === null || quickFillCredits <= 0))
            }
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap",
              !hasUnlimitedQuickFill &&
                (quickFillCredits === null || quickFillCredits <= 0)
                ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white dark:text-white",
            )}
            title={
              hasUnlimitedQuickFill
                ? "Quick Fill Test Data (Unlimited)"
                : quickFillCredits !== null && quickFillCredits > 0
                  ? `Quick Fill Test Data (${quickFillCredits} credit${quickFillCredits !== 1 ? "s" : ""} remaining)`
                  : "No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access."
            }
          >
            <Zap className="w-4 h-4" />
            Quick Fill Test Data
            {!hasUnlimitedQuickFill &&
              quickFillCredits !== null &&
              quickFillCredits > 0 && (
                <span className="ml-1 text-xs">({quickFillCredits})</span>
              )}
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      <div
        className={cn(
          "mb-6 rounded-xl border",
          "bg-white dark:bg-neutral-900/60",
          "border-neutral-200 dark:border-neutral-800",
        )}
      >
        <div className="px-6 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className={cn(
                  "text-lg font-semibold",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                Step {currentStep + 1} of {visibleSteps.length}
              </h3>
              <p
                className={cn(
                  "text-sm",
                  "text-neutral-600 dark:text-neutral-400",
                )}
              >
                {visibleSteps[currentStep]?.title}
              </p>
            </div>
            <div
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-semibold",
                "bg-blue-500/10 dark:bg-cyan-500/10 text-blue-600 dark:text-cyan-400",
              )}
            >
              {Math.round(((currentStep + 1) / visibleSteps.length) * 100)}%
            </div>
          </div>
        </div>

        <div className="px-6 pt-4">
          <div
            className={cn(
              "h-2 rounded-full overflow-hidden",
              "bg-neutral-200 dark:bg-slate-700",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                "bg-gradient-to-r from-blue-500 to-cyan-500",
              )}
              style={{
                width: `${((currentStep + 1) / visibleSteps.length) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="px-6 pb-4">
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
            {visibleSteps.map((step, index) => {
              const isCompleted =
                completedSteps.has(index) || index < currentStep;
              const isCurrent = index === currentStep;
              const isAccessible = isStepAccessible(index);

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (isAccessible || isCompleted) {
                      setCurrentStep(index);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  disabled={!isAccessible && !isCompleted}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                    isCurrent
                      ? "bg-blue-500 text-white"
                      : isCompleted
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : isAccessible
                          ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold",
                      isCurrent
                        ? "bg-white/20 text-white"
                        : isCompleted
                          ? "bg-green-500/20 text-green-600 dark:text-green-400"
                          : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    {index + 1}
                  </span>
                  {step.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 0: Client Information Section */}
        {visibleSteps[currentStep]?.id === 0 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <User className="w-4 h-4" />
              Client Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Client Name{" "}
                  <span className={cn("text-error-500 dark:text-error-400")}>
                    *
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.clientName}
                  onChange={(e) =>
                    handleInputChange("clientName", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="Enter client's full name"
                />
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Client Contact Details
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  <input
                    type="text"
                    value={formData.clientContactDetails}
                    onChange={(e) =>
                      handleInputChange("clientContactDetails", e.target.value)
                    }
                    className={cn(
                      "w-full pl-10 pr-4 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                    placeholder="Phone number, email, etc."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Assignee Selection Section (for Technicians and Managers) */}
        {visibleSteps[currentStep]?.id === 1 && requiresAssignee && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              {session?.user?.role === "USER" ? (
                <UserCog className="w-4 h-4" />
              ) : (
                <Crown className="w-4 h-4" />
              )}
              {session?.user?.role === "USER"
                ? "Assign to Manager"
                : "Assign to Admin"}
            </h3>

            <div className="space-y-2">
              <label
                className={cn(
                  "block text-sm font-medium",
                  "text-neutral-700 dark:text-neutral-300",
                )}
              >
                {session?.user?.role === "USER" ? "Manager" : "Admin"}{" "}
                <span className={cn("text-error-500 dark:text-error-400")}>
                  *
                </span>
              </label>

              {loadingAssignees ? (
                <div
                  className={cn(
                    "flex items-center gap-2 py-2",
                    "text-neutral-600 dark:text-neutral-400",
                  )}
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    Loading{" "}
                    {session?.user?.role === "USER" ? "managers" : "admins"}...
                  </span>
                </div>
              ) : assignees.length === 0 ? (
                <div
                  className={cn(
                    "p-3 rounded-lg text-sm",
                    "bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400",
                  )}
                >
                  No {session?.user?.role === "USER" ? "managers" : "admins"}{" "}
                  available in your organization.
                </div>
              ) : (
                <select
                  required
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                >
                  <option value="">
                    Select{" "}
                    {session?.user?.role === "USER" ? "a Manager" : "an Admin"}
                    ...
                  </option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name || assignee.email}
                    </option>
                  ))}
                </select>
              )}

              <p
                className={cn(
                  "text-xs",
                  "text-neutral-600 dark:text-neutral-400",
                )}
              >
                {session?.user?.role === "USER"
                  ? "Select the manager who will oversee this report."
                  : "Select the admin who will oversee this report."}
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Property Information Section */}
        {visibleSteps[currentStep]?.id === 2 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-xl font-semibold mb-4 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <MapPin className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              Property Information
            </h3>

            <div className="space-y-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-2",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Property Address{" "}
                  <span className="text-error-500 dark:text-error-400">*</span>
                </label>
                <AustralianAddressSearch
                  required
                  value={formData.propertyAddress}
                  onChange={(v) => handleInputChange("propertyAddress", v)}
                  onSelect={(parsed: ParsedAddress) => {
                    handleInputChange("propertyAddress", parsed.fullAddress);
                    if (parsed.postcode)
                      handleInputChange("propertyPostcode", parsed.postcode);
                  }}
                  placeholder="Start typing an address to search…"
                />
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-2",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Postcode{" "}
                  <span className="text-error-500 dark:text-error-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={formData.propertyPostcode}
                  onChange={(e) =>
                    handleInputChange(
                      "propertyPostcode",
                      e.target.value.replace(/\D/g, ""),
                    )
                  }
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="0000"
                />
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-600 dark:text-neutral-400",
                  )}
                >
                  Required for state detection and regulatory compliance
                </p>
              </div>

              {/* Phase 5: Property Lookup Button */}
              {reportId && (
                <div className="pt-2">
                  <PropertyLookupButton
                    inspectionId={reportId}
                    address={formData.propertyAddress}
                    postcode={formData.propertyPostcode}
                    label="Lookup Property Data ($2.30)"
                    onSuccess={(data) => {
                      setPropertyData(data.data || null);
                      setPropertyDataFetchedAt(new Date().toISOString());
                      setPropertyLookupExpiresAt(data.expiresAt);

                      // Update form with fetched data
                      if (data.data) {
                        handleInputChange(
                          "buildingAge",
                          data.data.yearBuilt?.toString() || "",
                        );
                      }
                    }}
                    onError={(error) => {
                      // Property lookup error
                    }}
                  />
                </div>
              )}

              {/* Phase 5: Property Data Display */}
              {propertyData && (
                <div
                  className={cn(
                    "pt-4 border-t",
                    "border-neutral-300 dark:border-neutral-700",
                  )}
                >
                  <PropertyDataDisplay
                    data={propertyData}
                    fetchedAt={propertyDataFetchedAt}
                    source="CORELOGIC"
                    expiresAt={propertyLookupExpiresAt}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-2",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Property ID
                  </label>
                  <input
                    type="text"
                    value={formData.propertyId}
                    onChange={(e) =>
                      handleInputChange("propertyId", e.target.value)
                    }
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                    placeholder="Property identifier"
                  />
                </div>
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-2",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Job Number
                  </label>
                  <input
                    type="text"
                    value={formData.jobNumber}
                    onChange={(e) =>
                      handleInputChange("jobNumber", e.target.value)
                    }
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                    placeholder="Job number"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-2",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Building Age
                  </label>
                  <input
                    type="text"
                    value={formData.buildingAge}
                    onChange={(e) =>
                      handleInputChange("buildingAge", e.target.value)
                    }
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                    placeholder="e.g., 2010 or 1985"
                  />
                </div>

                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-2",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Structure Type
                  </label>
                  <select
                    value={formData.structureType}
                    onChange={(e) =>
                      handleInputChange("structureType", e.target.value)
                    }
                    className={cn(
                      "w-full px-4 py-2 rounded-lg",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select structure type</option>
                    <option value="Residential - Single Storey">
                      Residential - Single Storey
                    </option>
                    <option value="Residential - Two Storey">
                      Residential - Two Storey
                    </option>
                    <option value="Residential - Multi-Storey">
                      Residential - Multi-Storey
                    </option>
                    <option value="Commercial - Single Storey">
                      Commercial - Single Storey
                    </option>
                    <option value="Commercial - Multi-Storey">
                      Commercial - Multi-Storey
                    </option>
                    <option value="Industrial">Industrial</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-2",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Access Notes
                </label>
                <textarea
                  value={formData.accessNotes}
                  onChange={(e) =>
                    handleInputChange("accessNotes", e.target.value)
                  }
                  className={cn(
                    "w-full px-4 py-2 rounded-lg",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="Key under mat, owner present, gate code, etc."
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Claim Information Section */}
        {visibleSteps[currentStep]?.id === 3 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <FileText className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              Claim Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Claim Reference Number
                </label>
                <input
                  type="text"
                  value={formData.claimReferenceNumber}
                  onChange={(e) =>
                    handleInputChange("claimReferenceNumber", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="Claim reference"
                />
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Insurer / Client Name
                </label>
                <input
                  type="text"
                  value={formData.insurerName}
                  onChange={(e) =>
                    handleInputChange("insurerName", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="Insurance company"
                />
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Date of Incident
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  <input
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) =>
                      handleInputChange("incidentDate", e.target.value)
                    }
                    className={cn(
                      "w-full pl-10 pr-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  />
                </div>
              </div>

              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Technician Attendance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  <input
                    type="date"
                    value={formData.technicianAttendanceDate}
                    onChange={(e) =>
                      handleInputChange(
                        "technicianAttendanceDate",
                        e.target.value,
                      )
                    }
                    className={cn(
                      "w-full pl-10 pr-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  />
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Technician Name
                </label>
                <input
                  type="text"
                  value={formData.technicianName}
                  onChange={(e) =>
                    handleInputChange("technicianName", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="Name of technician who attended"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Cover Page Information Section */}
        {visibleSteps[currentStep]?.id === 4 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <FileText className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              Cover Page Information
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Report Instructions / Standards References
                </label>
                <textarea
                  value={formData.reportInstructions}
                  onChange={(e) =>
                    handleInputChange("reportInstructions", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                  placeholder="e.g., Provide a restoration inspection report per IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000. Provide recommendations to ensure longevity."
                  rows={3}
                />
                <p
                  className={cn(
                    "text-xs mt-1",
                    "text-neutral-600 dark:text-neutral-400",
                  )}
                >
                  This will appear on the cover page of the report
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Additional Contact Information Section */}
        {visibleSteps[currentStep]?.id === 5 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <User className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              Additional Contact Information
            </h3>
            <div className="space-y-4">
              {/* Builder/Developer Information */}
              <div className="p-3 rounded-lg border border-neutral-300 dark:border-neutral-700/50 bg-gray-50 dark:bg-slate-900/30">
                <h4 className="text-sm font-semibold mb-3 text-neutral-700 dark:text-neutral-300">
                  Builder/Developer Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={formData.builderDeveloperCompanyName}
                      onChange={(e) =>
                        handleInputChange(
                          "builderDeveloperCompanyName",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Builder/Developer company name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={formData.builderDeveloperContact}
                      onChange={(e) =>
                        handleInputChange(
                          "builderDeveloperContact",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Contact person name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Address
                    </label>
                    <input
                      type="text"
                      value={formData.builderDeveloperAddress}
                      onChange={(e) =>
                        handleInputChange(
                          "builderDeveloperAddress",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Builder/Developer address"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={formData.builderDeveloperPhone}
                      onChange={(e) =>
                        handleInputChange(
                          "builderDeveloperPhone",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Phone number"
                    />
                  </div>
                </div>
              </div>

              {/* Owner/Management Information */}
              <div className="p-3 rounded-lg border border-neutral-300 dark:border-neutral-700/50 bg-gray-50 dark:bg-slate-900/30">
                <h4 className="text-sm font-semibold mb-3 text-neutral-700 dark:text-neutral-300">
                  Owner/Management Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={formData.ownerManagementContactName}
                      onChange={(e) =>
                        handleInputChange(
                          "ownerManagementContactName",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Owner/Management contact name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={formData.ownerManagementPhone}
                      onChange={(e) =>
                        handleInputChange(
                          "ownerManagementPhone",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.ownerManagementEmail}
                      onChange={(e) =>
                        handleInputChange(
                          "ownerManagementEmail",
                          e.target.value,
                        )
                      }
                      className={cn(
                        "w-full px-3 py-2 rounded-lg text-sm",
                        "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                        "text-neutral-900 dark:text-neutral-50",
                        "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                      )}
                      placeholder="Email address"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Previous Maintenance & Repair History Section */}
        {visibleSteps[currentStep]?.id === 6 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <Clock className="w-4 h-4" />
              Previous Maintenance & Repair History
            </h3>
            <div className="space-y-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Date of Last Inspection
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                  <input
                    type="date"
                    value={formData.lastInspectionDate}
                    onChange={(e) =>
                      handleInputChange("lastInspectionDate", e.target.value)
                    }
                    className={cn(
                      "w-full pl-10 pr-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Was building changed since last inspection?
                  </label>
                  <select
                    value={formData.buildingChangedSinceLastInspection}
                    onChange={(e) =>
                      handleInputChange(
                        "buildingChangedSinceLastInspection",
                        e.target.value,
                      )
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Were there changes/additions to structure since last
                    inspection?
                  </label>
                  <select
                    value={formData.structureChangesSinceLastInspection}
                    onChange={(e) =>
                      handleInputChange(
                        "structureChangesSinceLastInspection",
                        e.target.value,
                      )
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Was there any leakage?
                  </label>
                  <select
                    value={formData.previousLeakage}
                    onChange={(e) =>
                      handleInputChange("previousLeakage", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                    <option value="Yes - Minor leak in 2023">
                      Yes - Minor leak in 2023
                    </option>
                    <option value="Yes - Ongoing shower leak">
                      Yes - Ongoing shower leak
                    </option>
                    <option value="Yes - Previous water damage">
                      Yes - Previous water damage
                    </option>
                    <option value="Yes - Roof leak">Yes - Roof leak</option>
                    <option value="Yes - Plumbing issue">
                      Yes - Plumbing issue
                    </option>
                  </select>
                </div>
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Was emergency repair performed?
                  </label>
                  <select
                    value={formData.emergencyRepairPerformed}
                    onChange={(e) =>
                      handleInputChange(
                        "emergencyRepairPerformed",
                        e.target.value,
                      )
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Technician Field Report Section */}
        {visibleSteps[currentStep]?.id === 7 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <FileText className="w-4 h-4" />
              Technician Field Report
            </h3>

            <div>
              <label
                className={cn(
                  "block text-sm font-medium mb-1",
                  "text-neutral-700 dark:text-neutral-300",
                )}
              >
                Technician's Field Report{" "}
                <span className="text-error-500 dark:text-error-400">*</span>
              </label>
              <textarea
                required
                value={formData.technicianFieldReport}
                onChange={(e) =>
                  handleInputChange("technicianFieldReport", e.target.value)
                }
                rows={6}
                className={cn(
                  "w-full px-3 py-2 rounded-lg font-mono text-sm",
                  "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                  "text-neutral-900 dark:text-neutral-50",
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                )}
                placeholder="Paste or type the technician's field report here..."
              />
            </div>
          </div>
        )}

        {/* Step 8: NIR Fields - Available for all report types */}
        {visibleSteps[currentStep]?.id === 8 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-green-200 dark:border-green-500/50",
              "bg-green-50 dark:bg-green-500/10",
              "shadow-lg shadow-green-500/10",
            )}
          >
            <h3
              className={cn(
                "text-xl font-semibold mb-4 flex items-center gap-2",
                "text-neutral-900 dark:text-green-300",
              )}
            >
              <CheckCircle className="w-5 h-5" />
              NIR Inspection Data
            </h3>
            <p
              className={cn(
                "text-sm mb-4",
                "text-neutral-700 dark:text-neutral-300",
              )}
            >
              Enter structured inspection data. The system will automatically
              classify and determine scope.
            </p>

            {/* Moisture Readings */}
            <div
              className={cn(
                "p-4 rounded-lg border",
                "border-neutral-200 dark:border-neutral-800",
                "bg-white dark:bg-neutral-900/50",
              )}
            >
              <h4
                className={cn(
                  "text-lg font-semibold mb-3 flex items-center gap-2",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                <Droplets className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                Moisture Readings{" "}
                <span className="text-error-500 dark:text-error-400">*</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3 p-3 rounded-lg bg-neutral-50 dark:bg-slate-900/50">
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newNirMoistureReading.location}
                    onChange={(e) =>
                      setNewNirMoistureReading((prev) => ({
                        ...prev,
                        location: e.target.value,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                    placeholder="Room/Zone"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Surface
                  </label>
                  <select
                    value={newNirMoistureReading.surfaceType}
                    onChange={(e) =>
                      setNewNirMoistureReading((prev) => ({
                        ...prev,
                        surfaceType: e.target.value,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
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
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Moisture (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={newNirMoistureReading.moistureLevel}
                    onChange={(e) =>
                      setNewNirMoistureReading((prev) => ({
                        ...prev,
                        moistureLevel: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Depth
                  </label>
                  <select
                    value={newNirMoistureReading.depth}
                    onChange={(e) =>
                      setNewNirMoistureReading((prev) => ({
                        ...prev,
                        depth: e.target.value as "Surface" | "Subsurface",
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    <option value="Surface">Surface</option>
                    <option value="Subsurface">Subsurface</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newNirMoistureReading.location.trim()) {
                        toast.error("Please enter a location");
                        return;
                      }
                      setNirMoistureReadings([
                        ...nirMoistureReadings,
                        {
                          id: Date.now().toString(),
                          ...newNirMoistureReading,
                        },
                      ]);
                      setNewNirMoistureReading({
                        location: "",
                        surfaceType: SURFACE_TYPES[0],
                        moistureLevel: 0,
                        depth: "Surface",
                      });
                      toast.success("Moisture reading added");
                    }}
                    className="w-full px-3 py-1.5 bg-success-600 hover:bg-success-700 dark:bg-success-600 dark:hover:bg-success-700 text-white rounded text-xs flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
              {nirMoistureReadings.length > 0 && (
                <div className="space-y-2">
                  {nirMoistureReadings.map((reading) => (
                    <div
                      key={reading.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded text-xs",
                        "bg-neutral-100 dark:bg-slate-900/50",
                        "text-neutral-800 dark:text-neutral-50",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm",
                          "text-neutral-800 dark:text-neutral-50",
                        )}
                      >
                        {reading.location} - {reading.surfaceType}:{" "}
                        {reading.moistureLevel}% ({reading.depth})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNirMoistureReadings(
                            nirMoistureReadings.filter(
                              (r) => r.id !== reading.id,
                            ),
                          );
                          toast.success("Removed");
                        }}
                        className="text-error-500 dark:text-error-400 hover:text-red-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Affected Areas */}
            <div
              className={cn(
                "p-4 rounded-lg border",
                "border-neutral-200 dark:border-neutral-800",
                "bg-white dark:bg-neutral-900/50",
              )}
            >
              <h4
                className={cn(
                  "text-lg font-semibold mb-3 flex items-center gap-2",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                <MapPin className="w-4 h-4" />
                Affected Areas{" "}
                <span className="text-error-500 dark:text-error-400">*</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3 p-3 rounded-lg bg-neutral-50 dark:bg-slate-900/50">
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Room/Zone
                  </label>
                  <input
                    type="text"
                    value={newNirAffectedArea.roomZoneId}
                    onChange={(e) =>
                      setNewNirAffectedArea((prev) => ({
                        ...prev,
                        roomZoneId: e.target.value,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                    placeholder="e.g., Master Bedroom"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Square Footage
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newNirAffectedArea.affectedSquareFootage}
                    onChange={(e) =>
                      setNewNirAffectedArea((prev) => ({
                        ...prev,
                        affectedSquareFootage: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Water Source
                  </label>
                  <select
                    value={newNirAffectedArea.waterSource}
                    onChange={(e) =>
                      setNewNirAffectedArea((prev) => ({
                        ...prev,
                        waterSource: e.target.value,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {WATER_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-neutral-600 dark:text-neutral-400">
                    Time Since Loss (hrs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newNirAffectedArea.timeSinceLoss}
                    onChange={(e) =>
                      setNewNirAffectedArea((prev) => ({
                        ...prev,
                        timeSinceLoss: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-xs",
                      "bg-white dark:bg-neutral-800",
                      "border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!newNirAffectedArea.roomZoneId.trim()) {
                        toast.error("Please enter a room/zone ID");
                        return;
                      }
                      if (newNirAffectedArea.affectedSquareFootage <= 0) {
                        toast.error("Square footage must be greater than 0");
                        return;
                      }
                      setNirAffectedAreas([
                        ...nirAffectedAreas,
                        {
                          id: Date.now().toString(),
                          ...newNirAffectedArea,
                        },
                      ]);
                      setNewNirAffectedArea({
                        roomZoneId: "",
                        affectedSquareFootage: 0,
                        waterSource: WATER_SOURCES[0],
                        timeSinceLoss: 0,
                      });
                      toast.success("Affected area added");
                    }}
                    className="w-full px-3 py-1.5 bg-success-600 hover:bg-success-700 dark:bg-success-600 dark:hover:bg-success-700 text-white rounded text-xs flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
              {nirAffectedAreas.length > 0 && (
                <div className="space-y-2">
                  {nirAffectedAreas.map((area) => (
                    <div
                      key={area.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded text-xs",
                        "bg-neutral-100 dark:bg-slate-900/50",
                        "text-neutral-800 dark:text-neutral-50",
                      )}
                    >
                      <span
                        className={cn(
                          "text-sm",
                          "text-neutral-800 dark:text-neutral-50",
                        )}
                      >
                        {area.roomZoneId}: {area.affectedSquareFootage} sq ft -{" "}
                        {area.waterSource}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNirAffectedAreas(
                            nirAffectedAreas.filter((a) => a.id !== area.id),
                          );
                          toast.success("Removed");
                        }}
                        className="text-error-500 dark:text-error-400 hover:text-red-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scope Items */}
            <div
              className={cn(
                "p-4 rounded-lg border",
                "border-neutral-200 dark:border-neutral-800",
                "bg-white dark:bg-neutral-900/50",
              )}
            >
              <h4
                className={cn(
                  "text-lg font-semibold mb-3 flex items-center gap-2",
                  "text-neutral-900 dark:text-neutral-50",
                )}
              >
                <CheckCircle className="w-4 h-4" />
                Scope Items
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {SCOPE_ITEM_TYPES.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded text-xs cursor-pointer transition-colors",
                      "bg-neutral-50 dark:bg-slate-900/50",
                      "hover:bg-neutral-100 dark:hover:bg-slate-900/70",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={nirSelectedScopeItems.has(item.id)}
                      onChange={() => {
                        const newSelected = new Set(nirSelectedScopeItems);
                        if (newSelected.has(item.id)) {
                          newSelected.delete(item.id);
                        } else {
                          newSelected.add(item.id);
                        }
                        setNirSelectedScopeItems(newSelected);
                      }}
                      className={cn(
                        "w-3 h-3 rounded focus:ring-green-500",
                        "border-neutral-300 dark:border-neutral-700",
                        "bg-white dark:bg-slate-700",
                        "text-green-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        "text-neutral-800 dark:text-neutral-50",
                      )}
                    >
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 9: Hazard Profile Section */}
        {visibleSteps[currentStep]?.id === 9 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Hazard Profile
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label
                  className={cn(
                    "block text-sm font-medium mb-1",
                    "text-neutral-700 dark:text-neutral-300",
                  )}
                >
                  Methamphetamine Screen
                </label>
                <select
                  value={formData.methamphetamineScreen}
                  onChange={(e) =>
                    handleInputChange("methamphetamineScreen", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                  )}
                >
                  <option value="NEGATIVE">NEGATIVE</option>
                  <option value="POSITIVE">POSITIVE</option>
                </select>
              </div>

              {formData.methamphetamineScreen === "POSITIVE" && (
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Test Count
                  </label>
                  <input
                    type="number"
                    value={formData.methamphetamineTestCount}
                    onChange={(e) =>
                      handleInputChange(
                        "methamphetamineTestCount",
                        e.target.value ? parseInt(e.target.value) : "",
                      )
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                    placeholder="Test count"
                    min="1"
                  />
                </div>
              )}

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={formData.biologicalMouldDetected}
                    onChange={(e) =>
                      handleInputChange(
                        "biologicalMouldDetected",
                        e.target.checked,
                      )
                    }
                    className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  Bio/Mould Detected
                </label>
              </div>

              {formData.biologicalMouldDetected && (
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Mould Category
                  </label>
                  <select
                    value={formData.biologicalMouldCategory}
                    onChange={(e) =>
                      handleInputChange(
                        "biologicalMouldCategory",
                        e.target.value,
                      )
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50",
                    )}
                  >
                    <option value="">Select category</option>
                    <option value="CAT 3">CAT 3</option>
                    <option value="CAT 2">CAT 2</option>
                    <option value="CAT 1">CAT 1</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 10: Timeline Estimation Section */}
        {visibleSteps[currentStep]?.id === 10 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3
              className={cn(
                "text-lg font-semibold mb-3 flex items-center gap-2",
                "text-neutral-900 dark:text-neutral-50",
              )}
            >
              <Clock className="w-4 h-4" />
              Timeline Estimation (Optional)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Phase 1 */}
              <div>
                <h4 className="text-xs font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                  Phase 1: Make-safe
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Start
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase1StartDate}
                        onChange={(e) =>
                          handleInputChange("phase1StartDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      End
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase1EndDate}
                        onChange={(e) =>
                          handleInputChange("phase1EndDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase 2 */}
              <div>
                <h4 className="text-xs font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                  Phase 2: Remediation/Drying
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Start
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase2StartDate}
                        onChange={(e) =>
                          handleInputChange("phase2StartDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      End
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase2EndDate}
                        onChange={(e) =>
                          handleInputChange("phase2EndDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase 3 */}
              <div>
                <h4 className="text-xs font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                  Phase 3: Verification
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Start
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase3StartDate}
                        onChange={(e) =>
                          handleInputChange("phase3StartDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      End
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      <input
                        type="date"
                        value={formData.phase3EndDate}
                        onChange={(e) =>
                          handleInputChange("phase3EndDate", e.target.value)
                        }
                        className="w-full pl-8 pr-2 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 11: Equipment & Tools Selection Section */}
        {visibleSteps[currentStep]?.id === 11 && (
          <div
            className={cn(
              "p-6 rounded-xl border-2 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300",
              "border-blue-200 dark:border-blue-800",
              "bg-white dark:bg-neutral-900/50",
              "shadow-lg shadow-blue-500/10",
            )}
          >
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              Equipment & Tools Selection
            </h3>

            {/* Psychrometric Assessment */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-400 mb-1">
                      Drying Potential Assessment
                    </h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      Understand the 'Energy' in the air. Temperature and
                      Humidity determine if the air acts like a 'Thirsty Sponge'
                      (Good) or a 'Saturated Sponge' (Bad).
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-gray-50 dark:bg-slate-900/30">
                  <h4 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Water Loss Class
                  </h4>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[1, 2, 3, 4].map((cls) => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setWaterClass(cls as 1 | 2 | 3 | 4)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          waterClass === cls
                            ? "border-cyan-500 bg-cyan-500/20 text-primary-600 dark:text-primary-400"
                            : "border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-slate-500"
                        }`}
                      >
                        {cls}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-6">
                    Class 1 (Least water) to Class 4 (Bound water/Deep
                    saturation)
                  </p>

                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Thermometer className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                        <label className="font-medium text-gray-900 dark:text-white">
                          Temperature: {temperature}°C
                        </label>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="40"
                        value={temperature}
                        onChange={(e) =>
                          setTemperature(parseInt(e.target.value))
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Droplets className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                        <label className="font-medium text-gray-900 dark:text-white">
                          Humidity: {humidity}%
                        </label>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={humidity}
                        onChange={(e) => setHumidity(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-lg border border-pink-500/50 bg-pink-500/10">
                  <div className="flex items-center justify-center mb-4">
                    <Zap className="w-8 h-8 text-error-500 dark:text-error-400" />
                  </div>
                  <h4 className="text-2xl font-bold text-center mb-2">
                    DRYING POTENTIAL
                  </h4>
                  <div className="text-6xl font-bold text-center mb-4">
                    {dryingPotential.dryingIndex}
                  </div>
                  <div
                    className={`inline-block px-4 py-1 rounded-full text-sm font-semibold mb-4 w-full text-center ${
                      dryingPotential.status === "POOR"
                        ? "bg-red-500 text-white"
                        : dryingPotential.status === "FAIR"
                          ? "bg-orange-500 text-white"
                          : dryingPotential.status === "GOOD"
                            ? "bg-green-500 text-white"
                            : "bg-blue-500 text-white"
                    }`}
                  >
                    {dryingPotential.status}
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 text-center">
                    {dryingPotential.recommendation}
                  </p>
                </div>
              </div>
            </div>

            {/* Equipment Selection */}
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10">
                <div className="flex items-start gap-3">
                  <Wrench className="w-5 h-5 text-green-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-400 mb-1">
                      Equipment Selection
                    </h4>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      Use 'Auto-Select Best Fit' to instantly load standard
                      equipment, or manually select items.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-gray-50 dark:bg-slate-900/30">
                  <h4 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                    Job Manifest
                  </h4>
                  <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg mb-4 border border-gray-200 dark:border-slate-700">
                    <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">
                      Efficiency Targets
                    </h5>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1 text-gray-700 dark:text-gray-300">
                          <span>Water Removal</span>
                          <span>
                            {totalEquipmentCapacity} / {waterRemovalTarget}{" "}
                            L/Day
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-cyan-500 h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                waterRemovalTarget > 0
                                  ? (totalEquipmentCapacity /
                                      waterRemovalTarget) *
                                      100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1 text-gray-700 dark:text-gray-300">
                          <span>Air Movement</span>
                          <span>
                            {totalAirMoverUnits} / {airMoversRequired} Units
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-cyan-500 h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                airMoversRequired > 0
                                  ? (totalAirMoverUnits / airMoversRequired) *
                                      100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                      {requiresAFD && (
                        <div>
                          <div className="flex justify-between text-sm mb-1 text-gray-700 dark:text-gray-300">
                            <span>Air Filtration (AFD)</span>
                            <span>
                              {totalAFDUnits} / {afdUnitsRequired} Units
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-cyan-500 h-2 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  afdUnitsRequired > 0
                                    ? (totalAFDUnits / afdUnitsRequired) * 100
                                    : 0,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                    <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">
                      ESTIMATED CONSUMPTION
                    </h5>
                    <div className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                      ${totalCost.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="number"
                        min="1"
                        value={durationDays}
                        onChange={(e) =>
                          setDurationDays(parseInt(e.target.value) || 1)
                        }
                        className="w-20 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-sm"
                      />
                      <span className="text-sm">Days</span>
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      Total Draw: {totalAmps.toFixed(1)} Amps
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleAutoSelect}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                  >
                    <Wrench className="w-4 h-4" />
                    Auto-Select Best Fit
                  </button>

                  <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-gray-50 dark:bg-slate-900/30 max-h-96 overflow-y-auto">
                    <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">
                      LGR DEHUMIDIFIERS
                    </h5>
                    <div className="space-y-2">
                      {lgrDehumidifiers.map((group) => {
                        const selection = equipmentSelections.find(
                          (s) => s.groupId === group.id,
                        );
                        const quantity = selection?.quantity || 0;
                        return (
                          <div
                            key={group.id}
                            className={`p-3 rounded-lg border ${
                              quantity > 0
                                ? "border-cyan-500/50 bg-cyan-500/10"
                                : "border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900 dark:text-white">
                                  {group.capacity}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-neutral-400">
                                  $
                                  {(
                                    selection?.dailyRate ||
                                    (pricingConfig
                                      ? getEquipmentDailyRate(
                                          group.id,
                                          pricingConfig,
                                        )
                                      : 0)
                                  ).toFixed(2)}
                                  /day
                                </div>
                              </div>
                              {quantity > 0 && (
                                <div className="px-3 py-1 bg-cyan-500/20 text-cyan-700 dark:text-primary-400 rounded text-sm font-semibold mr-2">
                                  {quantity}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, -1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, 1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <h5 className="font-semibold mb-3 mt-4 text-gray-900 dark:text-white">
                      AIR MOVERS
                    </h5>
                    <div className="space-y-2">
                      {airMovers.map((group) => {
                        const selection = equipmentSelections.find(
                          (s) => s.groupId === group.id,
                        );
                        const quantity = selection?.quantity || 0;
                        return (
                          <div
                            key={group.id}
                            className={`p-3 rounded-lg border ${
                              quantity > 0
                                ? "border-cyan-500/50 bg-cyan-500/10"
                                : "border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900 dark:text-white">
                                  {group.capacity}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-neutral-400">
                                  $
                                  {(
                                    selection?.dailyRate ||
                                    (pricingConfig
                                      ? getEquipmentDailyRate(
                                          group.id,
                                          pricingConfig,
                                        )
                                      : 0)
                                  ).toFixed(2)}
                                  /day
                                </div>
                              </div>
                              {quantity > 0 && (
                                <div className="px-3 py-1 bg-cyan-500/20 text-cyan-700 dark:text-primary-400 rounded text-sm font-semibold mr-2">
                                  {quantity}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, -1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, 1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <h5 className="font-semibold mb-3 mt-4 text-gray-900 dark:text-white">
                      AFD / AIR FILTRATION (HEPA)
                    </h5>
                    <p className="text-xs text-gray-600 dark:text-neutral-400 mb-3">
                      Use for containment/filtration scenarios (e.g., mould,
                      Category 2/3 contamination, demolition dust).
                    </p>
                    <div className="space-y-2">
                      {afdUnits.map((group) => {
                        const selection = equipmentSelections.find(
                          (s) => s.groupId === group.id,
                        );
                        const quantity = selection?.quantity || 0;
                        return (
                          <div
                            key={group.id}
                            className={`p-3 rounded-lg border ${
                              quantity > 0
                                ? "border-cyan-500/50 bg-cyan-500/10"
                                : "border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {group.capacity}
                                </div>
                                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                                  $
                                  {(
                                    selection?.dailyRate ||
                                    (pricingConfig
                                      ? getEquipmentDailyRate(
                                          group.id,
                                          pricingConfig,
                                        )
                                      : 0)
                                  ).toFixed(2)}
                                  /day
                                </div>
                              </div>
                              {quantity > 0 && (
                                <div className="px-3 py-1 bg-cyan-500/20 text-cyan-700 dark:text-primary-400 rounded text-sm font-semibold mr-2">
                                  {quantity}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, -1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEquipmentQuantityChange(group.id, 1)
                                  }
                                  className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div
          className={cn(
            "sticky bottom-0 left-0 right-0 p-6 rounded-t-xl border-t-2",
            "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm",
            "border-neutral-200 dark:border-neutral-800",
            "shadow-2xl shadow-neutral-900/10",
          )}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                "border-2",
                currentStep === 0
                  ? "border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                  : "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600",
              )}
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Previous
            </button>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm",
                  "text-neutral-600 dark:text-neutral-400",
                )}
              >
                Step {currentStep + 1} of {visibleSteps.length}
              </span>
            </div>

            {currentStep === visibleSteps.length - 1 ? (
              <button
                type="submit"
                disabled={loading || !validateStep(currentStep)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                  "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
                  "hover:shadow-lg hover:shadow-blue-500/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Save & Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={!validateStep(currentStep)}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                  !validateStep(currentStep)
                    ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/50",
                )}
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </form>


      {/* Review Page */}
      {showReview && (
        <ReviewSection
          formData={formData}
          nirMoistureReadings={nirMoistureReadings}
          nirAffectedAreas={nirAffectedAreas}
          equipmentSelections={equipmentSelections}
          onBackToEdit={() => setShowReview(false)}
          onContinueToReportType={() => {
            setShowReview(false);
            setShowReportTypeSelection(true);
          }}
        />
      )}

      {/* Report Type Selection */}
      {showReportTypeSelection && (
        <ReportTypeSelection
          isTrial={isTrial}
          loading={loading}
          onSelectReportType={handleReportTypeChoice}
        />
      )}

      {/* Quick Fill Use Case Modal */}
      <QuickFillDialog
        open={showUseCaseModal}
        onOpenChange={setShowUseCaseModal}
        onSelectUseCase={populateUseCaseData}
      />
    </div>
  );
}
