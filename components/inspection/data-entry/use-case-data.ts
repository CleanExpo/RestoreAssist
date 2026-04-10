/**
 * Quick Fill use case data for the InitialDataEntryForm.
 *
 * Contains sample data for testing different water damage scenarios:
 * - Residential Water Damage (Category 1)
 * - Commercial Water Damage (Category 2)
 * - Mould Remediation (Category 3)
 * - Storm Damage - Roof Leak
 * - Flood Damage - Category 3
 */

import type { FormData } from "./types";
import type { EquipmentSelection } from "@/lib/equipment-matrix";

export interface UseCaseData {
  id: string;
  name: string;
  description: string;
  formData: FormData;
  nirMoistureReadings: Array<{
    id: string;
    location: string;
    surfaceType: string;
    moistureLevel: number;
    depth: "Surface" | "Subsurface";
  }>;
  nirAffectedAreas: Array<{
    id: string;
    roomZoneId: string;
    affectedSquareFootage: number;
    waterSource: string;
    timeSinceLoss: number;
  }>;
  nirSelectedScopeItems: Set<string>;
  nirEnvironmentalData: {
    ambientTemperature: number;
    humidityLevel: number;
    dewPoint: number;
    airCirculation: boolean;
  };
  waterClass: 1 | 2 | 3 | 4;
  temperature: number;
  humidity: number;
  systemType: "open" | "closed";
  areas: Array<{
    id: string;
    name: string;
    length: number;
    width: number;
    height: number;
    wetPercentage: number;
  }>;
  durationDays: number;
  equipmentSelections: EquipmentSelection[];
}

