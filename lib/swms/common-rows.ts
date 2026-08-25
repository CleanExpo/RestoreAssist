/**
 * Risk-table rows shared across every activity SWMS.
 *
 * The seven Disaster Recovery QLD source documents repeat an identical opening
 * and closing sequence around each activity's own operation rows. They are
 * defined once here so a correction lands in every template at the same time —
 * on paper, fixing a control measure meant editing seven Word files and hoping.
 *
 * Rows that genuinely differ between documents (Planning, Assessment of site,
 * Isolate the work area) are NOT here; each template carries its own, because
 * flattening them would silently drop controls the source documents added for a
 * reason — the demolition assessment row requires low-voltage tools, the
 * decontamination isolation row requires an exclusion zone.
 */
import type { SwmsRiskRow } from "./activity-swms-types";

/**
 * Standard pre-start review.
 *
 * Consolidated from the seven source variants, which differ only in which
 * equipment checks they enumerate. The superset is used so that no source
 * document's control is dropped by the consolidation.
 */
export const PLANNING_AND_PREPARATION: SwmsRiskRow = {
  activity: "Planning, Preparation, Operational Checks",
  equipment: [],
  hazards: [
    "Fatigue and stress",
    "Drugs and alcohol",
    "Use of mobile phone",
    "Slips, trips and falls",
    "Manual handling injuries",
    "Electric shock",
    "Moving parts",
    "Cuts and lacerations",
    "Impact and puncture wounds",
    "Entanglement",
    "Eye injury",
    "Noise",
    "Temperature",
    "Lighting",
    "Dust",
    "Insufficient ventilation",
    "Ultraviolet radiation (UVR)",
  ],
  riskBefore: 5,
  controls: [
    {
      heading: "General",
      items: [
        "Work must stop immediately if an incident or near miss occurs. The SWMS must be amended in consultation with the relevant persons.",
        "If equipment is deemed unsafe to use it must be taken out of service and a DO NOT OPERATE tag placed on the ON/START switch to prevent further use until it is repaired or replaced.",
        "If you are suffering from fatigue, or are under the influence of drugs or alcohol, DO NOT operate any equipment or undertake any high-risk activity.",
        "For equipment used, read the instruction manual and operate in accordance with the manufacturer's instructions.",
        "If you do not understand the operating instructions, DO NOT use the equipment until you have been properly instructed in its use.",
      ],
    },
    {
      heading: "Review the TASK",
      items: [
        "Have you done this task before? Otherwise refer to the instruction manual or ask for assistance.",
        "Does it involve sustained or awkward posture?",
        "Does it involve repetitive movement?",
      ],
    },
    {
      heading: "Check YOURSELF",
      items: [
        "Are you competent and physically able to carry out this task?",
        "Long hair and long beards should be contained.",
        "Avoid wearing loose clothing and jewellery.",
        "Always have plenty of drinking water.",
      ],
    },
    {
      heading: "Check the EQUIPMENT",
      items: [
        "Establish periodic inspections and ensure an inspection is conducted annually.",
        "Select the appropriate equipment for the task.",
        "Locate and ensure you are familiar with all operations and controls.",
        "Ensure all guards are fitted, secure and functional. Do not operate if guards are missing or faulty.",
        "Check the machine, equipment, power cord and plug are in good order.",
        "Identify the ON/OFF switch and check that the equipment is working correctly.",
      ],
    },
    {
      heading: "Check the ENVIRONMENT",
      items: [
        "Prepare your workplace and the materials you are about to use.",
        "Are there any hazards overhead?",
        "Ensure the floor surface is clean and dry and the area is free of any other hazards.",
        "Make sure other people are not too close to you; if necessary, use barriers and signage.",
        "Always organise your workspace and keep it clean and tidy.",
      ],
    },
    {
      heading: "Check the Personal Protective Equipment (PPE)",
      items: [
        "Do you know what PPE is required?",
        "Ensure PPE listed on this SWMS is worn and used correctly.",
      ],
    },
  ],
  riskAfter: 3,
  responsible: "All",
};

