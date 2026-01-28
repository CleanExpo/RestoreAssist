"use client";

import { PropertyDataDisplay } from "@/components/property-data-display";
import { PropertyLookupButton } from "@/components/property-lookup-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AccordionFormSection,
  AccordionFormContainer,
} from "@/components/ui/accordion-form-section";
import { useAutoSave, type AutoSaveStatus, type FormDraft } from "@/lib/form/auto-save";
import { DraftRecoveryModal } from "@/components/ui/draft-recovery-modal";
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
  type EquipmentSelection
} from "@/lib/equipment-matrix";
import {
  calculateAFDUnitsRequired,
  calculateAirMoversRequired,
  calculateDryingPotential,
  calculateTotalVolume,
  calculateWaterRemovalTarget
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
  Zap
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string, reportType?: "basic" | "enhanced" | "optimised") => void;
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
  const isTrial = subscriptionStatus === "TRIAL" || subscriptionStatus === "trial";
  const [quickFillCredits, setQuickFillCredits] = useState<number | null>(null);
  const [hasUnlimitedQuickFill, setHasUnlimitedQuickFill] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Auto-save and draft recovery
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [showDraftModal, setShowDraftModal] = useState(false);

  // Assignee selection state (Manager for Technicians, Admin for Managers)
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
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
      initialData?.technicianAttendanceDate || ""
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
    buildingChangedSinceLastInspection: initialData?.buildingChangedSinceLastInspection || "",
    structureChangesSinceLastInspection: initialData?.structureChangesSinceLastInspection || "",
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
  const [reportId, setReportId] = useState<string | null>(initialReportId || null);
  const [pricingConfig, setPricingConfig] = useState<any>(null);
  const hasAutoSelectedEquipment = useRef(false);

  // Equipment: Psychrometric Assessment (moved before useAutoSave to avoid temporal dead zone)
  const [waterClass, setWaterClass] = useState<1 | 2 | 3 | 4>(
    (initialData?.psychrometricWaterClass as 1 | 2 | 3 | 4) || 2
  );
  const [temperature, setTemperature] = useState(
    initialData?.psychrometricTemperature || 25
  );
  const [humidity, setHumidity] = useState(
    initialData?.psychrometricHumidity || 60
  );
  const [systemType, setSystemType] = useState<"open" | "closed">(
    initialData?.psychrometricSystemType || "closed"
  );

  // Equipment: Scope Areas (moved before useAutoSave)
  interface ScopeArea {
    id: string;
    name: string;
    length: number;
    width: number;
    height: number;
    wetPercentage: number;
  }
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

  const [equipmentSelections, setEquipmentSelections] = useState<
    EquipmentSelection[]
  >([]);
  const [durationDays, setDurationDays] = useState(
    initialData?.estimatedDryingDuration || 4
  );

  // Auto-save: Initialize with form data
  const draftId = reportId || `draft-${session?.user?.id || 'temp'}-${Date.now()}`;
  const { status: autoSaveStatusValue, scheduleSave, forceSave } = useAutoSave(
    draftId,
    {
      ...formData,
      userId: session?.user?.id,
      type: 'report',
      // Include other relevant state
      assigneeId: selectedAssigneeId,
      waterClass,
      temperature,
      humidity,
      systemType,
      areas,
      durationDays,
      nirMoistureReadings,
      nirAffectedAreas,
      nirSelectedScopeItems: Array.from(nirSelectedScopeItems),
      equipmentSelections,
    },
    {
      debounceMs: 2000, // 2 seconds after typing stops
      periodicSaveMs: 10000, // Every 10 seconds
      onSave: async (data) => {
        // Save to server (call API to save draft)
        if (reportId) {
          // Update existing report
          await fetch(`/api/reports/${reportId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        }
        // Note: For new reports, we save on submit, not on auto-save
      },
      onError: (error) => {
        console.error('[Auto-Save] Error:', error);
        // Don't show error to user for auto-save failures
      },
      onStatusChange: (status) => {
        setAutoSaveStatus(status);
      },
    }
  );

  // Trigger auto-save when form data changes
  useEffect(() => {
    scheduleSave();
  }, [formData, selectedAssigneeId, areas, equipmentSelections, nirMoistureReadings, nirAffectedAreas]);

  // Property Lookup State (Phase 5)
  const [propertyData, setPropertyData] = useState<{
    yearBuilt?: number | null
    wallMaterial?: string | null
    wallConstruction?: string | null
    roofMaterial?: string | null
    floorType?: string | null
    floorArea?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    landArea?: number | null
    stories?: number | null
  } | null>(null);
  const [propertyDataFetchedAt, setPropertyDataFetchedAt] = useState<string | null>(null);
  const [propertyLookupExpiresAt, setPropertyLookupExpiresAt] = useState<string | null>(null);

  // Update reportId when initialReportId prop changes
  useEffect(() => {
    if (initialReportId) {
      setReportId(initialReportId);
    }
  }, [initialReportId]);

  // Report Type Selection State
  const [showReportTypeSelection, setShowReportTypeSelection] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<
    "basic" | "enhanced" | "optimised" | null
  >(null);
  
  // Use Case Selection Modal State
  const [showUseCaseModal, setShowUseCaseModal] = useState(false);

  // Accordion Section Management (replaces wizard step management)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(() => new Set([0])); // Start with first section expanded
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set<number>()
  );
  const requiresAssignee =
    session?.user?.role === "USER" || session?.user?.role === "MANAGER";

  // Define all sections (was: steps)
  const steps = [
    {
      id: 0,
      title: "Client Information",
      icon: User,
      description: "Enter client details and contact information",
      requiredFields: ["clientName", "propertyAddress", "propertyPostcode"],
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
  const visibleSteps = steps.filter((step) => 
    !step.conditional || step.conditional === true
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
      } else if (!formData[field as keyof typeof formData] || 
                 (typeof formData[field as keyof typeof formData] === "string" && 
                  formData[field as keyof typeof formData].toString().trim() === "")) {
        return false;
      }
    }
    return true;
  };

  // Accordion: Toggle section expansion
  const toggleSection = (sectionIndex: number) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionIndex)) {
        newSet.delete(sectionIndex);
      } else {
        newSet.add(sectionIndex);
      }
      return newSet;
    });
  };

  // Accordion: Calculate completion percentage for a section
  const calculateSectionCompletion = (sectionIndex: number): number => {
    const step = visibleSteps[sectionIndex];
    if (!step) return 0;

    // Count total fields and filled fields
    let totalFields = step.requiredFields.length;
    let filledFields = 0;

    // Special handling for assignee step
    if (step.id === 1) {
      if (!requiresAssignee) return 100;
      return selectedAssigneeId ? 100 : 0;
    }

    // NIR Inspection step (step 8) - check array data
    if (step.id === 8) {
      totalFields += 3; // moisture readings, affected areas, scope items
      if (nirMoistureReadings.length > 0) filledFields++;
      if (nirAffectedAreas.length > 0) filledFields++;
      if (nirSelectedScopeItems.size > 0) filledFields++;
    }

    // Equipment step (step 11) - check arrays
    if (step.id === 11) {
      totalFields += 2; // areas, equipment selections
      if (areas.length > 0) filledFields++;
      if (equipmentSelections.length > 0) filledFields++;
    }

    // Check required fields
    for (const field of step.requiredFields) {
      if (field === "selectedAssigneeId") {
        if (selectedAssigneeId) filledFields++;
      } else if (formData[field as keyof typeof formData] &&
                 formData[field as keyof typeof formData].toString().trim() !== "") {
        filledFields++;
      }
    }

    if (totalFields === 0) return 100; // No required fields = 100% complete
    return Math.round((filledFields / totalFields) * 100);
  };

  // Check if section has validation errors
  const sectionHasErrors = (sectionIndex: number): boolean => {
    const step = visibleSteps[sectionIndex];
    if (!step) return false;

    // Check required fields
    for (const field of step.requiredFields) {
      if (field === "selectedAssigneeId") {
        if (requiresAssignee && !selectedAssigneeId) return true;
      } else if (!formData[field as keyof typeof formData] ||
                 (typeof formData[field as keyof typeof formData] === "string" &&
                  formData[field as keyof typeof formData].toString().trim() === "")) {
        return true;
      }
    }
    return false;
  };

  // Legacy: Keep for backward compatibility with existing code
  const handleNext = () => {
    // Accordion mode: expand next incomplete section
    const currentIndex = Array.from(expandedSections)[0] || 0;
    if (currentIndex < visibleSteps.length - 1) {
      toggleSection(currentIndex); // Collapse current
      toggleSection(currentIndex + 1); // Expand next
    }
  };

  const handlePrevious = () => {
    // Accordion mode: expand previous section
    const currentIndex = Array.from(expandedSections)[0] || 0;
    if (currentIndex > 0) {
      toggleSection(currentIndex); // Collapse current
      toggleSection(currentIndex - 1); // Expand previous
    }
  };

  const isStepAccessible = (stepIndex: number): boolean => {
    // In accordion mode, all steps are always accessible
    return true;
  };

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

  // Surface types for NIR
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
  const WATER_SOURCES = ["Clean Water", "Grey Water", "Black Water"];
  const SCOPE_ITEM_TYPES = [
    { id: "remove_carpet", label: "Remove Carpet" },
    { id: "sanitize_materials", label: "Sanitise Materials" },
    { id: "install_dehumidification", label: "Install Dehumidification" },
    { id: "install_air_movers", label: "Install Air Movers" },
    { id: "extract_standing_water", label: "Extract Standing Water" },
    { id: "demolish_drywall", label: "Demolish Drywall" },
    { id: "apply_antimicrobial", label: "Apply Antimicrobial Treatment" },
    { id: "dry_out_structure", label: "Dry Out Structure" },
    { id: "containment_setup", label: "Containment Setup" },
    { id: "ppe_required", label: "PPE Required" },
  ];

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
            if (nirData.nirData.moistureReadings && Array.isArray(nirData.nirData.moistureReadings) && nirData.nirData.moistureReadings.length > 0) {
              const readings = nirData.nirData.moistureReadings.map((r: any, idx: number) => ({
                id: `mr-${Date.now()}-${idx}`,
                location: r.location || '',
                surfaceType: r.surfaceType || 'Drywall',
                moistureLevel: r.moistureLevel || 0,
                depth: r.depth || 'Surface' as "Surface" | "Subsurface"
              }));
              setNirMoistureReadings(readings);
            }
            
            // Load affected areas
            if (nirData.nirData.affectedAreas && Array.isArray(nirData.nirData.affectedAreas) && nirData.nirData.affectedAreas.length > 0) {
              const areas = nirData.nirData.affectedAreas.map((a: any, idx: number) => ({
                id: `aa-${Date.now()}-${idx}`,
                roomZoneId: a.roomZoneId || '',
                affectedSquareFootage: a.affectedSquareFootage || 0,
                waterSource: a.waterSource || 'Clean Water',
                timeSinceLoss: a.timeSinceLoss || 0
              }));
              setNirAffectedAreas(areas);
            }
            
            // Load scope items
            if (nirData.nirData.scopeItems && Array.isArray(nirData.nirData.scopeItems) && nirData.nirData.scopeItems.length > 0) {
              const selectedItems = new Set<string>(nirData.nirData.scopeItems
                .filter((item: any) => item.isSelected !== false)
                .map((item: any) => (item.itemType || item.id) as string));
              setNirSelectedScopeItems(selectedItems);
            }
          }
        }

        // Load equipment data
        const equipmentResponse = await fetch(`/api/reports/${reportId}/equipment`);
        if (equipmentResponse.ok) {
          const equipmentData = await equipmentResponse.json();
          
          if (equipmentData.psychrometricAssessment) {
            const psychro = equipmentData.psychrometricAssessment;
            if (psychro.waterClass) setWaterClass(psychro.waterClass);
            if (psychro.temperature !== undefined) setTemperature(psychro.temperature);
            if (psychro.humidity !== undefined) setHumidity(psychro.humidity);
            if (psychro.systemType) setSystemType(psychro.systemType);
          }
          
          if (equipmentData.scopeAreas && Array.isArray(equipmentData.scopeAreas)) {
            setAreas(equipmentData.scopeAreas.map((area: any, index: number) => ({
              id: `area-${Date.now()}-${index}`,
              name: area.name || '',
              length: area.length || 4,
              width: area.width || 4,
              height: area.height || 2.7,
              wetPercentage: area.wetPercentage || 100
            })));
          }
          
          if (equipmentData.equipmentSelection && Array.isArray(equipmentData.equipmentSelection)) {
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
      if (initialData.nirData.moistureReadings && Array.isArray(initialData.nirData.moistureReadings) && initialData.nirData.moistureReadings.length > 0) {
        const readings = initialData.nirData.moistureReadings.map((r: any, idx: number) => ({
          id: `mr-upload-${Date.now()}-${idx}`,
          location: r.location || '',
          surfaceType: r.surfaceType || 'Drywall',
          moistureLevel: typeof r.moistureLevel === 'number' ? r.moistureLevel : parseFloat(r.moistureLevel) || 0,
          depth: r.depth === 'Subsurface' ? 'Subsurface' as const : 'Surface' as const
        }));
        setNirMoistureReadings(readings);
      }
      
      // Populate affected areas
      if (initialData.nirData.affectedAreas && Array.isArray(initialData.nirData.affectedAreas) && initialData.nirData.affectedAreas.length > 0) {
        const areas = initialData.nirData.affectedAreas.map((a: any, idx: number) => ({
          id: `aa-upload-${Date.now()}-${idx}`,
          roomZoneId: a.roomZoneId || '',
          affectedSquareFootage: typeof a.affectedSquareFootage === 'number' ? a.affectedSquareFootage : parseFloat(a.affectedSquareFootage) || 0,
          waterSource: a.waterSource || 'Clean Water',
          timeSinceLoss: typeof a.timeSinceLoss === 'number' ? a.timeSinceLoss : parseFloat(a.timeSinceLoss) || 0
        }));
        setNirAffectedAreas(areas);
      }
      
      // Populate scope items
      if (initialData.nirData.scopeItems && Array.isArray(initialData.nirData.scopeItems) && initialData.nirData.scopeItems.length > 0) {
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
          initialData.technicianAttendanceDate || ""
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
        builderDeveloperCompanyName: initialData.builderDeveloperCompanyName || "",
        builderDeveloperContact: initialData.builderDeveloperContact || "",
        builderDeveloperAddress: initialData.builderDeveloperAddress || "",
        builderDeveloperPhone: initialData.builderDeveloperPhone || "",
        ownerManagementContactName: initialData.ownerManagementContactName || "",
        ownerManagementPhone: initialData.ownerManagementPhone || "",
        ownerManagementEmail: initialData.ownerManagementEmail || "",
        lastInspectionDate: normalizeDate(initialData.lastInspectionDate || ""),
        buildingChangedSinceLastInspection: initialData.buildingChangedSinceLastInspection || "",
        structureChangesSinceLastInspection: initialData.structureChangesSinceLastInspection || "",
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
      if (initialData.psychrometricTemperature !== undefined && initialData.psychrometricTemperature !== null) {
        setTemperature(initialData.psychrometricTemperature);
      }
      if (initialData.psychrometricHumidity !== undefined && initialData.psychrometricHumidity !== null) {
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
      if (initialData.equipmentDeployment && Array.isArray(initialData.equipmentDeployment) && initialData.equipmentDeployment.length > 0) {
        const equipmentSelectionsFromPDF: EquipmentSelection[] = [];
        
        initialData.equipmentDeployment.forEach((eq: any) => {
          // Try to match equipment name to equipment group
          // Look for patterns like "55L/Day", "800 CFM", "LGR", "Desiccant", "Air Mover"
          const eqName = (eq.equipmentName || '').toLowerCase();
          let matchedGroupId: string | null = null;
          
          // Match dehumidifiers by capacity (e.g., "55L/Day" -> look for 55L capacity)
          if (eqName.includes('l/day') || eqName.includes('lgr') || eqName.includes('dehumidifier')) {
            const capacityMatch = eqName.match(/(\d+)\s*l/);
            if (capacityMatch) {
              const capacity = parseInt(capacityMatch[1]);
              // Find matching LGR group by capacity
              const matchingGroup = lgrDehumidifiers.find(g => {
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
          else if (eqName.includes('cfm') || eqName.includes('air mover') || eqName.includes('fan')) {
            const cfmMatch = eqName.match(/(\d+)\s*cfm/);
            if (cfmMatch) {
              const cfm = parseInt(cfmMatch[1]);
              // Find matching air mover by airflow
              const matchingGroup = airMovers.find(g => {
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
          else if (eqName.includes('desiccant')) {
            if (desiccantDehumidifiers.length > 0) {
              matchedGroupId = desiccantDehumidifiers[0].id;
            }
          }
          
          if (matchedGroupId && pricingConfig) {
            const dailyRate = eq.dailyRate || getEquipmentDailyRate(matchedGroupId, pricingConfig);
            equipmentSelectionsFromPDF.push({
              groupId: matchedGroupId,
              quantity: eq.quantity || 1,
              dailyRate: dailyRate
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
    const areasToUse = areas.length > 0 ? areas : (initialData?.scopeAreas?.map((area, index) => ({
      id: `temp-area-${index}`,
          name: area.name,
          length: area.length,
          width: area.width,
          height: area.height,
      wetPercentage: area.wetPercentage,
    })) || []);

    const waterClassToUse = waterClass || (initialData?.psychrometricWaterClass as 1 | 2 | 3 | 4) || 2;
    const tempToUse = temperature || initialData?.psychrometricTemperature || 25;
    const humidityToUse = humidity || initialData?.psychrometricHumidity || 60;

    const shouldAutoSelect = 
      pricingConfig &&
      areasToUse.length > 0 &&
      waterClassToUse &&
      tempToUse !== undefined &&
      humidityToUse !== undefined &&
      !hasAutoSelectedEquipment.current &&
      !(initialData?.equipmentDeployment && initialData.equipmentDeployment.length > 0); // Don't auto-select if PDF has equipment data


    if (shouldAutoSelect) {
      
      // Calculate targets based on areas and water class
      const { totalVolume, totalAffectedArea } = calculateTotalVolume(areasToUse);
      const waterRemovalTarget = calculateWaterRemovalTarget(
        totalVolume,
        waterClassToUse,
        totalAffectedArea
      );
      const airMoversRequired = calculateAirMoversRequired(
        totalAffectedArea,
        waterClassToUse
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
          selections.push({ groupId: group.id, quantity: needed, dailyRate: rate });
            remainingCapacity -= capacity * needed;
        }
      }

      // Air movers - S500 count is "units", independent of individual CFM model
      if (airMoversRequired > 0) {
        const preferredAirMover =
          totalAffectedArea > 80 ? "airmover-2500" : totalAffectedArea > 30 ? "airmover-1500" : "airmover-800";
        const rate = getEquipmentDailyRate(preferredAirMover, pricingConfig);
        selections.push({ groupId: preferredAirMover, quantity: airMoversRequired, dailyRate: rate });
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
  const areasForCalculation = areas.length > 0 
    ? areas 
    : (initialData?.scopeAreas && initialData.scopeAreas.length > 0
        ? initialData.scopeAreas.map((area, index) => ({
            id: `calc-area-${index}`,
            name: area.name,
            length: area.length,
            width: area.width,
            height: area.height,
            wetPercentage: area.wetPercentage,
          }))
        : []);

  const { totalVolume, totalAffectedArea } = calculateTotalVolume(areasForCalculation);
  const waterRemovalTarget = calculateWaterRemovalTarget(
    totalVolume,
    waterClass,
    totalAffectedArea
  );
  const airMoversRequired = calculateAirMoversRequired(
    totalAffectedArea,
    waterClass
  );

  // Determine whether air filtration is required (mould and/or Category 2/3 contamination indicators).
  const requiresAFD =
    Boolean(formData.biologicalMouldDetected) ||
    nirAffectedAreas.some((a) => (a.waterSource || "").toLowerCase() !== "clean water");

  const afdUnitsRequired = calculateAFDUnitsRequired(totalAffectedArea, requiresAFD);

  const totalAmps = calculateTotalAmps(equipmentSelections);
  const totalDailyCost = calculateTotalDailyCost(
    equipmentSelections,
    pricingConfig
  );
  const totalCost = calculateTotalCost(
    equipmentSelections,
    durationDays,
    pricingConfig
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
          s.groupId === groupId ? { ...s, quantity: newQuantity } : s
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
        const rate = pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0;
        selections.push({ groupId: group.id, quantity: needed, dailyRate: rate });
          remainingCapacity -= capacity * needed;
        }
      }

    // Air movers - S500 count is "units", independent of individual CFM model
    if (airMoversRequired > 0) {
      const preferredAirMover =
        totalAffectedArea > 80 ? "airmover-2500" : totalAffectedArea > 30 ? "airmover-1500" : "airmover-800";
      const rate = pricingConfig ? getEquipmentDailyRate(preferredAirMover, pricingConfig) : 0;
      selections.push({ groupId: preferredAirMover, quantity: airMoversRequired, dailyRate: rate });
    }

    // AFD units (HEPA / air scrubbers) - only when contamination/mould indicators require it
    if (afdUnitsRequired > 0) {
      const afdGroupId = afdUnits[0]?.id || "afd-500";
      const rate = pricingConfig ? getEquipmentDailyRate(afdGroupId, pricingConfig) : 0;
      selections.push({ groupId: afdGroupId, quantity: afdUnitsRequired, dailyRate: rate });
    }
    setEquipmentSelections(selections);
    toast.success("Equipment auto-selected based on targets");
  };

  const handleReportTypeChoice = async (choice: "basic" | "enhanced" | "optimised") => {
    if (!reportId) return;

    if (isTrial && choice !== "basic") {
      toast.error("Free plan allows 3 Basic reports only. Upgrade to unlock Enhanced or Optimised.");
      return;
    }

    setLoading(true);
    try {
      // Update report with reportDepthLevel
      const reportDepthLevel = choice === "basic" ? "Basic" : choice === "enhanced" ? "Enhanced" : "Optimised";
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

  // Draft recovery handlers
  const handleRestoreDraft = (draft: FormDraft) => {
    const draftData = draft.data;

    // Restore form data
    if (draftData.clientName) setFormData(prev => ({ ...prev, clientName: draftData.clientName }));
    if (draftData.clientContactDetails) setFormData(prev => ({ ...prev, clientContactDetails: draftData.clientContactDetails }));
    if (draftData.propertyAddress) setFormData(prev => ({ ...prev, propertyAddress: draftData.propertyAddress }));
    if (draftData.propertyPostcode) setFormData(prev => ({ ...prev, propertyPostcode: draftData.propertyPostcode }));
    if (draftData.technicianFieldReport) setFormData(prev => ({ ...prev, technicianFieldReport: draftData.technicianFieldReport }));
    // ... restore all other formData fields
    setFormData(prev => ({ ...prev, ...draftData }));

    // Restore other state
    if (draftData.assigneeId) setSelectedAssigneeId(draftData.assigneeId);
    if (draftData.waterClass) setWaterClass(draftData.waterClass);
    if (draftData.temperature !== undefined) setTemperature(draftData.temperature);
    if (draftData.humidity !== undefined) setHumidity(draftData.humidity);
    if (draftData.systemType) setSystemType(draftData.systemType);
    if (draftData.areas) setAreas(draftData.areas);
    if (draftData.durationDays) setDurationDays(draftData.durationDays);
    if (draftData.nirMoistureReadings) setNirMoistureReadings(draftData.nirMoistureReadings);
    if (draftData.nirAffectedAreas) setNirAffectedAreas(draftData.nirAffectedAreas);
    if (draftData.nirSelectedScopeItems) setNirSelectedScopeItems(new Set(draftData.nirSelectedScopeItems));
    if (draftData.equipmentSelections) setEquipmentSelections(draftData.equipmentSelections);

    toast.success("Draft restored successfully!");
  };

  const handleDiscardDrafts = () => {
    toast.success("Starting with a fresh form");
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
    if ((userRole === "USER" || userRole === "MANAGER") && !selectedAssigneeId) {
      toast.error(`Please select a ${userRole === "USER" ? "Manager" : "Admin"} for this report`);
      setLoading(false);
      return;
    }

    try {
      // Prepare NIR data
      const nirData = {
        moistureReadings: nirMoistureReadings.length > 0 ? nirMoistureReadings.map(r => ({
          location: r.location,
          surfaceType: r.surfaceType,
          moistureLevel: r.moistureLevel,
          depth: r.depth
        })) : [],
        affectedAreas: nirAffectedAreas.length > 0 ? nirAffectedAreas.map(a => ({
          roomZoneId: a.roomZoneId,
          affectedSquareFootage: a.affectedSquareFootage,
          waterSource: a.waterSource,
          timeSinceLoss: a.timeSinceLoss
        })) : [],
        scopeItems: Array.from(nirSelectedScopeItems).map((itemId) => {
          const item = SCOPE_ITEM_TYPES.find((i) => i.id === itemId);
          return {
            itemType: itemId,
            description: item?.label || itemId,
            autoDetermined: false,
            isSelected: true
          };
        }),
        photos: [] // Photos are only in Tier 3, not initial entry
      };

      // Prepare equipment data
      const equipmentData = (areas.length > 0 || equipmentSelections.length > 0) ? {
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
      } : null;

      // Prepare assignee data based on user role
      const assigneeData: { assignedManagerId?: string; assignedAdminId?: string } = {};
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
          nirData: (nirData.moistureReadings.length > 0 || nirData.affectedAreas.length > 0 || nirData.scopeItems.length > 0) ? nirData : null,
          // Include equipment data if provided
          equipmentData: equipmentData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newReportId = data.report.id;
        setReportId(newReportId);
        toast.success("All data saved successfully");

        // Show report type selection UI
        setShowReportTypeSelection(true);
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
    value: string | number | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Use Case Data Structure
  interface UseCaseData {
    id: string;
    name: string;
    description: string;
    formData: typeof formData;
    nirMoistureReadings: typeof nirMoistureReadings;
    nirAffectedAreas: typeof nirAffectedAreas;
    nirSelectedScopeItems: Set<string>;
    nirEnvironmentalData: typeof nirEnvironmentalData;
    waterClass: 1 | 2 | 3 | 4;
    temperature: number;
    humidity: number;
    systemType: "open" | "closed";
    areas: typeof areas;
    durationDays: number;
    equipmentSelections: EquipmentSelection[];
  }

  // Define Use Cases
  const useCases: UseCaseData[] = [
    {
      id: "residential-water-damage",
      name: "Residential Water Damage",
      description: "Standard residential water damage scenario with burst pipe in master bedroom and ensuite",
      formData: {
      clientName: "ABC Co.",
      clientContactDetails: "John Smith - 0401 987 654 - john.smith@abcco.com.au",
      propertyAddress: "123 Main Street, Suburb, NSW 2000",
      propertyPostcode: "2000",
      claimReferenceNumber: "CLM-2024-001234",
      incidentDate: "2024-01-15",
      technicianAttendanceDate: "2024-01-16",
      technicianName: "Mark O'Connor",
      technicianFieldReport: "Attended site at 10:00 AM. Found significant water damage in master bedroom and ensuite. Water source appears to be burst pipe in wall cavity. Moisture readings elevated throughout affected areas. Immediate extraction required. Containment set up to prevent cross-contamination.",
      buildingAge: "2010",
      structureType: "Residential - Two Storey",
      accessNotes: "Key under mat, owner present during inspection",
      propertyId: "PROP-2024-001",
      jobNumber: "JOB-2024-056",
      reportInstructions: "Provide a restoration inspection report per IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000. Provide recommendations to ensure longevity.",
      builderDeveloperCompanyName: "Premier Builders Pty Ltd",
      builderDeveloperContact: "Sarah Johnson",
      builderDeveloperAddress: "456 Builder Street, Sydney NSW 2000",
      builderDeveloperPhone: "02 9876 5432",
      ownerManagementContactName: "Michael Brown",
      ownerManagementPhone: "0412 345 678",
      ownerManagementEmail: "michael.brown@management.com.au",
      lastInspectionDate: "2023-06-15",
      buildingChangedSinceLastInspection: "No",
      structureChangesSinceLastInspection: "No",
      previousLeakage: "No",
      emergencyRepairPerformed: "Yes",
      insurerName: "Allianz Insurance",
      methamphetamineScreen: "NEGATIVE",
      methamphetamineTestCount: "3",
      biologicalMouldDetected: false,
      biologicalMouldCategory: "",
      phase1StartDate: "2024-01-17",
      phase1EndDate: "2024-01-19",
      phase2StartDate: "2024-01-20",
      phase2EndDate: "2024-01-28",
      phase3StartDate: "2024-01-29",
      phase3EndDate: "2024-01-31",
      },
      nirMoistureReadings: [
      {
        id: "1",
        location: "Master Bedroom - Floor",
        surfaceType: "Carpet",
        moistureLevel: 45.5,
        depth: "Surface"
      },
      {
        id: "2",
        location: "Master Bedroom - Wall",
        surfaceType: "Drywall",
        moistureLevel: 38.2,
        depth: "Subsurface"
      },
      {
        id: "3",
        location: "Ensuite - Floor",
        surfaceType: "Tile",
        moistureLevel: 52.1,
        depth: "Surface"
      },
      {
        id: "4",
        location: "Ensuite - Wall",
        surfaceType: "Drywall",
        moistureLevel: 41.8,
        depth: "Subsurface"
      },
      {
        id: "5",
        location: "Hallway - Floor",
        surfaceType: "Hardwood",
        moistureLevel: 28.5,
        depth: "Surface"
      }
      ],
      nirAffectedAreas: [
      {
        id: "1",
        roomZoneId: "Master Bedroom",
        affectedSquareFootage: 180,
        waterSource: "Clean Water",
        timeSinceLoss: 24
      },
      {
        id: "2",
        roomZoneId: "Ensuite",
        affectedSquareFootage: 45,
        waterSource: "Clean Water",
        timeSinceLoss: 24
      },
      {
        id: "3",
        roomZoneId: "Hallway",
        affectedSquareFootage: 30,
        waterSource: "Clean Water",
        timeSinceLoss: 24
      }
      ],
      nirSelectedScopeItems: new Set([
      "remove_carpet",
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "apply_antimicrobial",
      "dry_out_structure",
      "containment_setup"
      ]),
      nirEnvironmentalData: {
      ambientTemperature: 22,
      humidityLevel: 65,
      dewPoint: 15.2,
      airCirculation: true
      },
      waterClass: 2,
      temperature: 22,
      humidity: 65,
      systemType: "closed",
      areas: [
      {
        id: `area-${Date.now()}-1`,
        name: "Master Bedroom",
        length: 5.5,
        width: 4.0,
        height: 2.7,
        wetPercentage: 75
      },
      {
        id: `area-${Date.now()}-2`,
        name: "Ensuite",
        length: 3.0,
        width: 2.5,
        height: 2.4,
        wetPercentage: 90
      },
      {
        id: `area-${Date.now()}-3`,
        name: "Hallway",
        length: 4.0,
        width: 1.2,
        height: 2.7,
        wetPercentage: 50
      }
      ],
      durationDays: 4,
      equipmentSelections: [
      {
        groupId: "lgr-55",
        quantity: 2,
          dailyRate: 45.00
      },
      {
        groupId: "airmover-800",
        quantity: 4,
          dailyRate: 25.00
        }
      ]
    },
    {
      id: "commercial-water-damage",
      name: "Commercial Water Damage",
      description: "Large-scale commercial office water damage from HVAC system failure affecting multiple floors",
      formData: {
        clientName: "TechCorp Industries",
        clientContactDetails: "Sarah Williams - 0412 345 678 - s.williams@techcorp.com.au",
        propertyAddress: "456 Business Park Drive, Melbourne VIC 3000",
        propertyPostcode: "3000",
        claimReferenceNumber: "CLM-2024-002456",
        incidentDate: "2024-02-10",
        technicianAttendanceDate: "2024-02-10",
        technicianName: "David Chen",
        technicianFieldReport: "Attended commercial office building at 2:00 PM. HVAC system failure on 3rd floor caused significant water damage across multiple floors. Water cascaded through ceiling tiles affecting office spaces, server room, and common areas. Immediate containment and extraction required. Multiple tenants affected.",
        buildingAge: "2005",
        structureType: "Commercial - Multi-Storey",
        accessNotes: "Building manager on site, security access required, elevator to 3rd floor",
        propertyId: "PROP-2024-002",
        jobNumber: "JOB-2024-089",
        reportInstructions: "Provide comprehensive commercial restoration report per IICRC S500, AS/NZS 3000, NCC, and WHS Regulations. Include business interruption assessment.",
        builderDeveloperCompanyName: "Metro Developments Ltd",
        builderDeveloperContact: "James Mitchell",
        builderDeveloperAddress: "789 Development Avenue, Melbourne VIC 3000",
        builderDeveloperPhone: "03 9876 5432",
        ownerManagementContactName: "Property Management Group",
        ownerManagementPhone: "03 8765 4321",
        ownerManagementEmail: "pmg@management.com.au",
        lastInspectionDate: "2023-12-01",
        buildingChangedSinceLastInspection: "No",
        structureChangesSinceLastInspection: "No",
        previousLeakage: "Yes - Minor leak in 2023",
        emergencyRepairPerformed: "Yes",
        insurerName: "QBE Insurance",
        methamphetamineScreen: "NEGATIVE",
        methamphetamineTestCount: "0",
        biologicalMouldDetected: false,
        biologicalMouldCategory: "",
        phase1StartDate: "2024-02-11",
        phase1EndDate: "2024-02-13",
        phase2StartDate: "2024-02-14",
        phase2EndDate: "2024-02-25",
        phase3StartDate: "2024-02-26",
        phase3EndDate: "2024-02-28",
      },
      nirMoistureReadings: [
        {
          id: "1",
          location: "3rd Floor - Office Area - Ceiling",
          surfaceType: "Drywall",
          moistureLevel: 58.3,
          depth: "Subsurface"
        },
        {
          id: "2",
          location: "3rd Floor - Server Room - Floor",
          surfaceType: "Concrete",
          moistureLevel: 42.1,
          depth: "Surface"
        },
        {
          id: "3",
          location: "2nd Floor - Office Area - Wall",
          surfaceType: "Drywall",
          moistureLevel: 35.7,
          depth: "Subsurface"
        },
        {
          id: "4",
          location: "2nd Floor - Common Area - Floor",
          surfaceType: "Carpet",
          moistureLevel: 48.9,
          depth: "Surface"
        },
        {
          id: "5",
          location: "1st Floor - Reception - Wall",
          surfaceType: "Drywall",
          moistureLevel: 29.4,
          depth: "Subsurface"
        }
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "3rd Floor - Office Area",
          affectedSquareFootage: 450,
          waterSource: "Clean Water",
          timeSinceLoss: 12
        },
        {
          id: "2",
          roomZoneId: "3rd Floor - Server Room",
          affectedSquareFootage: 120,
          waterSource: "Clean Water",
          timeSinceLoss: 12
        },
        {
          id: "3",
          roomZoneId: "2nd Floor - Office Area",
          affectedSquareFootage: 380,
          waterSource: "Clean Water",
          timeSinceLoss: 14
        }
      ],
      nirSelectedScopeItems: new Set([
        "extract_standing_water",
        "install_dehumidification",
        "install_air_movers",
        "demolish_drywall",
        "apply_antimicrobial",
        "dry_out_structure",
        "containment_setup",
        "ppe_required"
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 24,
        humidityLevel: 70,
        dewPoint: 18.1,
        airCirculation: false
      },
      waterClass: 2,
      temperature: 24,
      humidity: 70,
      systemType: "open",
      areas: [
        {
          id: `area-${Date.now()}-1`,
          name: "3rd Floor - Office Area",
          length: 15.0,
          width: 10.0,
          height: 3.0,
          wetPercentage: 80
        },
        {
          id: `area-${Date.now()}-2`,
          name: "3rd Floor - Server Room",
          length: 8.0,
          width: 5.0,
          height: 3.0,
          wetPercentage: 60
        },
        {
          id: `area-${Date.now()}-3`,
          name: "2nd Floor - Office Area",
          length: 12.0,
          width: 10.0,
          height: 3.0,
          wetPercentage: 70
        }
      ],
      durationDays: 7,
      equipmentSelections: [
        {
          groupId: "lgr-70",
          quantity: 3,
          dailyRate: 55.00
        },
        {
          groupId: "airmover-1200",
          quantity: 8,
          dailyRate: 30.00
        }
      ]
    },
    {
      id: "mould-remediation",
      name: "Mould Remediation",
      description: "Residential property with extensive mould growth due to long-term moisture issues",
      formData: {
        clientName: "Smith Family Trust",
        clientContactDetails: "Robert Smith - 0400 123 456 - r.smith@email.com",
        propertyAddress: "789 Oak Street, Brisbane QLD 4000",
        propertyPostcode: "4000",
        claimReferenceNumber: "CLM-2024-003789",
        incidentDate: "2024-01-05",
        technicianAttendanceDate: "2024-01-08",
        technicianName: "Emma Thompson",
        technicianFieldReport: "Attended property at 9:30 AM. Extensive mould growth detected throughout bathroom, laundry, and adjacent bedroom areas. Mould appears to be Category 2, affecting porous materials. Root cause: long-term moisture from leaking shower and poor ventilation. Immediate containment and remediation required. Occupants advised to vacate affected areas.",
        buildingAge: "1995",
        structureType: "Residential - Single Storey",
        accessNotes: "Owner present, keys provided, pet dog secured",
        propertyId: "PROP-2024-003",
        jobNumber: "JOB-2024-112",
        reportInstructions: "Provide mould remediation report per IICRC S520, AS/NZS 3000, and WHS Regulations. Include health and safety recommendations.",
        builderDeveloperCompanyName: "Brisbane Builders Group",
        builderDeveloperContact: "David Martinez",
        builderDeveloperAddress: "234 Construction Way, Brisbane QLD 4000",
        builderDeveloperPhone: "07 3456 7890",
        ownerManagementContactName: "Robert Smith",
        ownerManagementPhone: "0400 123 456",
        ownerManagementEmail: "r.smith@email.com",
        lastInspectionDate: "2022-08-20",
        buildingChangedSinceLastInspection: "No",
        structureChangesSinceLastInspection: "No",
        previousLeakage: "Yes - Ongoing shower leak",
        emergencyRepairPerformed: "No",
        insurerName: "Suncorp Insurance",
        methamphetamineScreen: "NEGATIVE",
        methamphetamineTestCount: "0",
        biologicalMouldDetected: true,
        biologicalMouldCategory: "CAT 2",
        phase1StartDate: "2024-01-09",
        phase1EndDate: "2024-01-11",
        phase2StartDate: "2024-01-12",
        phase2EndDate: "2024-01-22",
        phase3StartDate: "2024-01-23",
        phase3EndDate: "2024-01-25",
      },
      nirMoistureReadings: [
        {
          id: "1",
          location: "Bathroom - Wall Behind Shower",
          surfaceType: "Drywall",
          moistureLevel: 62.4,
          depth: "Subsurface"
        },
        {
          id: "2",
          location: "Bathroom - Ceiling",
          surfaceType: "Plaster",
          moistureLevel: 55.8,
          depth: "Subsurface"
        },
        {
          id: "3",
          location: "Laundry - Wall",
          surfaceType: "Drywall",
          moistureLevel: 48.2,
          depth: "Subsurface"
        },
        {
          id: "4",
          location: "Bedroom - Wall Adjacent to Bathroom",
          surfaceType: "Drywall",
          moistureLevel: 41.6,
          depth: "Subsurface"
        }
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Bathroom",
          affectedSquareFootage: 65,
          waterSource: "Grey Water",
          timeSinceLoss: 720
        },
        {
          id: "2",
          roomZoneId: "Laundry",
          affectedSquareFootage: 45,
          waterSource: "Grey Water",
          timeSinceLoss: 720
        },
        {
          id: "3",
          roomZoneId: "Bedroom",
          affectedSquareFootage: 120,
          waterSource: "Grey Water",
          timeSinceLoss: 720
        }
      ],
      nirSelectedScopeItems: new Set([
        "demolish_drywall",
        "apply_antimicrobial",
        "containment_setup",
        "ppe_required",
        "sanitize_materials",
        "dry_out_structure"
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 26,
        humidityLevel: 75,
        dewPoint: 21.2,
        airCirculation: false
      },
      waterClass: 3,
      temperature: 26,
      humidity: 75,
      systemType: "closed",
      areas: [
        {
          id: `area-${Date.now()}-1`,
          name: "Bathroom",
          length: 3.5,
          width: 2.5,
          height: 2.4,
          wetPercentage: 90
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Laundry",
          length: 3.0,
          width: 2.0,
          height: 2.4,
          wetPercentage: 70
        },
        {
          id: `area-${Date.now()}-3`,
          name: "Bedroom",
          length: 4.5,
          width: 3.5,
          height: 2.7,
          wetPercentage: 40
        }
      ],
      durationDays: 10,
      equipmentSelections: [
        {
          groupId: "desiccant-150",
          quantity: 2,
          dailyRate: 85.00
        },
        {
          groupId: "airmover-800",
          quantity: 6,
          dailyRate: 25.00
        }
      ]
    },
    {
      id: "storm-damage",
      name: "Storm Damage - Roof Leak",
      description: "Residential property with water damage from severe storm causing roof penetration",
      formData: {
        clientName: "Johnson Residence",
        clientContactDetails: "Patricia Johnson - 0423 456 789 - p.johnson@email.com",
        propertyAddress: "321 Weather Street, Sydney NSW 2000",
        propertyPostcode: "2000",
        claimReferenceNumber: "CLM-2024-004123",
        incidentDate: "2024-03-15",
        technicianAttendanceDate: "2024-03-16",
        technicianName: "Michael Brown",
        technicianFieldReport: "Attended property at 11:00 AM following severe storm event. Roof penetration identified in attic space above living room. Water has entered through damaged roof tiles and affected ceiling, walls, and flooring in living area. Storm water contamination present. Immediate tarping and extraction required.",
        buildingAge: "1988",
        structureType: "Residential - Two Storey",
        accessNotes: "Owner present, ladder access to roof required",
        propertyId: "PROP-2024-004",
        jobNumber: "JOB-2024-145",
        reportInstructions: "Provide storm damage assessment report per IICRC S500, NCC, and AS/NZS 3000. Include structural assessment recommendations.",
        builderDeveloperCompanyName: "Sydney Construction Co.",
        builderDeveloperContact: "Amanda White",
        builderDeveloperAddress: "567 Builder Avenue, Sydney NSW 2000",
        builderDeveloperPhone: "02 9123 4567",
        ownerManagementContactName: "Patricia Johnson",
        ownerManagementPhone: "0423 456 789",
        ownerManagementEmail: "p.johnson@email.com",
        lastInspectionDate: "2023-11-10",
        buildingChangedSinceLastInspection: "No",
        structureChangesSinceLastInspection: "No",
        previousLeakage: "No",
        emergencyRepairPerformed: "Yes - Temporary tarping",
        insurerName: "NRMA Insurance",
        methamphetamineScreen: "NEGATIVE",
        methamphetamineTestCount: "0",
        biologicalMouldDetected: false,
        biologicalMouldCategory: "",
        phase1StartDate: "2024-03-17",
        phase1EndDate: "2024-03-19",
        phase2StartDate: "2024-03-20",
        phase2EndDate: "2024-03-30",
        phase3StartDate: "2024-03-31",
        phase3EndDate: "2024-04-02",
      },
      nirMoistureReadings: [
        {
          id: "1",
          location: "Living Room - Ceiling",
          surfaceType: "Plaster",
          moistureLevel: 67.3,
          depth: "Subsurface"
        },
        {
          id: "2",
          location: "Living Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 59.1,
          depth: "Subsurface"
        },
        {
          id: "3",
          location: "Living Room - Floor",
          surfaceType: "Hardwood",
          moistureLevel: 44.7,
          depth: "Surface"
        },
        {
          id: "4",
          location: "Attic - Floor Joists",
          surfaceType: "Wood",
          moistureLevel: 72.5,
          depth: "Subsurface"
        }
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Living Room",
          affectedSquareFootage: 250,
          waterSource: "Grey Water",
          timeSinceLoss: 18
        },
        {
          id: "2",
          roomZoneId: "Attic Space",
          affectedSquareFootage: 180,
          waterSource: "Grey Water",
          timeSinceLoss: 18
        }
      ],
      nirSelectedScopeItems: new Set([
        "extract_standing_water",
        "install_dehumidification",
        "install_air_movers",
        "demolish_drywall",
        "apply_antimicrobial",
        "dry_out_structure",
        "containment_setup",
        "ppe_required"
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 20,
        humidityLevel: 68,
        dewPoint: 14.0,
        airCirculation: true
      },
      waterClass: 2,
      temperature: 20,
      humidity: 68,
      systemType: "open",
      areas: [
        {
          id: `area-${Date.now()}-1`,
          name: "Living Room",
          length: 6.0,
          width: 5.0,
          height: 2.7,
          wetPercentage: 85
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Attic Space",
          length: 8.0,
          width: 6.0,
          height: 2.4,
          wetPercentage: 60
        }
      ],
      durationDays: 6,
      equipmentSelections: [
        {
          groupId: "lgr-55",
          quantity: 3,
          dailyRate: 45.00
        },
        {
          groupId: "airmover-800",
          quantity: 5,
          dailyRate: 25.00
        }
      ]
    },
    {
      id: "flood-damage",
      name: "Flood Damage - Category 3",
      description: "Severe flood damage from overflowing river affecting ground floor of residential property",
      formData: {
        clientName: "River View Properties",
        clientContactDetails: "Jennifer Lee - 0434 567 890 - j.lee@email.com",
        propertyAddress: "555 Riverside Drive, Adelaide SA 5000",
        propertyPostcode: "5000",
        claimReferenceNumber: "CLM-2024-005456",
        incidentDate: "2024-02-28",
        technicianAttendanceDate: "2024-03-01",
        technicianName: "Thomas Wilson",
        technicianFieldReport: "Attended property at 8:00 AM. Severe flood damage from river overflow. Ground floor completely inundated with contaminated water (Category 3). Water level reached 1.2 metres. Extensive damage to all ground floor areas including kitchen, dining, family room, and garage. Sewage contamination confirmed. Immediate evacuation and extensive remediation required.",
        buildingAge: "2015",
        structureType: "Residential - Two Storey",
        accessNotes: "Property accessible, water receded, safety assessment completed",
        propertyId: "PROP-2024-005",
        jobNumber: "JOB-2024-178",
        reportInstructions: "Provide comprehensive flood damage report per IICRC S500, WHS Regulations, and AS/NZS 3000. Include health and safety protocols for Category 3 water.",
        builderDeveloperCompanyName: "Adelaide Property Developers",
        builderDeveloperContact: "Christopher Taylor",
        builderDeveloperAddress: "890 Development Road, Adelaide SA 5000",
        builderDeveloperPhone: "08 7654 3210",
        ownerManagementContactName: "Jennifer Lee",
        ownerManagementPhone: "0434 567 890",
        ownerManagementEmail: "j.lee@email.com",
        lastInspectionDate: "2023-09-15",
        buildingChangedSinceLastInspection: "No",
        structureChangesSinceLastInspection: "No",
        previousLeakage: "No",
        emergencyRepairPerformed: "Yes - Emergency extraction",
        insurerName: "RACV Insurance",
        methamphetamineScreen: "NEGATIVE",
        methamphetamineTestCount: "0",
        biologicalMouldDetected: false,
        biologicalMouldCategory: "",
        phase1StartDate: "2024-03-02",
        phase1EndDate: "2024-03-05",
        phase2StartDate: "2024-03-06",
        phase2EndDate: "2024-03-25",
        phase3StartDate: "2024-03-26",
        phase3EndDate: "2024-03-30",
      },
      nirMoistureReadings: [
        {
          id: "1",
          location: "Kitchen - Floor",
          surfaceType: "Tile",
          moistureLevel: 78.5,
          depth: "Subsurface"
        },
        {
          id: "2",
          location: "Family Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 71.2,
          depth: "Subsurface"
        },
        {
          id: "3",
          location: "Garage - Floor",
          surfaceType: "Concrete",
          moistureLevel: 65.8,
          depth: "Surface"
        },
        {
          id: "4",
          location: "Dining Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 69.4,
          depth: "Subsurface"
        },
        {
          id: "5",
          location: "Kitchen - Cabinets",
          surfaceType: "Particle Board",
          moistureLevel: 73.1,
          depth: "Subsurface"
        }
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Kitchen",
          affectedSquareFootage: 180,
          waterSource: "Black Water",
          timeSinceLoss: 48
        },
        {
          id: "2",
          roomZoneId: "Family Room",
          affectedSquareFootage: 320,
          waterSource: "Black Water",
          timeSinceLoss: 48
        },
        {
          id: "3",
          roomZoneId: "Dining Room",
          affectedSquareFootage: 150,
          waterSource: "Black Water",
          timeSinceLoss: 48
        },
        {
          id: "4",
          roomZoneId: "Garage",
          affectedSquareFootage: 280,
          waterSource: "Black Water",
          timeSinceLoss: 48
        }
      ],
      nirSelectedScopeItems: new Set([
        "remove_carpet",
        "extract_standing_water",
        "install_dehumidification",
        "install_air_movers",
        "demolish_drywall",
        "apply_antimicrobial",
        "dry_out_structure",
        "containment_setup",
        "ppe_required",
        "sanitize_materials"
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 18,
        humidityLevel: 80,
        dewPoint: 14.6,
        airCirculation: false
      },
      waterClass: 3,
      temperature: 18,
      humidity: 80,
      systemType: "closed",
      areas: [
        {
          id: `area-${Date.now()}-1`,
          name: "Kitchen",
          length: 5.0,
          width: 4.0,
          height: 2.7,
          wetPercentage: 100
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Family Room",
          length: 8.0,
          width: 6.0,
          height: 2.7,
          wetPercentage: 100
        },
        {
          id: `area-${Date.now()}-3`,
          name: "Dining Room",
          length: 5.5,
          width: 4.5,
          height: 2.7,
          wetPercentage: 100
        },
        {
          id: `area-${Date.now()}-4`,
          name: "Garage",
          length: 7.0,
          width: 6.0,
          height: 2.7,
          wetPercentage: 90
        }
      ],
      durationDays: 14,
      equipmentSelections: [
        {
          groupId: "desiccant-150",
          quantity: 4,
          dailyRate: 85.00
        },
        {
          groupId: "lgr-70",
          quantity: 2,
          dailyRate: 55.00
        },
        {
          groupId: "airmover-1200",
          quantity: 10,
          dailyRate: 30.00
        }
      ]
    }
  ];

  // Populate form data based on selected use case
  const populateUseCaseData = (useCase: UseCaseData) => {
    // Set form data
    setFormData(useCase.formData);

    // Set NIR Moisture Readings
    setNirMoistureReadings(useCase.nirMoistureReadings);

    // Set NIR Affected Areas
    setNirAffectedAreas(useCase.nirAffectedAreas);

    // Set NIR Scope Items
    setNirSelectedScopeItems(useCase.nirSelectedScopeItems);

    // Set Environmental Data
    setNirEnvironmentalData(useCase.nirEnvironmentalData);

    // Set Psychrometric Data
    setWaterClass(useCase.waterClass);
    setTemperature(useCase.temperature);
    setHumidity(useCase.humidity);
    setSystemType(useCase.systemType);

    // Set Scope Areas
    setAreas(useCase.areas);

    // Set Duration Days
    setDurationDays(useCase.durationDays);

    // Set Equipment Selections with updated rates
    const equipmentSelectionsWithRates = useCase.equipmentSelections.map(sel => ({
        ...sel,
      dailyRate: pricingConfig
        ? getEquipmentDailyRate(sel.groupId, pricingConfig)
        : sel.dailyRate
    }));
    setEquipmentSelections(equipmentSelectionsWithRates);

    toast.success(`Form filled with "${useCase.name}" use case data`);
    setShowUseCaseModal(false);
  };

  // Quick Fill with Test Data - Check credits and show modal
  const handleQuickFill = async () => {
    // Check if user has credits or unlimited access
    if (!hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0)) {
      toast.error("No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.");
      router.push("/dashboard/pricing");
      return;
    }

    // Deduct credit if not unlimited
    if (!hasUnlimitedQuickFill) {
      setLoadingCredits(true);
      try {
        const response = await fetch("/api/user/quick-fill-credits", {
          method: "POST"
        });

        if (response.ok) {
          const data = await response.json();
          setQuickFillCredits(data.creditsRemaining);
          setShowUseCaseModal(true);
        } else {
          const error = await response.json();
          if (error.requiresUpgrade) {
            toast.error("No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.");
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
    if (open && !hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0)) {
      toast.error("No Quick Fill credits remaining. Upgrade to unlock unlimited Quick Fill access.");
      return;
    }
    setShowUseCaseModal(open);
  };

  return (
    <div className="max-w-full mx-auto">
      {/* Draft Recovery Modal */}
      {session?.user?.id && !initialReportId && (
        <DraftRecoveryModal
          userId={session.user.id}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDrafts}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className={cn("text-2xl font-semibold mb-2", "text-neutral-900 dark:text-neutral-50")}>Initial Data Entry</h2>
            <p className={cn("text-neutral-600 dark:text-neutral-400")}>
              Complete each section to build your report. Click sections to expand/collapse.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save status indicator */}
            {autoSaveStatus === 'saving' && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {autoSaveStatus === 'saved' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>All changes saved</span>
              </div>
            )}
            {autoSaveStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4" />
                <span>Failed to save</span>
              </div>
            )}

            {/* Quick Fill button */}
            <button
              type="button"
              onClick={handleQuickFill}
              disabled={loadingCredits || (!hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0))}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap",
                (!hasUnlimitedQuickFill && (quickFillCredits === null || quickFillCredits <= 0))
                  ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white dark:text-white"
              )}
              title={
                hasUnlimitedQuickFill
                  ? "Quick Fill Test Data (Unlimited)"
                  : quickFillCredits !== null && quickFillCredits > 0
                  ? `Quick Fill Test Data (${quickFillCredits} credit${quickFillCredits !== 1 ? 's' : ''} remaining)`
                  : "No Quick Fill credits remaining. Upgrade to unlimited Quick Fill access."
              }
            >
              <Zap className="w-4 h-4" />
              Quick Fill
              {!hasUnlimitedQuickFill && quickFillCredits !== null && quickFillCredits > 0 && (
                <span className="ml-1 text-xs">({quickFillCredits})</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <AccordionFormContainer>
        {/* Step 0: Client Information Section */}
        <AccordionFormSection
          title="Client Information"
          description="Enter the client's basic information"
          completionPercentage={calculateSectionCompletion(0)}
          hasErrors={sectionHasErrors(0)}
          isExpanded={expandedSections.has(0)}
          onToggle={() => toggleSection(0)}
          sectionNumber={1}
          totalSections={visibleSteps.length}
        >

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                Client Name <span className={cn("text-error-500 dark:text-error-400")}>*</span>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
                placeholder="Enter client's full name"
              />
            </div>

            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                  placeholder="Phone number, email, etc."
                />
              </div>
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 1: Assignee Selection Section (for Technicians and Managers) */}
        {requiresAssignee && (
        <AccordionFormSection
          title="Assignee Selection"
          description="Select who will handle this report"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 1))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 1))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 1))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 1))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 1) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="space-y-2">
              <label className={cn("block text-sm font-medium", "text-neutral-700 dark:text-neutral-300")}>
                {session?.user?.role === "USER" ? "Manager" : "Admin"}{" "}
                <span className={cn("text-error-500 dark:text-error-400")}>*</span>
              </label>

              {loadingAssignees ? (
                <div className={cn("flex items-center gap-2 py-2", "text-neutral-600 dark:text-neutral-400")}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    Loading {session?.user?.role === "USER" ? "managers" : "admins"}...
                  </span>
                </div>
              ) : assignees.length === 0 ? (
                <div className={cn("p-3 rounded-lg text-sm", "bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400")}>
                  No {session?.user?.role === "USER" ? "managers" : "admins"} available in your organization.
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
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                >
                  <option value="">Select {session?.user?.role === "USER" ? "a Manager" : "an Admin"}...</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name || assignee.email}
                    </option>
                  ))}
                </select>
              )}

              <p className={cn("text-xs", "text-neutral-600 dark:text-neutral-400")}>
                {session?.user?.role === "USER"
                  ? "Select the manager who will oversee this report."
                  : "Select the admin who will oversee this report."}
              </p>
            </div>
        </AccordionFormSection>
        )}

        {/* Step 2: Property Information Section */}
        <AccordionFormSection
          title="Property Information"
          description="Enter the property address and details"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 2))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 2))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 2))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 2))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 2) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="space-y-4">
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                Property Address <span className="text-error-500 dark:text-error-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.propertyAddress}
                onChange={(e) =>
                  handleInputChange("propertyAddress", e.target.value)
                }
                className={cn(
                "w-full px-4 py-2 rounded-lg",
                "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                "text-neutral-900 dark:text-neutral-50",
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                placeholder="Full property address"
              />
            </div>

            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
                Postcode <span className="text-error-500 dark:text-error-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={4}
                value={formData.propertyPostcode}
                onChange={(e) =>
                  handleInputChange(
                    "propertyPostcode",
                    e.target.value.replace(/\D/g, "")
                  )
                }
                className={cn(
                "w-full px-4 py-2 rounded-lg",
                "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                "text-neutral-900 dark:text-neutral-50",
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                placeholder="0000"
              />
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-neutral-400")}>
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
                      handleInputChange("buildingAge", data.data.yearBuilt?.toString() || "");
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
              <div className={cn("pt-4 border-t", "border-neutral-300 dark:border-neutral-700")}>
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
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                  placeholder="Property identifier"
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                  placeholder="Job number"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                  placeholder="e.g., 2010 or 1985"
                />
              </div>

              <div>
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-neutral-300")}>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
                placeholder="Key under mat, owner present, gate code, etc."
                rows={2}
              />
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 3: Claim Information Section */}
        <AccordionFormSection
          title="Claim Information"
          description="Enter claim and insurer details"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 3))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 3))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 3))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 3))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 3) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
                placeholder="Claim reference"
              />
            </div>

            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
                placeholder="Insurance company"
              />
            </div>

              <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                  />
                </div>
              </div>

              <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                      e.target.value
                    )
                  }
                  className={cn(
                    "w-full pl-10 pr-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                  />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
                placeholder="Name of technician who attended"
              />
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 4: Cover Page Information Section */}
        <AccordionFormSection
          title="Cover Page Information"
          description="Add report instructions and standards"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 4))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 4))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 4))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 4))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 4) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="space-y-4">
            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
                placeholder="e.g., Provide a restoration inspection report per IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000. Provide recommendations to ensure longevity."
                rows={3}
              />
              <p className={cn("text-xs mt-1", "text-neutral-600 dark:text-neutral-400")}>
                This will appear on the cover page of the report
              </p>
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 5: Additional Contact Information Section */}
        <AccordionFormSection
          title="Additional Contact Information"
          description="Add insurer, builder, and body corporate contacts"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 5))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 5))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 5))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 5))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 5) + 1}
          totalSections={visibleSteps.length}
        >
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
                      handleInputChange("builderDeveloperCompanyName", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("builderDeveloperContact", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("builderDeveloperAddress", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("builderDeveloperPhone", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("ownerManagementContactName", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("ownerManagementPhone", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      handleInputChange("ownerManagementEmail", e.target.value)
                    }
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm",
                      "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                      "text-neutral-900 dark:text-neutral-50",
                      "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                    )}
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 6: Previous Maintenance & Repair History Section */}
        <AccordionFormSection
          title="Previous Maintenance & Repair History"
          description="Document inspection and maintenance history"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 6))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 6))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 6))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 6))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 6) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="space-y-4">
            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                  Was building changed since last inspection?
                </label>
                <select
                  value={formData.buildingChangedSinceLastInspection}
                  onChange={(e) =>
                    handleInputChange("buildingChangedSinceLastInspection", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                  Were there changes/additions to structure since last inspection?
                </label>
                <select
                  value={formData.structureChangesSinceLastInspection}
                  onChange={(e) =>
                    handleInputChange("structureChangesSinceLastInspection", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                >
                  <option value="">Select...</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="Yes - Minor leak in 2023">Yes - Minor leak in 2023</option>
                  <option value="Yes - Ongoing shower leak">Yes - Ongoing shower leak</option>
                  <option value="Yes - Previous water damage">Yes - Previous water damage</option>
                  <option value="Yes - Roof leak">Yes - Roof leak</option>
                  <option value="Yes - Plumbing issue">Yes - Plumbing issue</option>
                </select>
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                  Was emergency repair performed?
                </label>
                <select
                  value={formData.emergencyRepairPerformed}
                  onChange={(e) =>
                    handleInputChange("emergencyRepairPerformed", e.target.value)
                  }
                  className={cn(
                    "w-full px-3 py-2 rounded-lg text-sm",
                    "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                    "text-neutral-900 dark:text-neutral-50",
                    "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                  )}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>
        </AccordionFormSection>

        {/* Step 7: Technician Field Report Section */}
        <AccordionFormSection
          title="Technician Field Report"
          description="Enter technician's on-site observations"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 7))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 7))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 7))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 7))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 7) + 1}
          totalSections={visibleSteps.length}
        >
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
              Technician's Field Report <span className="text-error-500 dark:text-error-400">*</span>
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
                "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
              )}
              placeholder="Paste or type the technician's field report here..."
            />
          </div>
        </AccordionFormSection>

        {/* Step 8: NIR Fields - Available for all report types */}
        <AccordionFormSection
          title="NIR Inspection Data"
          description="Enter moisture readings, affected areas, and scope items"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 8))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 8))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 8))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 8))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 8) + 1}
          totalSections={visibleSteps.length}
        >
          {/* Moisture Readings */}
          <div className={cn(
            "p-4 rounded-lg border",
            "border-neutral-200 dark:border-neutral-800",
            "bg-white dark:bg-neutral-900/50"
          )}>
            <h4 className={cn("text-lg font-semibold mb-3 flex items-center gap-2", "text-neutral-900 dark:text-neutral-50")}>
              <Droplets className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              Moisture Readings <span className="text-error-500 dark:text-error-400">*</span>
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                      "text-neutral-800 dark:text-neutral-50"
                    )}
                  >
                    <span className={cn("text-sm", "text-neutral-800 dark:text-neutral-50")}>
                      {reading.location} - {reading.surfaceType}:{" "}
                      {reading.moistureLevel}% ({reading.depth})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNirMoistureReadings(
                          nirMoistureReadings.filter((r) => r.id !== reading.id)
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
          <div className={cn(
            "p-4 rounded-lg border",
            "border-neutral-200 dark:border-neutral-800",
            "bg-white dark:bg-neutral-900/50"
          )}>
            <h4 className={cn("text-lg font-semibold mb-3 flex items-center gap-2", "text-neutral-900 dark:text-neutral-50")}>
              <MapPin className="w-4 h-4" />
              Affected Areas <span className="text-error-500 dark:text-error-400">*</span>
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                    "text-neutral-900 dark:text-neutral-50"
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
                      "text-neutral-800 dark:text-neutral-50"
                    )}
                  >
                    <span className={cn("text-sm", "text-neutral-800 dark:text-neutral-50")}>
                      {area.roomZoneId}: {area.affectedSquareFootage} sq ft -{" "}
                      {area.waterSource}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNirAffectedAreas(
                          nirAffectedAreas.filter((a) => a.id !== area.id)
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
          <div className={cn(
            "p-4 rounded-lg border",
            "border-neutral-200 dark:border-neutral-800",
            "bg-white dark:bg-neutral-900/50"
          )}>
            <h4 className={cn("text-lg font-semibold mb-3 flex items-center gap-2", "text-neutral-900 dark:text-neutral-50")}>
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
                    "hover:bg-neutral-100 dark:hover:bg-slate-900/70"
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
                      "text-green-500"
                    )}
                  />
                  <span className={cn("text-sm", "text-neutral-800 dark:text-neutral-50")}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

        </AccordionFormSection>

        {/* Step 9: Hazard Profile Section */}
        <AccordionFormSection
          title="Hazard Profile"
          description="Document potential hazards and safety concerns"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 9))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 9))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 9))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 9))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 9) + 1}
          totalSections={visibleSteps.length}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
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
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
                )}
              >
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="POSITIVE">POSITIVE</option>
              </select>
            </div>

            {formData.methamphetamineScreen === "POSITIVE" && (
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                  Test Count
                </label>
                <input
                  type="number"
                  value={formData.methamphetamineTestCount}
                  onChange={(e) =>
                    handleInputChange(
                      "methamphetamineTestCount",
                      e.target.value ? parseInt(e.target.value) : ""
                    )
                  }
                  className={cn(
                  "w-full px-3 py-2 rounded-lg text-sm",
                  "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                  "text-neutral-900 dark:text-neutral-50",
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
                      e.target.checked
                    )
                  }
                  className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                Bio/Mould Detected
              </label>
            </div>

            {formData.biologicalMouldDetected && (
              <div>
                <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-neutral-300")}>
                  Mould Category
                </label>
                <select
                  value={formData.biologicalMouldCategory}
                  onChange={(e) =>
                    handleInputChange("biologicalMouldCategory", e.target.value)
                  }
                  className={cn(
                  "w-full px-3 py-2 rounded-lg text-sm",
                  "bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700",
                  "text-neutral-900 dark:text-neutral-50",
                  "focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50"
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
        </AccordionFormSection>

        {/* Step 10: Timeline Estimation Section */}
        <AccordionFormSection
          title="Timeline Estimation (Optional)"
          description="Estimate project timeline across phases"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 10))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 10))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 10))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 10))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 10) + 1}
          totalSections={visibleSteps.length}
        >
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
                  <label className="block text-xs font-medium mb-1">End</label>
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
                  <label className="block text-xs font-medium mb-1">End</label>
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
                  <label className="block text-xs font-medium mb-1">End</label>
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
        </AccordionFormSection>

        {/* Step 11: Equipment & Tools Selection Section */}
        <AccordionFormSection
          title="Equipment & Tools Selection"
          description="Configure psychrometric assessment and equipment"
          completionPercentage={calculateSectionCompletion(visibleSteps.findIndex(s => s.id === 11))}
          hasErrors={sectionHasErrors(visibleSteps.findIndex(s => s.id === 11))}
          isExpanded={expandedSections.has(visibleSteps.findIndex(s => s.id === 11))}
          onToggle={() => toggleSection(visibleSteps.findIndex(s => s.id === 11))}
          sectionNumber={visibleSteps.findIndex(s => s.id === 11) + 1}
          totalSections={visibleSteps.length}
        >
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
                    Understand the 'Energy' in the air. Temperature and Humidity
                    determine if the air acts like a 'Thirsty Sponge' (Good) or
                    a 'Saturated Sponge' (Bad).
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-gray-50 dark:bg-slate-900/30">
                <h4 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Water Loss Class</h4>
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
                  Class 1 (Least water) to Class 4 (Bound water/Deep saturation)
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
                      onChange={(e) => setTemperature(parseInt(e.target.value))}
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
                <h4 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Job Manifest</h4>
                <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg mb-4 border border-gray-200 dark:border-slate-700">
                  <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">Efficiency Targets</h5>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1 text-gray-700 dark:text-gray-300">
                        <span>Water Removal</span>
                        <span>
                          {totalEquipmentCapacity} / {waterRemovalTarget} L/Day
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              waterRemovalTarget > 0
                                ? (totalEquipmentCapacity / waterRemovalTarget) * 100
                                : 0
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
                                ? (totalAirMoverUnits / airMoversRequired) * 100
                                : 0
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
                                afdUnitsRequired > 0 ? (totalAFDUnits / afdUnitsRequired) * 100 : 0
                              )}%`,
                            }}
                          />
                </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                  <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">ESTIMATED CONSUMPTION</h5>
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
                  <h5 className="font-semibold mb-3 text-gray-900 dark:text-white">LGR DEHUMIDIFIERS</h5>
                  <div className="space-y-2">
                    {lgrDehumidifiers.map((group) => {
                      const selection = equipmentSelections.find(
                        (s) => s.groupId === group.id
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
                                        pricingConfig
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
                  
                  <h5 className="font-semibold mb-3 mt-4 text-gray-900 dark:text-white">AIR MOVERS</h5>
                  <div className="space-y-2">
                    {airMovers.map((group) => {
                      const selection = equipmentSelections.find(
                        (s) => s.groupId === group.id
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
                                        pricingConfig
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

                  <h5 className="font-semibold mb-3 mt-4 text-gray-900 dark:text-white">AFD / AIR FILTRATION (HEPA)</h5>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 mb-3">
                    Use for containment/filtration scenarios (e.g., mould, Category 2/3 contamination, demolition dust).
                  </p>
                  <div className="space-y-2">
                    {afdUnits.map((group) => {
                      const selection = equipmentSelections.find((s) => s.groupId === group.id);
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
                              <div className="font-medium text-sm">{group.capacity}</div>
                              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                                $
                                {(
                                  selection?.dailyRate ||
                                  (pricingConfig ? getEquipmentDailyRate(group.id, pricingConfig) : 0)
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
                                onClick={() => handleEquipmentQuantityChange(group.id, -1)}
                                className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded text-gray-700 dark:text-white"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEquipmentQuantityChange(group.id, 1)}
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
        </AccordionFormSection>

        </AccordionFormContainer>

        {/* Submit Button */}
        <div className={cn(
          "sticky bottom-0 left-0 right-0 p-6 rounded-t-xl border-t-2 mt-6",
          "bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm",
          "border-neutral-200 dark:border-neutral-800",
          "shadow-2xl shadow-neutral-900/10"
        )}>
          <div className="max-w-7xl mx-auto flex items-center justify-end gap-4">
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
                "hover:shadow-lg hover:shadow-blue-500/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      </form>

      {/* Report Type Selection - Appears after saving (outside form) */}
      {showReportTypeSelection && (
        <div className={cn(
          "p-6 rounded-lg border-2 space-y-6 mt-6",
          "border-cyan-500/50 dark:border-cyan-500/50",
          "bg-cyan-500/10 dark:bg-cyan-500/10"
        )}>
          <h3 className={cn("text-2xl font-semibold mb-4 flex items-center gap-2", "text-neutral-900 dark:text-neutral-50")}>
            <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Select Report Type
          </h3>
          <p className={cn("text-neutral-600 dark:text-neutral-400 mb-6")}>
            Choose the level of detail for your inspection report. Data has been saved successfully.
          </p>
          
          {isTrial && (
            <div className={cn(
              "p-4 rounded-lg border mb-4",
              "bg-blue-50 dark:bg-blue-900/20",
              "border-blue-200 dark:border-blue-800"
            )}>
              <p className={cn("text-sm", "text-neutral-700 dark:text-neutral-300")}>
                <strong className={cn("text-neutral-900 dark:text-white")}>Free Plan:</strong> You can generate Basic reports only. Upgrade to unlock Enhanced and Optimised reports.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
              <button
                type="button"
              onClick={() => handleReportTypeChoice("basic")}
              disabled={loading}
                className="p-6 rounded-lg border-2 border-neutral-300 dark:border-neutral-700 hover:border-blue-500 bg-white dark:bg-neutral-900/50 hover:bg-slate-800/50 transition-all text-left group disabled:opacity-50"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                      <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                    <h4 className={cn("text-xl font-semibold", "text-neutral-900 dark:text-white")}>
                      Basic
                    </h4>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">Quick Processing</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:text-blue-400 transition-colors" />
                </div>
              <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
                Generate report directly with saved data
              </p>
                <div className="space-y-2">
                {[
                  "Areas affected",
                  "Observations from technician",
                  "Equipment deployed",
                  "Reference to IICRC standards",
                  "Any obvious hazards flagged",
                ].map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                  >
                      <CheckCircle className="w-4 h-4" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>

              <button
                type="button"
              onClick={() => handleReportTypeChoice("enhanced")}
            disabled={loading || isTrial}
              className={cn(
                "p-6 rounded-lg border-2 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all text-left group relative disabled:opacity-50",
                isTrial ? "border-neutral-300 dark:border-neutral-700 cursor-not-allowed" : "border-cyan-500"
              )}
              >
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-full">
                    RECOMMENDED
                  </span>
                </div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/40 transition-colors">
                      <Sparkles className="w-6 h-6 text-cyan-300" />
                    </div>
                    <div>
                    <h4 className={cn("text-xl font-semibold", "text-neutral-900 dark:text-white")}>
                      Enhanced
                    </h4>
                    <p className={cn("text-sm", "text-neutral-700 dark:text-primary-400")}>Basic + Tier 1</p>
                    </div>
                  </div>
                  <ArrowRight className={cn("w-5 h-5 transition-colors", "text-neutral-700 dark:text-primary-400", "group-hover:text-cyan-600 dark:group-hover:text-cyan-300")} />
                </div>
            <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
              {isTrial
                ? "Upgrade required: Enhanced reports are available on paid plans."
                : "Answer Tier 1 critical questions, then generate report"}
              </p>
                <div className="space-y-2">
                {[
                  "All Basic Report features",
                  "Tier 1: Critical Questions (8 required)",
                  "Property type & construction year",
                  "Water source & category",
                  "Occupancy & hazard assessment",
                ].map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <CheckCircle className={cn("w-4 h-4", "text-neutral-700 dark:text-primary-400")} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>

          <button
            type="button"
              onClick={() => handleReportTypeChoice("optimised")}
          disabled={loading || isTrial}
            className={cn(
              "p-6 rounded-lg border-2 bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 transition-all text-left group relative disabled:opacity-50",
              isTrial ? "border-neutral-300 dark:border-neutral-700 cursor-not-allowed" : "border-green-500"
            )}
            >
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full">
                  COMPREHENSIVE
                </span>
              </div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-green-500/30 flex items-center justify-center group-hover:bg-green-500/40 transition-colors">
                    <CheckCircle className="w-6 h-6 text-green-300" />
                  </div>
                  <div>
                    <h4 className={cn("text-xl font-semibold", "text-neutral-900 dark:text-white")}>
                      Optimised
                    </h4>
                    <p className={cn("text-sm", "text-neutral-700 dark:text-green-400")}>Enhanced + Tier 2 + Tier 3</p>
                  </div>
                </div>
                <ArrowRight className={cn("w-5 h-5 transition-colors", "text-neutral-700 dark:text-green-400", "group-hover:text-green-600 dark:group-hover:text-green-300")} />
              </div>
            <p className="text-neutral-700 dark:text-neutral-300 mb-4 text-sm">
              {isTrial
                ? "Upgrade required: Optimised reports are available on paid plans."
                : "Complete all tiers including photo uploads, then generate report"}
              </p>
              <div className="space-y-2">
                {[
                  "All Enhanced features",
                  "Tier 2: Enhancement Questions (7 optional)",
                  "Tier 3: Optimisation Questions (5 optional)",
                  "Photo uploads with categorization",
                  "Most comprehensive report",
                ].map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <CheckCircle className={cn("w-4 h-4", "text-neutral-700 dark:text-green-400")} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
          </button>
        </div>
    </div>
      )}

      {/* Use Case Selection Modal */}
      <Dialog open={showUseCaseModal} onOpenChange={setShowUseCaseModal}>
        <DialogContent className={cn(
          "max-w-2xl",
          "bg-white dark:bg-neutral-900",
          "border-neutral-200 dark:border-neutral-800"
        )}>
          <DialogHeader>
            <DialogTitle className={cn("text-2xl font-semibold", "text-neutral-900 dark:text-neutral-50")}>
              Select Use Case
            </DialogTitle>
            <DialogDescription className={cn("text-neutral-600 dark:text-neutral-400")}>
              Choose a use case to populate the form with sample data for testing
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-3">
            {useCases.map((useCase) => (
              <button
                key={useCase.id}
                type="button"
                onClick={() => populateUseCaseData(useCase)}
                className={cn(
                  "w-full p-4 rounded-lg border-2 text-left transition-all",
                  "border-neutral-200 dark:border-neutral-700",
                  "bg-white dark:bg-neutral-800",
                  "hover:border-green-500 dark:hover:border-green-500",
                  "hover:bg-green-50 dark:hover:bg-green-900/20"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className={cn("text-lg font-semibold mb-1", "text-neutral-900 dark:text-neutral-50")}>
                      {useCase.name}
                    </h3>
                    <p className={cn("text-sm", "text-neutral-600 dark:text-neutral-400")}>
                      {useCase.description}
                    </p>
                  </div>
                  <ArrowRight className={cn("w-5 h-5 flex-shrink-0", "text-neutral-400 dark:text-neutral-500")} />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
