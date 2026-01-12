"use client";

import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Calendar,
  MapPin,
  User,
  Phone,
  Mail,
  Save,
  ArrowRight,
  AlertTriangle,
  Clock,
  Info,
  Thermometer,
  Droplets,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Plus,
  Zap,
  Box,
  Minus,
  Wrench,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  calculateDryingPotential, 
  calculateWaterRemovalTarget, 
  calculateAirMoversRequired,
  calculateTotalVolume,
  type PsychrometricData,
} from "@/lib/psychrometric-calculations";
import {
  lgrDehumidifiers,
  desiccantDehumidifiers,
  airMovers,
  getAllEquipmentGroups,
  getEquipmentGroupById,
  calculateTotalAmps,
  calculateTotalDailyCost,
  calculateTotalCost,
  getEquipmentDailyRate,
  type EquipmentSelection,
  type EquipmentGroup,
} from "@/lib/equipment-matrix";

interface InitialDataEntryFormProps {
  onSuccess?: (reportId: string, reportType?: "basic" | "enhanced") => void;
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
}: InitialDataEntryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  // Update reportId when initialReportId prop changes
  useEffect(() => {
    if (initialReportId) {
      setReportId(initialReportId);
      console.log('[InitialDataEntryForm] ReportId set from prop:', initialReportId);
    }
  }, [initialReportId]);

  // Report Type Selection State
  const [showReportTypeSelection, setShowReportTypeSelection] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<
    "basic" | "enhanced" | "optimised" | null
  >(null);
  
  // Equipment: Psychrometric Assessment
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
  
  // Equipment: Scope Areas
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
  
  // Equipment: Equipment Selection
  const [equipmentSelections, setEquipmentSelections] = useState<
    EquipmentSelection[]
  >([]);
  const [durationDays, setDurationDays] = useState(
    initialData?.estimatedDryingDuration || 4
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
          const config = data.pricingConfig || data;
          if (config) {
            setPricingConfig(config);
          }
        }
      } catch (error) {
        console.error("Error fetching pricing config:", error);
      }
    };
    fetchPricingConfig();
  }, []);

  // Load NIR data and equipment data when reportId is available
  useEffect(() => {
    const loadReportData = async () => {
      if (!reportId) {
        console.log('[InitialDataEntryForm] No reportId, skipping data load');
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
            } else {
              console.log('[InitialDataEntryForm] No moisture readings to load');
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
            } else {
              console.log('[InitialDataEntryForm] No affected areas to load');
            }
            
            // Load scope items
            if (nirData.nirData.scopeItems && Array.isArray(nirData.nirData.scopeItems) && nirData.nirData.scopeItems.length > 0) {
              const selectedItems = new Set<string>(nirData.nirData.scopeItems
                .filter((item: any) => item.isSelected !== false)
                .map((item: any) => (item.itemType || item.id) as string));
              setNirSelectedScopeItems(selectedItems);
            } else {
              console.log('[InitialDataEntryForm] No scope items to load');
            }

          } else {
            console.log('[InitialDataEntryForm] ⚠️ No NIR data in response');
          }
        } else {
          const error = await nirResponse.json();
          console.error('[InitialDataEntryForm] Failed to load NIR data:', error);
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
        console.error('[InitialDataEntryForm] Error loading report data:', error);
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
            console.log('[InitialDataEntryForm] Triggering auto-selection after areas set');
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

      console.log('[InitialDataEntryForm] Calculation results:', {
        totalVolume,
        totalAffectedArea,
        waterRemovalTarget,
        airMoversRequired,
        waterClass: waterClassToUse,
        areasCount: areasToUse.length,
        areasWithValidDimensions: areasToUse.filter(a => a.length > 0 && a.width > 0 && a.height > 0).length
      });

      // Auto-select equipment
      const selections: EquipmentSelection[] = [];
      let remainingCapacity = waterRemovalTarget;
      const lgrGroups = [...lgrDehumidifiers].reverse();
      
      for (const group of lgrGroups) {
        const capacityMatch = group.capacity.match(/(\d+)/);
        if (capacityMatch) {
          const capacity = parseInt(capacityMatch[1]);
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
      }
      
      let remainingAirMovers = airMoversRequired;
      const airMoverGroups = [...airMovers].reverse();
      for (const group of airMoverGroups) {
        if (group.airflow) {
          const needed = Math.ceil(remainingAirMovers / (group.airflow / 1500));
          if (needed > 0) {
            const existing = selections.find((s) => s.groupId === group.id);
            if (existing) {
              existing.quantity += needed;
            } else {
              const rate = getEquipmentDailyRate(group.id, pricingConfig);
              selections.push({
                groupId: group.id,
                quantity: needed,
                dailyRate: rate,
              });
            }
            remainingAirMovers -= (group.airflow / 1500) * needed;
          }
        }
      }
      
      if (selections.length > 0) {
        console.log('[InitialDataEntryForm] Auto-selected equipment:', selections);
        setEquipmentSelections(selections);
        hasAutoSelectedEquipment.current = true;
      } else {
        console.warn('[InitialDataEntryForm] No equipment selected - waterRemovalTarget:', waterRemovalTarget, 'airMoversRequired:', airMoversRequired);
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
    const group = getEquipmentGroupById(sel.groupId);
    if (group && group.airflow) {
      return total + group.airflow * sel.quantity;
    }
    return total;
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
    let remainingCapacity = waterRemovalTarget;
    const lgrGroups = [...lgrDehumidifiers].reverse();
    for (const group of lgrGroups) {
      const capacityMatch = group.capacity.match(/(\d+)/);
      if (capacityMatch) {
        const capacity = parseInt(capacityMatch[1]);
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
    }
    let remainingAirMovers = airMoversRequired;
    const airMoverGroups = [...airMovers].reverse();
    for (const group of airMoverGroups) {
      if (group.airflow) {
        const needed = Math.ceil(remainingAirMovers / (group.airflow / 1500));
        if (needed > 0) {
          const existing = selections.find((s) => s.groupId === group.id);
          if (existing) {
            existing.quantity += needed;
          } else {
            const rate = pricingConfig
              ? getEquipmentDailyRate(group.id, pricingConfig)
              : 0;
            selections.push({
              groupId: group.id,
              quantity: needed,
              dailyRate: rate,
            });
          }
          remainingAirMovers -= (group.airflow / 1500) * needed;
        }
      }
    }
    setEquipmentSelections(selections);
    toast.success("Equipment auto-selected based on targets");
  };

  const handleReportTypeChoice = async (choice: "basic" | "enhanced" | "optimised") => {
    if (!reportId) return;

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
          onSuccess(reportId, choice === "optimised" ? "enhanced" : choice);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update report type");
      }
    } catch (error) {
      console.error("Error updating report type:", error);
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

      // Single API call to save all data
      const response = await fetch("/api/reports/initial-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
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
      console.error("Error saving data:", error);
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

  // Quick Fill with Test Data
  const handleQuickFill = () => {
    // Set form data
    setFormData({
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
    });

    // Set NIR Moisture Readings
    setNirMoistureReadings([
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
    ]);

    // Set NIR Affected Areas
    setNirAffectedAreas([
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
    ]);

    // Set NIR Scope Items
    setNirSelectedScopeItems(new Set([
      "remove_carpet",
      "extract_standing_water",
      "install_dehumidification",
      "install_air_movers",
      "demolish_drywall",
      "apply_antimicrobial",
      "dry_out_structure",
      "containment_setup"
    ]));

    // Set Environmental Data
    setNirEnvironmentalData({
      ambientTemperature: 22,
      humidityLevel: 65,
      dewPoint: 15.2,
      airCirculation: true
    });

    // Set Psychrometric Data (for equipment calculation)
    setWaterClass(2);
    setTemperature(22);
    setHumidity(65);
    setSystemType("closed");

    // Set Scope Areas (for equipment calculation)
    setAreas([
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
    ]);

    // Set Duration Days
    setDurationDays(4);

    // Set Equipment Selections with default rates
    // Rates will be updated from pricing config when it loads
    const defaultEquipmentSelections: EquipmentSelection[] = [
      {
        groupId: "lgr-55",
        quantity: 2,
        dailyRate: 45.00 // Default rate, will update when pricing config loads
      },
      {
        groupId: "airmover-800",
        quantity: 4,
        dailyRate: 25.00 // Default rate, will update when pricing config loads
      }
    ];
    setEquipmentSelections(defaultEquipmentSelections);

    // Update equipment rates when pricing config is available
    if (pricingConfig) {
      const updatedSelections = defaultEquipmentSelections.map(sel => ({
        ...sel,
        dailyRate: getEquipmentDailyRate(sel.groupId, pricingConfig)
      }));
      setEquipmentSelections(updatedSelections);
    }

    toast.success("Form filled with test data including equipment selections");
  };

  return (
    <div className="max-w-full mx-auto">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
        <h2 className="text-2xl font-semibold mb-2">Initial Data Entry</h2>
        <p className="text-slate-400">
              Enter the basic information from the technician's field report. All
              fields marked with * are required.
            </p>
          </div>
          <button
            type="button"
            onClick={handleQuickFill}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium whitespace-nowrap"
          >
            <Zap className="w-4 h-4" />
            Quick Fill Test Data
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Client Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Client Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) =>
                  handleInputChange("clientName", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Enter client's full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Client Contact Details
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.clientContactDetails}
                  onChange={(e) =>
                    handleInputChange("clientContactDetails", e.target.value)
                  }
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  placeholder="Phone number, email, etc."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Property Information Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Property Information
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Property Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.propertyAddress}
                onChange={(e) =>
                  handleInputChange("propertyAddress", e.target.value)
                }
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Full property address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Postcode <span className="text-red-400">*</span>
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
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="0000"
              />
              <p className="text-xs text-slate-400 mt-1">
                Required for state detection and regulatory compliance
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Property ID
                </label>
                <input
                  type="text"
                  value={formData.propertyId}
                  onChange={(e) =>
                    handleInputChange("propertyId", e.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  placeholder="Property identifier"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Job Number
                </label>
                <input
                  type="text"
                  value={formData.jobNumber}
                  onChange={(e) =>
                    handleInputChange("jobNumber", e.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  placeholder="Job number"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Building Age
                </label>
                <input
                  type="text"
                  value={formData.buildingAge}
                  onChange={(e) =>
                    handleInputChange("buildingAge", e.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  placeholder="e.g., 2010 or 1985"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Structure Type
                </label>
                <select
                  value={formData.structureType}
                  onChange={(e) =>
                    handleInputChange("structureType", e.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
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
              <label className="block text-sm font-medium mb-2">
                Access Notes
              </label>
              <textarea
                value={formData.accessNotes}
                onChange={(e) =>
                  handleInputChange("accessNotes", e.target.value)
                }
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                placeholder="Key under mat, owner present, gate code, etc."
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Claim Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Claim Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Claim Reference Number
              </label>
              <input
                type="text"
                value={formData.claimReferenceNumber}
                onChange={(e) =>
                  handleInputChange("claimReferenceNumber", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Claim reference"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Insurer / Client Name
              </label>
              <input
                type="text"
                value={formData.insurerName}
                onChange={(e) =>
                  handleInputChange("insurerName", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Insurance company"
              />
            </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Date of Incident
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.incidentDate}
                  onChange={(e) =>
                    handleInputChange("incidentDate", e.target.value)
                  }
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
                </div>
              </div>

              <div>
              <label className="block text-sm font-medium mb-1">
                  Technician Attendance Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={formData.technicianAttendanceDate}
                  onChange={(e) =>
                    handleInputChange(
                      "technicianAttendanceDate",
                      e.target.value
                    )
                  }
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                  />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">
                Technician Name
              </label>
              <input
                type="text"
                value={formData.technicianName}
                onChange={(e) =>
                  handleInputChange("technicianName", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="Name of technician who attended"
              />
            </div>
          </div>
        </div>

        {/* Cover Page Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Cover Page Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Report Instructions / Standards References
              </label>
              <textarea
                value={formData.reportInstructions}
                onChange={(e) =>
                  handleInputChange("reportInstructions", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                placeholder="e.g., Provide a restoration inspection report per IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000. Provide recommendations to ensure longevity."
                rows={3}
              />
              <p className="text-xs text-slate-400 mt-1">
                This will appear on the cover page of the report
              </p>
            </div>
          </div>
        </div>

        {/* Additional Contact Information Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Additional Contact Information
          </h3>
          <div className="space-y-4">
            {/* Builder/Developer Information */}
            <div className="p-3 rounded-lg border border-slate-600/50 bg-slate-900/30">
              <h4 className="text-sm font-semibold mb-3 text-slate-300">
                Builder/Developer Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.builderDeveloperCompanyName}
                    onChange={(e) =>
                      handleInputChange("builderDeveloperCompanyName", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Builder/Developer company name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.builderDeveloperContact}
                    onChange={(e) =>
                      handleInputChange("builderDeveloperContact", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Contact person name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formData.builderDeveloperAddress}
                    onChange={(e) =>
                      handleInputChange("builderDeveloperAddress", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Builder/Developer address"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={formData.builderDeveloperPhone}
                    onChange={(e) =>
                      handleInputChange("builderDeveloperPhone", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </div>

            {/* Owner/Management Information */}
            <div className="p-3 rounded-lg border border-slate-600/50 bg-slate-900/30">
              <h4 className="text-sm font-semibold mb-3 text-slate-300">
                Owner/Management Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.ownerManagementContactName}
                    onChange={(e) =>
                      handleInputChange("ownerManagementContactName", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Owner/Management contact name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={formData.ownerManagementPhone}
                    onChange={(e) =>
                      handleInputChange("ownerManagementPhone", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-slate-400">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.ownerManagementEmail}
                    onChange={(e) =>
                      handleInputChange("ownerManagementEmail", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                    placeholder="Email address"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Previous Maintenance & Repair History Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Previous Maintenance & Repair History
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Date of Last Inspection
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={formData.lastInspectionDate}
                  onChange={(e) =>
                    handleInputChange("lastInspectionDate", e.target.value)
                  }
                  className="w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Was building changed since last inspection?
                </label>
                <select
                  value={formData.buildingChangedSinceLastInspection}
                  onChange={(e) =>
                    handleInputChange("buildingChangedSinceLastInspection", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Were there changes/additions to structure since last inspection?
                </label>
                <select
                  value={formData.structureChangesSinceLastInspection}
                  onChange={(e) =>
                    handleInputChange("structureChangesSinceLastInspection", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Was there any leakage?
                </label>
                <select
                  value={formData.previousLeakage}
                  onChange={(e) =>
                    handleInputChange("previousLeakage", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Was emergency repair performed?
                </label>
                <select
                  value={formData.emergencyRepairPerformed}
                  onChange={(e) =>
                    handleInputChange("emergencyRepairPerformed", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Technician Field Report Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Technician Field Report
          </h3>

          <div>
            <label className="block text-sm font-medium mb-1">
              Technician's Field Report <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              value={formData.technicianFieldReport}
              onChange={(e) =>
                handleInputChange("technicianFieldReport", e.target.value)
              }
              rows={6}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono text-sm"
              placeholder="Paste or type the technician's field report here..."
            />
          </div>
        </div>

        {/* NIR Fields - Available for all report types */}
        <div className="p-6 rounded-lg border border-green-500/50 bg-green-500/10 space-y-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-green-400">
            <CheckCircle className="w-5 h-5" />
            NIR Inspection Data
          </h3>
          <p className="text-sm text-slate-300 mb-4">
            Enter structured inspection data. The system will automatically
            classify and determine scope.
          </p>

          {/* Moisture Readings */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <Droplets className="w-4 h-4" />
              Moisture Readings <span className="text-red-400">*</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3 p-3 bg-slate-900/50 rounded-lg">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                  placeholder="Room/Zone"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                >
                  {SURFACE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
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
                  className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex items-center justify-center gap-1"
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
                    className="flex items-center justify-between p-2 bg-slate-900/50 rounded text-xs"
                  >
                    <span className="text-white">
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
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Affected Areas */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <MapPin className="w-4 h-4" />
              Affected Areas <span className="text-red-400">*</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3 p-3 bg-slate-900/50 rounded-lg">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                  placeholder="e.g., Master Bedroom"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
                >
                  {WATER_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-400">
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
                  className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-white text-xs"
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
                  className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex items-center justify-center gap-1"
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
                    className="flex items-center justify-between p-2 bg-slate-900/50 rounded text-xs"
                  >
                    <span className="text-white">
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
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scope Items */}
          <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <CheckCircle className="w-4 h-4" />
              Scope Items
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SCOPE_ITEM_TYPES.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-slate-900/50 rounded text-xs cursor-pointer hover:bg-slate-900/70"
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
                    className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-white">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

        </div>

        {/* Hazard Profile Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Hazard Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Methamphetamine Screen
              </label>
              <select
                value={formData.methamphetamineScreen}
                onChange={(e) =>
                  handleInputChange("methamphetamineScreen", e.target.value)
                }
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
              >
                <option value="NEGATIVE">NEGATIVE</option>
                <option value="POSITIVE">POSITIVE</option>
              </select>
            </div>

            {formData.methamphetamineScreen === "POSITIVE" && (
              <div>
                <label className="block text-sm font-medium mb-1">
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
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
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
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                Bio/Mould Detected
              </label>
            </div>

            {formData.biologicalMouldDetected && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mould Category
                </label>
                <select
                  value={formData.biologicalMouldCategory}
                  onChange={(e) =>
                    handleInputChange("biologicalMouldCategory", e.target.value)
                  }
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
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

        {/* Timeline Estimation Section */}
        <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-800/30">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timeline Estimation (Optional)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Phase 1 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">
                Phase 1: Make-safe
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Start
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1StartDate}
                      onChange={(e) =>
                        handleInputChange("phase1StartDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
            />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase1EndDate}
                      onChange={(e) =>
                        handleInputChange("phase1EndDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 2 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">
                Phase 2: Remediation/Drying
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Start
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2StartDate}
                      onChange={(e) =>
                        handleInputChange("phase2StartDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase2EndDate}
                      onChange={(e) =>
                        handleInputChange("phase2EndDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 3 */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-slate-300">
                Phase 3: Verification
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Start
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3StartDate}
                      onChange={(e) =>
                        handleInputChange("phase3StartDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">End</label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="date"
                      value={formData.phase3EndDate}
                      onChange={(e) =>
                        handleInputChange("phase3EndDate", e.target.value)
                      }
                      className="w-full pl-8 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Equipment & Tools Selection Section */}
        <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-6">
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
                  <p className="text-sm text-slate-300">
                    Understand the 'Energy' in the air. Temperature and Humidity
                    determine if the air acts like a 'Thirsty Sponge' (Good) or
                    a 'Saturated Sponge' (Bad).
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-900/30">
                <h4 className="text-lg font-semibold mb-4">Water Loss Class</h4>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[1, 2, 3, 4].map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setWaterClass(cls as 1 | 2 | 3 | 4)}
                      className={`px-4 py-2 rounded-lg border transition-colors ${
                        waterClass === cls
                          ? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
                          : "border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mb-6">
                  Class 1 (Least water) to Class 4 (Bound water/Deep saturation)
                </p>
                
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Thermometer className="w-5 h-5 text-orange-400" />
                      <label className="font-medium">
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
                      <Droplets className="w-5 h-5 text-blue-400" />
                      <label className="font-medium">
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
                  <Zap className="w-8 h-8 text-red-400" />
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
                <p className="text-sm text-slate-300 text-center">
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
                  <p className="text-sm text-slate-300">
                    Use 'Auto-Select Best Fit' to instantly load standard
                    equipment, or manually select items.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-900/30">
                <h4 className="text-lg font-semibold mb-2">Job Manifest</h4>
                <div className="p-4 bg-slate-800/50 rounded-lg mb-4">
                  <h5 className="font-semibold mb-3">Efficiency Targets</h5>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Water Removal</span>
                        <span>
                          {totalEquipmentCapacity} / {waterRemovalTarget} L/Day
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              (totalEquipmentCapacity / waterRemovalTarget) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Air Movement</span>
                        <span>
                          {Math.round(totalAirflow / 1500)} /{" "}
                          {airMoversRequired} Units
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-cyan-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              (totalAirflow / 1500 / airMoversRequired) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <h5 className="font-semibold mb-3">ESTIMATED CONSUMPTION</h5>
                  <div className="text-2xl font-bold mb-2">
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
                      className="w-20 px-2 py-1 bg-slate-700/50 border border-slate-600 rounded text-sm"
                    />
                    <span className="text-sm">Days</span>
                  </div>
                  <div className="text-sm text-slate-400">
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
                
                <div className="p-4 rounded-lg border border-slate-700/50 bg-slate-900/30 max-h-96 overflow-y-auto">
                  <h5 className="font-semibold mb-3">LGR DEHUMIDIFIERS</h5>
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
                              : "border-slate-700 bg-slate-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {group.capacity}
                              </div>
                              <div className="text-xs text-slate-400">
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
                              <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-semibold mr-2">
                                {quantity}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleEquipmentQuantityChange(group.id, -1)
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleEquipmentQuantityChange(group.id, 1)
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <h5 className="font-semibold mb-3 mt-4">AIR MOVERS</h5>
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
                              : "border-slate-700 bg-slate-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {group.capacity}
                              </div>
                              <div className="text-xs text-slate-400">
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
                              <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-semibold mr-2">
                                {quantity}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleEquipmentQuantityChange(group.id, -1)
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group"
                                title="Decrease quantity"
                              >
                                <Minus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleEquipmentQuantityChange(group.id, 1)
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group"
                                title="Increase quantity"
                              >
                                <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
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

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:border-slate-500 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                <span>Save & Continue</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </button>
                </div>
      </form>

      {/* Report Type Selection - Appears after saving (outside form) */}
      {showReportTypeSelection && (
        <div className="p-6 rounded-lg border-2 border-cyan-500/50 bg-cyan-500/10 space-y-6 mt-6">
          <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            Select Report Type
          </h3>
          <p className="text-slate-400 mb-6">
            Choose the level of detail for your inspection report. Data has been saved successfully.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
              <button
                type="button"
              onClick={() => handleReportTypeChoice("basic")}
              disabled={loading}
                className="p-6 rounded-lg border-2 border-slate-600 hover:border-blue-500 bg-slate-800/30 hover:bg-slate-800/50 transition-all duration-200 text-left group disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-blue-500/20"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                      <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                    <h4 className="text-xl font-semibold text-white">
                      Basic
                    </h4>
                      <p className="text-sm text-slate-400">Quick Processing</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-all duration-200 group-hover:translate-x-1 group-hover:scale-110" />
                </div>
              <p className="text-slate-300 mb-4 text-sm">
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
                    className="flex items-center gap-2 text-sm text-slate-400"
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
              disabled={loading}
                className="p-6 rounded-lg border-2 border-cyan-500 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all duration-200 text-left group relative disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-cyan-500/30"
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
                    <h4 className="text-xl font-semibold text-white">
                      Enhanced
                    </h4>
                    <p className="text-sm text-cyan-400">Basic + Tier 1</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300 transition-all duration-200 group-hover:translate-x-1 group-hover:scale-110" />
                </div>
              <p className="text-slate-300 mb-4 text-sm">
                Answer Tier 1 critical questions, then generate report
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
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                      <CheckCircle className="w-4 h-4 text-cyan-400" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>

          <button
            type="button"
              onClick={() => handleReportTypeChoice("optimised")}
            disabled={loading}
              className="p-6 rounded-lg border-2 border-green-500 bg-gradient-to-br from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 transition-all duration-200 text-left group relative disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-green-500/30"
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
                    <h4 className="text-xl font-semibold text-white">
                      Optimised
                    </h4>
                    <p className="text-sm text-green-400">Enhanced + Tier 2 + Tier 3</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-green-400 group-hover:text-green-300 transition-all duration-200 group-hover:translate-x-1 group-hover:scale-110" />
              </div>
              <p className="text-slate-300 mb-4 text-sm">
                Complete all tiers including photo uploads, then generate report
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
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
          </button>
        </div>
    </div>
      )}
    </div>
  );
}