/**
 * Vehicle arrival and parking. Identical in five of the seven source
 * documents; decontamination and truck-mount extraction carry their own
 * (contamination-zone parking and exhaust-fume positioning respectively).
 */
export const ARRIVE_AT_SITE: SwmsRiskRow = {
  activity: "Arrive at site",
  equipment: [],
  hazards: ["Vehicle accident"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Park in a position that will allow safe access to your vehicle and reduce unnecessary manual handling.",
        "Ensure that your vehicle does not restrict traffic or pedestrian flow.",
        "Park off the street or in the customer's drive where permitted.",
        "Avoid parking on hills or steep drives.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/** Site induction. Identical in all seven source documents. */
export const INDUCTION: SwmsRiskRow = {
  activity: "Induction",
  equipment: [],
  hazards: ["Unknown site hazards", "Hazardous chemicals"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Where available, attend a site-specific induction (usually commercial premises).",
        "Ensure you have risk assessed this SWMS and have a copy with you on site for reference.",
        "Complete pre-start inspections and identify any risks not listed in this SWMS.",
        "Identify the state or territory legislation that applies at this address and ensure you are working to the current instrument for that jurisdiction.",
        "Ensure you have all Safety Data Sheets relevant to the chemicals on board, whether or not they are used on site (current SDS, no more than five years old).",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/** Manual handling. Identical in all seven source documents. */
export const MANUAL_HANDLING: SwmsRiskRow = {
  activity: "Manual handling",
  equipment: [],
  hazards: ["Manual handling injuries"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Use mechanical aids where available.",
        "Provide adequate numbers of trained staff to allow rotation.",
        "Ensure new workers are supervised adequately.",
      ],
    },
    {
      heading: "Use correct lifting techniques as per manual handling training",
      items: [
        "Stand close to the load with feet apart for good balance, one foot beside the object and one behind it.",
        "Bend your knees, keeping your back as straight as possible.",
        "Ensure a comfortable grip of the object.",
        "Lift gradually - straighten your knees and stand.",
        "Ensure the object does not obscure your vision.",
        "Avoid twisting your body - move your feet instead.",
        "Ensure your feet and body face the spot the object is to be placed.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/**
 * Electrical tooling. Identical in the six source documents that carry it;
 * decontamination has no power-tool row.
 *
 * DELIBERATE DEVIATION FROM SOURCE. All four source documents cite "AS3750 and
 * AS3017" for test-and-tag. AS 3750 is the paints-for-steel-structures series
 * and AS/NZS 3017 is verification guidelines, neither of which governs
 * in-service testing of portable equipment. The instruments that do are
 * AS/NZS 3760 (in-service safety inspection and testing of electrical
 * equipment) and AS/NZS 3012 (electrical installations - construction and
 * demolition sites). The citation is corrected here rather than carried across,
 * and the deviation is recorded in docs/swms/activity-swms-templates.md so it
 * is visible to whoever reconciles these against the paper originals.
 */
export const USE_OF_POWER_TOOLS: SwmsRiskRow = {
  activity: "Use of power tools",
  equipment: [],
  hazards: ["Electrical shock", "Trips and falls"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "All electrical equipment must be electrically tested and tagged by a qualified technician or testing body in accordance with AS/NZS 3760 and AS/NZS 3012. Portable tools should be tested and tagged every three to six months.",
        "Where possible, cordless tools are to be used, removing the need for extension leads.",
        "Extension leads in use MUST also be tested and tagged, and must be connected to a circuit protected by an RCD with a maximum trip current of 30 mA.",
        "All leads are to be run in a manner that limits trip hazards.",
        "Leads are not to be run in wet or damp areas.",
        "The correct electrical equipment is to be used for the job, and used per the manufacturer's operating instructions.",
        "Appropriate PPE is to be worn for the power tool being used, including but not limited to eye protection and hearing protection in accordance with AS/NZS 1269 Occupational Noise Management.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/**
 * Pack-down. Identical in three source documents (carpet removal, floor
 * removal, fire and smoke cleaning). Decontamination and the two water
 * extraction documents carry their own machine-specific versions, and the
 * demolition document has no pack-down row at all.
 */
export const CLEANING_AND_MAINTENANCE: SwmsRiskRow = {
  activity: "Cleaning and maintenance",
  equipment: [],
  hazards: [
    "Fatigue and stress",
    "Drugs and alcohol",
    "Use of mobile phone",
    "Slips, trips and falls",
    "Manual handling injuries",
    "Cuts and lacerations",
  ],
  riskBefore: 3,
  controls: [
    {
      items: [
        "If damage to equipment is detected, do not use it until repairs have been carried out and it has been deemed safe for use.",
        "Do not undertake any repairs or modifications unless you are trained and authorised to do so.",
        "Refer to Safety Data Sheets for all hazardous chemicals used, identifying what precautions should be followed and what PPE is required.",
        "Ensure all cleaning equipment is cleaned, dried and stored correctly.",
        "Hazardous chemicals must be stored in a secure location.",
      ],
    },
  ],
  riskAfter: 1,
  responsible: "All",
};

/**
 * Emergency preparedness. The control measures are identical across all seven
 * source documents. The equipment and hazard columns are the superset: the two
 * water extraction documents omit "Fire equipment", "Fire" and "Burns", which
 * is an omission rather than a considered exclusion on a job involving a
 * petrol engine and hot water.
 */
export const EMERGENCY_PROCEDURES: SwmsRiskRow = {
  activity: "Emergency procedures",
  equipment: [
    "Fire wardens",
    "Fire equipment",
    "First aid supplies",
    "First aider",
    "Incident report",
  ],
  hazards: [
    "Fire",
    "Burns",
    "Unsafe scene",
    "Exposure to blood",
    "Exposed hazards",
  ],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Have a clear understanding of how to evacuate the premises in the event of an emergency.",
        "Know where the nearest firefighting equipment is located.",
        "Know where your first aid supplies are located and check they are fully stocked.",
        "Know who your qualified first aiders are and how to contact them in an emergency.",
        "Report all incidents, near misses or known hazards to the site supervisor as soon as possible.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/** Site departure. Identical in all seven source documents. */
export const LEAVING_THE_WORK_SITE: SwmsRiskRow = {
  activity: "Leaving the work site",
  equipment: [],
  hazards: ["Fire hazards", "Slips, trips and falls", "Traffic hazard"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Ensure the area is clean, tidy and safe, with no sharp objects, trip or slip hazards, or fire hazards remaining.",
        "Sign out of the contractors register and inform the site supervisor that you are leaving.",
        "Ask the site supervisor to inspect your work site to confirm it has been left in a satisfactory state.",
        "Ensure tools and load on the work vehicle are packed away safely.",
        "Always maintain PPE.",
        "If necessary, collect your traffic and pedestrian control devices.",
        "Never drive faster than walking pace on site.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

/**
 * Site access and egress housekeeping. Present only in the two water
 * extraction documents, identically.
 */
export const SLIPS_TRIPS_AND_FALLS: SwmsRiskRow = {
  activity: "Slips, trips and falls",
  equipment: [],
  hazards: [
    "Cuts, abrasions and breaks",
    "Strains and sprains",
    "Back injury",
    "Access and egress",
  ],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Erect warning signs to alert people to the work being carried out and the associated risks.",
        "Restrict access to the work area to those involved in the work activity.",
        "Where pedestrian access is restricted, provide safe and adequate marked walkways.",
        "Where possible, ask the client or tenant to vacate the property to allow unrestricted movement during work activities.",
        "Carry out basic housekeeping regularly, keeping access ways and the work area clear of materials, tools and debris.",
        "Allow enough time for workers to carry out site safety tasks.",
        "Make sure paths are level, with no ridges, potholes or moss growing on them.",
        "Make sure cable stands used to keep leads and cords above ground do not present a trip hazard.",
        "Carry manageable loads so as not to overbalance.",
        "Allow workers plenty of time to carry out all tasks so they do not have to hurry.",
        "Make sure boots have plenty of grip, are not too worn, and are free of dirt built up in the tread.",
        "On completion of works, carry and place all previously relocated objects in their original location.",
        "Pick up all off-cuts, debris and rubbish and place them in the skip bin or trailer provided.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};
