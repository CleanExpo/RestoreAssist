/**
 * Default form template definitions for interviews.
 * Used by seed script and POST /api/form-templates/seed.
 */

export const DEFAULT_FORM_TEMPLATES = [
  {
    name: "Water Damage Inspection Form",
    formType: "WORK_ORDER" as const,
    category: "JOB_DOCUMENTATION" as const,
    description: "Comprehensive water damage inspection form with IICRC S500 compliance. Includes property details, environmental data, moisture readings, affected areas, and equipment recommendations.",
    formSchema: JSON.stringify({
      sections: [
        { id: "property", title: "Property Information", fields: [
          { id: "propertyAddress", type: "text", label: "Property Address", required: true },
          { id: "propertyPostcode", type: "text", label: "Postcode", required: true },
          { id: "propertyType", type: "select", label: "Property Type", options: ["Residential", "Commercial", "Industrial"] },
          { id: "yearBuilt", type: "number", label: "Year Built" },
        ]},
        { id: "environmental", title: "Environmental Data", fields: [
          { id: "ambientTemperature", type: "number", label: "Ambient Temperature (°F)", required: true },
          { id: "humidityLevel", type: "number", label: "Humidity Level (%)", required: true },
          { id: "dewPoint", type: "number", label: "Dew Point (°F)" },
          { id: "airCirculation", type: "boolean", label: "Air Circulation Available" },
        ]},
        { id: "moisture", title: "Moisture Readings", fields: [{ id: "readings", type: "array", label: "Moisture Readings", itemType: "object" }]},
        { id: "affectedAreas", title: "Affected Areas", fields: [{ id: "areas", type: "array", label: "Affected Areas", itemType: "object" }]},
        { id: "equipment", title: "Equipment Recommendations", fields: [{ id: "equipment", type: "array", label: "Equipment", itemType: "object" }]},
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: false,
    signatureConfig: null as string | null,
  },
  {
    name: "Fire Damage Assessment Form",
    formType: "WORK_ORDER" as const,
    category: "JOB_DOCUMENTATION" as const,
    description: "Fire damage assessment form for documenting fire damage restoration work. Includes smoke damage assessment, soot patterns, and restoration scope.",
    formSchema: JSON.stringify({
      sections: [
        { id: "property", title: "Property Information", fields: [
          { id: "propertyAddress", type: "text", label: "Property Address", required: true },
          { id: "propertyPostcode", type: "text", label: "Postcode", required: true },
          { id: "fireOrigin", type: "text", label: "Fire Origin Location" },
          { id: "fireDate", type: "date", label: "Fire Date" },
        ]},
        { id: "damage", title: "Damage Assessment", fields: [
          { id: "smokeDamage", type: "boolean", label: "Smoke Damage Present" },
          { id: "sootPatterns", type: "text", label: "Soot Patterns Description" },
          { id: "affectedRooms", type: "array", label: "Affected Rooms", itemType: "string" },
        ]},
        { id: "restoration", title: "Restoration Scope", fields: [
          { id: "scope", type: "textarea", label: "Restoration Scope", required: true },
          { id: "estimatedCost", type: "number", label: "Estimated Cost" },
        ]}
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: false,
    signatureConfig: null as string | null,
  },
  {
    name: "Mould Remediation Form",
    formType: "WORK_ORDER" as const,
    category: "SAFETY" as const,
    description: "Mould remediation form for documenting mould inspection and remediation work. Includes containment setup, remediation procedures, and post-remediation verification.",
    formSchema: JSON.stringify({
      sections: [
        { id: "property", title: "Property Information", fields: [
          { id: "propertyAddress", type: "text", label: "Property Address", required: true },
          { id: "propertyPostcode", type: "text", label: "Postcode", required: true },
          { id: "mouldType", type: "select", label: "Mould Type", options: ["Stachybotrys", "Aspergillus", "Penicillium", "Other"] },
        ]},
        { id: "inspection", title: "Mould Inspection", fields: [
          { id: "mouldLocation", type: "text", label: "Mould Location", required: true },
          { id: "extent", type: "select", label: "Extent", options: ["Small (<10 sq ft)", "Medium (10-100 sq ft)", "Large (>100 sq ft)"] },
          { id: "moistureSource", type: "text", label: "Moisture Source" },
        ]},
        { id: "remediation", title: "Remediation Plan", fields: [
          { id: "containment", type: "boolean", label: "Containment Required" },
          { id: "remediationMethod", type: "textarea", label: "Remediation Method", required: true },
          { id: "safetyMeasures", type: "textarea", label: "Safety Measures" },
        ]}
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: false,
    signatureConfig: null as string | null,
  },
  {
    name: "Job Safety Analysis (JSA)",
    formType: "JSA" as const,
    category: "SAFETY" as const,
    description: "Job Safety Analysis form for documenting safety hazards and controls for restoration work. Required for high-risk jobs.",
    formSchema: JSON.stringify({
      sections: [
        { id: "job", title: "Job Information", fields: [
          { id: "jobDescription", type: "textarea", label: "Job Description", required: true },
          { id: "location", type: "text", label: "Job Location", required: true },
          { id: "supervisor", type: "text", label: "Supervisor Name" },
        ]},
        { id: "hazards", title: "Hazards Identification", fields: [{ id: "hazards", type: "array", label: "Hazards", itemType: "object" }]},
        { id: "controls", title: "Control Measures", fields: [{ id: "controls", type: "array", label: "Control Measures", itemType: "object" }]},
        { id: "ppe", title: "Personal Protective Equipment", fields: [
          { id: "requiredPPE", type: "multiselect", label: "Required PPE", options: ["Hard Hat", "Safety Glasses", "Gloves", "Respirator", "Safety Boots"] },
        ]}
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: true,
    signatureConfig: JSON.stringify({ requiredSignatories: ["TECHNICIAN", "SUPERVISOR"], signatureType: "DIGITAL_CANVAS" }),
  },
  {
    name: "Site Induction Form",
    formType: "SITE_INDUCTION" as const,
    category: "SAFETY" as const,
    description: "Site induction form for new workers entering a restoration site. Documents safety briefings and site-specific hazards.",
    formSchema: JSON.stringify({
      sections: [
        { id: "worker", title: "Worker Information", fields: [
          { id: "workerName", type: "text", label: "Worker Name", required: true },
          { id: "company", type: "text", label: "Company" },
          { id: "inductionDate", type: "date", label: "Induction Date", required: true },
        ]},
        { id: "site", title: "Site Information", fields: [
          { id: "siteAddress", type: "text", label: "Site Address", required: true },
          { id: "siteHazards", type: "textarea", label: "Site-Specific Hazards" },
          { id: "emergencyProcedures", type: "textarea", label: "Emergency Procedures" },
        ]},
        { id: "acknowledgment", title: "Acknowledgment", fields: [
          { id: "understood", type: "boolean", label: "I understand the site hazards and procedures", required: true },
        ]}
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: true,
    signatureConfig: JSON.stringify({ requiredSignatories: ["TECHNICIAN"], signatureType: "DIGITAL_CANVAS" }),
  },
  {
    name: "Client Intake Form",
    formType: "CUSTOM" as const,
    category: "CLIENT_INTAKE" as const,
    description: "Standard client intake form for gathering initial information about the client and their restoration needs.",
    formSchema: JSON.stringify({
      sections: [
        { id: "client", title: "Client Information", fields: [
          { id: "clientName", type: "text", label: "Client Name", required: true },
          { id: "clientEmail", type: "email", label: "Email", required: true },
          { id: "clientPhone", type: "tel", label: "Phone", required: true },
          { id: "clientAddress", type: "text", label: "Address" },
        ]},
        { id: "incident", title: "Incident Information", fields: [
          { id: "incidentType", type: "select", label: "Incident Type", options: ["Water Damage", "Fire Damage", "Storm Damage", "Mould", "Other"], required: true },
          { id: "incidentDate", type: "date", label: "Incident Date" },
          { id: "incidentDescription", type: "textarea", label: "Description" },
        ]},
        { id: "insurance", title: "Insurance Information", fields: [
          { id: "hasInsurance", type: "boolean", label: "Has Insurance" },
          { id: "insuranceCompany", type: "text", label: "Insurance Company" },
          { id: "claimNumber", type: "text", label: "Claim Number" },
        ]}
      ]
    }),
    status: "PUBLISHED" as const,
    requiresSignatures: false,
    signatureConfig: null as string | null,
  },
]