export function getUseCases(): UseCaseData[] {
  return [
    {
      id: "residential-water-damage",
      name: "Residential Water Damage",
      description:
        "Standard residential water damage scenario with burst pipe in master bedroom and ensuite",
      formData: {
        clientName: "ABC Co.",
        clientContactDetails:
          "John Smith - 0401 987 654 - john.smith@abcco.com.au",
        propertyAddress: "123 Main Street, Suburb, NSW 2000",
        propertyPostcode: "2000",
        claimReferenceNumber: "CLM-2024-001234",
        incidentDate: "2024-01-15",
        technicianAttendanceDate: "2024-01-16",
        technicianName: "Mark O'Connor",
        technicianFieldReport:
          "Attended site at 10:00 AM. Found significant water damage in master bedroom and ensuite. Water source appears to be burst pipe in wall cavity. Moisture readings elevated throughout affected areas. Immediate extraction required. Containment set up to prevent cross-contamination.",
        buildingAge: "2010",
        structureType: "Residential - Two Storey",
        accessNotes: "Key under mat, owner present during inspection",
        propertyId: "PROP-2024-001",
        jobNumber: "JOB-2024-056",
        reportInstructions:
          "Provide a restoration inspection report per IICRC S500, S520, WHS Regulations 2011, NCC, and AS/NZS 3000. Provide recommendations to ensure longevity.",
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
          depth: "Surface",
        },
        {
          id: "2",
          location: "Master Bedroom - Wall",
          surfaceType: "Drywall",
          moistureLevel: 38.2,
          depth: "Subsurface",
        },
        {
          id: "3",
          location: "Ensuite - Floor",
          surfaceType: "Tile",
          moistureLevel: 52.1,
          depth: "Surface",
        },
        {
          id: "4",
          location: "Ensuite - Wall",
          surfaceType: "Drywall",
          moistureLevel: 41.8,
          depth: "Subsurface",
        },
        {
          id: "5",
          location: "Hallway - Floor",
          surfaceType: "Hardwood",
          moistureLevel: 28.5,
          depth: "Surface",
        },
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Master Bedroom",
          affectedSquareFootage: 180,
          waterSource: "Clean Water",
          timeSinceLoss: 24,
        },
        {
          id: "2",
          roomZoneId: "Ensuite",
          affectedSquareFootage: 45,
          waterSource: "Clean Water",
          timeSinceLoss: 24,
        },
        {
          id: "3",
          roomZoneId: "Hallway",
          affectedSquareFootage: 30,
          waterSource: "Clean Water",
          timeSinceLoss: 24,
        },
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
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 22,
        humidityLevel: 65,
        dewPoint: 15.2,
        airCirculation: true,
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
          wetPercentage: 75,
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Ensuite",
          length: 3.0,
          width: 2.5,
          height: 2.4,
          wetPercentage: 90,
        },
        {
          id: `area-${Date.now()}-3`,
          name: "Hallway",
          length: 4.0,
          width: 1.2,
          height: 2.7,
          wetPercentage: 50,
        },
      ],
      durationDays: 4,
      equipmentSelections: [
        {
          groupId: "lgr-55",
          quantity: 2,
          dailyRate: 45.0,
        },
        {
          groupId: "airmover-800",
          quantity: 4,
          dailyRate: 25.0,
        },
      ],
    },
    {
      id: "commercial-water-damage",
      name: "Commercial Water Damage",
      description:
        "Large-scale commercial office water damage from HVAC system failure affecting multiple floors",
      formData: {
        clientName: "TechCorp Industries",
        clientContactDetails:
          "Sarah Williams - 0412 345 678 - s.williams@techcorp.com.au",
        propertyAddress: "456 Business Park Drive, Melbourne VIC 3000",
        propertyPostcode: "3000",
        claimReferenceNumber: "CLM-2024-002456",
        incidentDate: "2024-02-10",
        technicianAttendanceDate: "2024-02-10",
        technicianName: "David Chen",
        technicianFieldReport:
          "Attended commercial office building at 2:00 PM. HVAC system failure on 3rd floor caused significant water damage across multiple floors. Water cascaded through ceiling tiles affecting office spaces, server room, and common areas. Immediate containment and extraction required. Multiple tenants affected.",
        buildingAge: "2005",
        structureType: "Commercial - Multi-Storey",
        accessNotes:
          "Building manager on site, security access required, elevator to 3rd floor",
        propertyId: "PROP-2024-002",
        jobNumber: "JOB-2024-089",
        reportInstructions:
          "Provide comprehensive commercial restoration report per IICRC S500, AS/NZS 3000, NCC, and WHS Regulations. Include business interruption assessment.",
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
          depth: "Subsurface",
        },
        {
          id: "2",
          location: "3rd Floor - Server Room - Floor",
          surfaceType: "Concrete",
          moistureLevel: 42.1,
          depth: "Surface",
        },
        {
          id: "3",
          location: "2nd Floor - Office Area - Wall",
          surfaceType: "Drywall",
          moistureLevel: 35.7,
          depth: "Subsurface",
        },
        {
          id: "4",
          location: "2nd Floor - Common Area - Floor",
          surfaceType: "Carpet",
          moistureLevel: 48.9,
          depth: "Surface",
        },
        {
          id: "5",
          location: "1st Floor - Reception - Wall",
          surfaceType: "Drywall",
          moistureLevel: 29.4,
          depth: "Subsurface",
        },
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "3rd Floor - Office Area",
          affectedSquareFootage: 450,
          waterSource: "Clean Water",
          timeSinceLoss: 12,
        },
        {
          id: "2",
          roomZoneId: "3rd Floor - Server Room",
          affectedSquareFootage: 120,
          waterSource: "Clean Water",
          timeSinceLoss: 12,
        },
        {
          id: "3",
          roomZoneId: "2nd Floor - Office Area",
          affectedSquareFootage: 380,
          waterSource: "Clean Water",
          timeSinceLoss: 14,
        },
      ],
      nirSelectedScopeItems: new Set([
        "extract_standing_water",
        "install_dehumidification",
        "install_air_movers",
        "demolish_drywall",
        "apply_antimicrobial",
        "dry_out_structure",
        "containment_setup",
        "ppe_required",
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 24,
        humidityLevel: 70,
        dewPoint: 18.1,
        airCirculation: false,
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
          wetPercentage: 80,
        },
        {
          id: `area-${Date.now()}-2`,
          name: "3rd Floor - Server Room",
          length: 8.0,
          width: 5.0,
          height: 3.0,
          wetPercentage: 60,
        },
        {
          id: `area-${Date.now()}-3`,
          name: "2nd Floor - Office Area",
          length: 12.0,
          width: 10.0,
          height: 3.0,
          wetPercentage: 70,
        },
      ],
      durationDays: 7,
      equipmentSelections: [
        {
          groupId: "lgr-70",
          quantity: 3,
          dailyRate: 55.0,
        },
        {
          groupId: "airmover-1200",
          quantity: 8,
          dailyRate: 30.0,
        },
      ],
    },
    {
      id: "mould-remediation",
      name: "Mould Remediation",
      description:
        "Residential property with extensive mould growth due to long-term moisture issues",
      formData: {
        clientName: "Smith Family Trust",
        clientContactDetails: "Robert Smith - 0400 123 456 - r.smith@email.com",
        propertyAddress: "789 Oak Street, Brisbane QLD 4000",
        propertyPostcode: "4000",
        claimReferenceNumber: "CLM-2024-003789",
        incidentDate: "2024-01-05",
        technicianAttendanceDate: "2024-01-08",
        technicianName: "Emma Thompson",
        technicianFieldReport:
          "Attended property at 9:30 AM. Extensive mould growth detected throughout bathroom, laundry, and adjacent bedroom areas. Mould appears to be Category 2, affecting porous materials. Root cause: long-term moisture from leaking shower and poor ventilation. Immediate containment and remediation required. Occupants advised to vacate affected areas.",
        buildingAge: "1995",
        structureType: "Residential - Single Storey",
        accessNotes: "Owner present, keys provided, pet dog secured",
        propertyId: "PROP-2024-003",
        jobNumber: "JOB-2024-112",
        reportInstructions:
          "Provide mould remediation report per IICRC S520, AS/NZS 3000, and WHS Regulations. Include health and safety recommendations.",
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
          depth: "Subsurface",
        },
        {
          id: "2",
          location: "Bathroom - Ceiling",
          surfaceType: "Plaster",
          moistureLevel: 55.8,
          depth: "Subsurface",
        },
        {
          id: "3",
          location: "Laundry - Wall",
          surfaceType: "Drywall",
          moistureLevel: 48.2,
          depth: "Subsurface",
        },
        {
          id: "4",
          location: "Bedroom - Wall Adjacent to Bathroom",
          surfaceType: "Drywall",
          moistureLevel: 41.6,
          depth: "Subsurface",
        },
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Bathroom",
          affectedSquareFootage: 65,
          waterSource: "Grey Water",
          timeSinceLoss: 720,
        },
        {
          id: "2",
          roomZoneId: "Laundry",
          affectedSquareFootage: 45,
          waterSource: "Grey Water",
          timeSinceLoss: 720,
        },
        {
          id: "3",
          roomZoneId: "Bedroom",
          affectedSquareFootage: 120,
          waterSource: "Grey Water",
          timeSinceLoss: 720,
        },
      ],
      nirSelectedScopeItems: new Set([
        "demolish_drywall",
        "apply_antimicrobial",
        "containment_setup",
        "ppe_required",
        "sanitize_materials",
        "dry_out_structure",
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 26,
        humidityLevel: 75,
        dewPoint: 21.2,
        airCirculation: false,
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
          wetPercentage: 90,
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Laundry",
          length: 3.0,
          width: 2.0,
          height: 2.4,
          wetPercentage: 70,
        },
        {
          id: `area-${Date.now()}-3`,
          name: "Bedroom",
          length: 4.5,
          width: 3.5,
          height: 2.7,
          wetPercentage: 40,
        },
      ],
      durationDays: 10,
      equipmentSelections: [
        {
          groupId: "desiccant-150",
          quantity: 2,
          dailyRate: 85.0,
        },
        {
          groupId: "airmover-800",
          quantity: 6,
          dailyRate: 25.0,
        },
      ],
    },
    {
      id: "storm-damage",
      name: "Storm Damage - Roof Leak",
      description:
        "Residential property with water damage from severe storm causing roof penetration",
      formData: {
        clientName: "Johnson Residence",
        clientContactDetails:
          "Patricia Johnson - 0423 456 789 - p.johnson@email.com",
        propertyAddress: "321 Weather Street, Sydney NSW 2000",
        propertyPostcode: "2000",
        claimReferenceNumber: "CLM-2024-004123",
        incidentDate: "2024-03-15",
        technicianAttendanceDate: "2024-03-16",
        technicianName: "Michael Brown",
        technicianFieldReport:
          "Attended property at 11:00 AM following severe storm event. Roof penetration identified in attic space above living room. Water has entered through damaged roof tiles and affected ceiling, walls, and flooring in living area. Storm water contamination present. Immediate tarping and extraction required.",
        buildingAge: "1988",
        structureType: "Residential - Two Storey",
        accessNotes: "Owner present, ladder access to roof required",
        propertyId: "PROP-2024-004",
        jobNumber: "JOB-2024-145",
        reportInstructions:
          "Provide storm damage assessment report per IICRC S500, NCC, and AS/NZS 3000. Include structural assessment recommendations.",
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
          depth: "Subsurface",
        },
        {
          id: "2",
          location: "Living Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 59.1,
          depth: "Subsurface",
        },
        {
          id: "3",
          location: "Living Room - Floor",
          surfaceType: "Hardwood",
          moistureLevel: 44.7,
          depth: "Surface",
        },
        {
          id: "4",
          location: "Attic - Floor Joists",
          surfaceType: "Wood",
          moistureLevel: 72.5,
          depth: "Subsurface",
        },
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Living Room",
          affectedSquareFootage: 250,
          waterSource: "Grey Water",
          timeSinceLoss: 18,
        },
        {
          id: "2",
          roomZoneId: "Attic Space",
          affectedSquareFootage: 180,
          waterSource: "Grey Water",
          timeSinceLoss: 18,
        },
      ],
      nirSelectedScopeItems: new Set([
        "extract_standing_water",
        "install_dehumidification",
        "install_air_movers",
        "demolish_drywall",
        "apply_antimicrobial",
        "dry_out_structure",
        "containment_setup",
        "ppe_required",
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 20,
        humidityLevel: 68,
        dewPoint: 14.0,
        airCirculation: true,
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
          wetPercentage: 85,
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Attic Space",
          length: 8.0,
          width: 6.0,
          height: 2.4,
          wetPercentage: 60,
        },
      ],
      durationDays: 6,
      equipmentSelections: [
        {
          groupId: "lgr-55",
          quantity: 3,
          dailyRate: 45.0,
        },
        {
          groupId: "airmover-800",
          quantity: 5,
          dailyRate: 25.0,
        },
      ],
    },
    {
      id: "flood-damage",
      name: "Flood Damage - Category 3",
      description:
        "Severe flood damage from overflowing river affecting ground floor of residential property",
      formData: {
        clientName: "River View Properties",
        clientContactDetails: "Jennifer Lee - 0434 567 890 - j.lee@email.com",
        propertyAddress: "555 Riverside Drive, Adelaide SA 5000",
        propertyPostcode: "5000",
        claimReferenceNumber: "CLM-2024-005456",
        incidentDate: "2024-02-28",
        technicianAttendanceDate: "2024-03-01",
        technicianName: "Thomas Wilson",
        technicianFieldReport:
          "Attended property at 8:00 AM. Severe flood damage from river overflow. Ground floor completely inundated with contaminated water (Category 3). Water level reached 1.2 metres. Extensive damage to all ground floor areas including kitchen, dining, family room, and garage. Sewage contamination confirmed. Immediate evacuation and extensive remediation required.",
        buildingAge: "2015",
        structureType: "Residential - Two Storey",
        accessNotes:
          "Property accessible, water receded, safety assessment completed",
        propertyId: "PROP-2024-005",
        jobNumber: "JOB-2024-178",
        reportInstructions:
          "Provide comprehensive flood damage report per IICRC S500, WHS Regulations, and AS/NZS 3000. Include health and safety protocols for Category 3 water.",
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
          depth: "Subsurface",
        },
        {
          id: "2",
          location: "Family Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 71.2,
          depth: "Subsurface",
        },
        {
          id: "3",
          location: "Garage - Floor",
          surfaceType: "Concrete",
          moistureLevel: 65.8,
          depth: "Surface",
        },
        {
          id: "4",
          location: "Dining Room - Wall",
          surfaceType: "Drywall",
          moistureLevel: 69.4,
          depth: "Subsurface",
        },
        {
          id: "5",
          location: "Kitchen - Cabinets",
          surfaceType: "Particle Board",
          moistureLevel: 73.1,
          depth: "Subsurface",
        },
      ],
      nirAffectedAreas: [
        {
          id: "1",
          roomZoneId: "Kitchen",
          affectedSquareFootage: 180,
          waterSource: "Black Water",
          timeSinceLoss: 48,
        },
        {
          id: "2",
          roomZoneId: "Family Room",
          affectedSquareFootage: 320,
          waterSource: "Black Water",
          timeSinceLoss: 48,
        },
        {
          id: "3",
          roomZoneId: "Dining Room",
          affectedSquareFootage: 150,
          waterSource: "Black Water",
          timeSinceLoss: 48,
        },
        {
          id: "4",
          roomZoneId: "Garage",
          affectedSquareFootage: 280,
          waterSource: "Black Water",
          timeSinceLoss: 48,
        },
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
        "sanitize_materials",
      ]),
      nirEnvironmentalData: {
        ambientTemperature: 18,
        humidityLevel: 80,
        dewPoint: 14.6,
        airCirculation: false,
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
          wetPercentage: 100,
        },
        {
          id: `area-${Date.now()}-2`,
          name: "Family Room",
          length: 8.0,
          width: 6.0,
          height: 2.7,
          wetPercentage: 100,
        },
        {
          id: `area-${Date.now()}-3`,
          name: "Dining Room",
          length: 5.5,
          width: 4.5,
          height: 2.7,
          wetPercentage: 100,
        },
        {
          id: `area-${Date.now()}-4`,
          name: "Garage",
          length: 7.0,
          width: 6.0,
          height: 2.7,
          wetPercentage: 90,
        },
      ],
      durationDays: 14,
      equipmentSelections: [
        {
          groupId: "desiccant-150",
          quantity: 4,
          dailyRate: 85.0,
        },
        {
          groupId: "lgr-70",
          quantity: 2,
          dailyRate: 55.0,
        },
        {
          groupId: "airmover-1200",
          quantity: 10,
          dailyRate: 30.0,
        },
      ],
    },
  ];
}
