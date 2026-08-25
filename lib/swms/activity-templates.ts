/**
 * The seven activity SWMS templates.
 *
 * Transcribed from the Disaster Recovery QLD C4.1 SWMS documents supplied by
 * the founder (revision codes `swm*092022sk`, reviewed 30/07/2024 by Jye
 * Diesing). Each template is the job-independent body of one SWMS: the risk
 * table, tools, PPE and training. The job-specific header - PCBU, project,
 * workers, signatures - is supplied at compose time by `buildActivitySwms`.
 *
 * DELIBERATELY NOT INCLUDED: "Working at Heights". The supplied
 * `Jye SWMS Working at heights signed.pdf` is an image-only scan with no text
 * layer - `pdfjs-dist` extracted zero characters from all twelve pages - so
 * there was nothing to transcribe. It needs OCR or the source Word document
 * before it can be added, and an invented heights SWMS is worse than none.
 *
 * Two classes of change were made against the source documents, both
 * deliberate and both recorded in docs/swms/activity-swms-templates.md:
 *
 *   1. Jurisdictional citations are resolved from `lib/state-detection.ts` at
 *      compose time rather than transcribed. See `jurisdiction-reference.ts`.
 *   2. The test-and-tag standard citation is corrected. See
 *      `USE_OF_POWER_TOOLS` in `common-rows.ts`.
 *
 * Everything else is the source documents' own control text, lightly
 * normalised to Australian spelling and sentence case.
 */
import type {
  SwmsActivityId,
  SwmsActivityTemplate,
  SwmsPpeItem,
  SwmsRiskRow,
} from "./activity-swms-types";
import {
  ARRIVE_AT_SITE,
  CLEANING_AND_MAINTENANCE,
  EMERGENCY_PROCEDURES,
  INDUCTION,
  LEAVING_THE_WORK_SITE,
  MANUAL_HANDLING,
  PLANNING_AND_PREPARATION,
  SLIPS_TRIPS_AND_FALLS,
  USE_OF_POWER_TOOLS,
} from "./common-rows";

const STANDARD_SCOPE =
  "The purpose of this SWMS is to highlight specific guidelines which must be " +
  "followed when conducting the above task. If this instruction does not cover " +
  "the specific task required, a risk assessment shall be completed to assess " +
  "any additional hazards.";

const INSPECT_BEFORE_USE = "Inspect before use";
const ppe = (...items: string[]): SwmsPpeItem[] =>
  items.map((item) => ({ item, inspection: INSPECT_BEFORE_USE }));

/** Training named across every source document's training block. */
const BASE_TRAINING = [
  "Manual handling",
  "Use and maintenance of PPE",
  "Isolation and work permits",
];

const TAKE_5 = {
  heading: "Apply the Take 5 guide",
  items: [
    "Stop and think.",
    "Look for hazards.",
    "Assess the risk.",
    "Make the changes.",
    "Do the job safely.",
  ],
};

// ── Assessment-of-site variants ────────────────────────────────────────────

const ASSESSMENT_BASIC: SwmsRiskRow = {
  activity: "Assessment of site",
  equipment: [],
  hazards: ["Unknown hazards"],
  riskBefore: 5,
  controls: [
    TAKE_5,
    {
      items: [
        "Determine a safe route to access and move through the area.",
        "Take effective steps to avoid meeting any of these dangers.",
        "Avoid overhead power lines.",
      ],
    },
  ],
  riskAfter: 3,
  responsible: "All",
};

const ASSESSMENT_ELECTRICAL: SwmsRiskRow = {
  activity: "Assessment of site",
  equipment: [],
  hazards: ["Unknown hazards"],
  riskBefore: 5,
  controls: [
    TAKE_5,
    {
      items: [
        "Determine a safe route to access the area and identify a work area.",
        "Take effective steps to avoid meeting any of these dangers.",
        "Use low voltage for tools and equipment, that is, battery-operated tools.",
        "If mains voltage must be used, ensure devices are protected by residual current devices (RCDs).",
        "Workers must inspect all tools and equipment before use.",
        "Check that cables and leads are protected from damage.",
      ],
    },
  ],
  riskAfter: 3,
  responsible: "All",
};

// ── Isolate-the-work-area variants ─────────────────────────────────────────

const ISOLATE_STANDARD: SwmsRiskRow = {
  activity: "Isolate the work area",
  equipment: [],
  hazards: ["Unauthorised access"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Ensure a barrier or cordon is used to separate the work area from the public.",
        "Check that no equipment or materials can fall onto any pedestrians or vehicles.",
        "When work is complete for the day, ensure all ladders are removed or rungs boarded so they cannot be used.",
        "When work is complete for the day, ensure all plant and equipment is immobilised to prevent unauthorised use.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

const ISOLATE_WET_WORK: SwmsRiskRow = {
  activity: "Isolate the work area",
  equipment: [],
  hazards: ["Unauthorised access"],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Ensure a barrier or cordon is used to separate the work area from the public.",
        "Place wet floor signs and hazard tape around areas where works are being carried out.",
        "Check that no equipment or materials can fall onto any pedestrians or vehicles.",
        "When work is complete for the day, ensure all plant and equipment is immobilised to prevent unauthorised use.",
        "When work is complete for the day, ensure all hazardous chemicals are locked away in a secure place.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

// ── 1. Carpet removal ──────────────────────────────────────────────────────

const CARPET_REMOVAL: SwmsActivityTemplate = {
  id: "carpet-removal",
  title: "Carpet Removal",
  sourceRevision: "swmcr092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [
    "Dust mask",
    "Knee pads",
    "Locking pliers",
    "Pry bar",
    "Safety glasses",
    "Utility knife",
  ],
  ppe: ppe(
    "Safety footwear",
    "Eye protection",
    "Gloves",
    "Mask or respirator",
    "Appropriate clothing",
  ),
  trainingRequired: BASE_TRAINING,
  rows: [
    PLANNING_AND_PREPARATION,
    ARRIVE_AT_SITE,
    INDUCTION,
    ASSESSMENT_BASIC,
    ISOLATE_STANDARD,
    {
      activity: "Operation - carpet and underlay removal",
      equipment: [],
      hazards: [
        "Slips, trips and falls",
        "Manual handling injuries",
        "Cuts and lacerations",
        "Impact and puncture wounds",
        "Eye injury",
        "Dust and fibres",
        "Insufficient ventilation",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Step 1 - pull up the carpet",
          items: [
            "Start by cutting a strip 4 cm wide and 1 m long in one corner of the carpet. Use a flat head screwdriver and a wrecking bar to gently prise the strip off the tacks underneath.",
            "When you can reach under the carpet, pull up the whole corner, then follow the edge around, pulling the carpet up and rolling it into the centre of the room.",
            "Cut strips of carpet into smaller sections and roll them up for easier removal.",
            "Once the carpet is all up, get a couple of people to help you take it out.",
          ],
        },
        {
          heading: "Step 2 - remove the underlay",
          items: [
            "Once the carpet is out of the way, pull up the underlay from the edges and roll it into the middle of the room.",
            "Use a pair of pliers to pull out the staples that hold the underlay to the floor.",
            "You will need help from a couple of people to carry the underlay out.",
          ],
        },
        {
          heading: "Safety precautions",
          items: [
            "Carpets may trap pollutants including dust mites, pet dander, cockroach allergens, particle pollution, lead, mould spores, pesticides, dirt and dust. Chemicals used in some new carpets, carpet pads and installation adhesives can harm your health.",
            "Wear correct PPE. Gloves must be long-arm gloves if long-sleeved overalls are not worn. Also required: dust mask or respirator, safety glasses, overalls and safety shoes.",
            "Minimise the release of dust by carefully rolling up carpet and underlay. Where possible, lightly wet the material before and during removal.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    CLEANING_AND_MAINTENANCE,
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── 2. Floor removal ───────────────────────────────────────────────────────

const FLOOR_REMOVAL: SwmsActivityTemplate = {
  id: "floor-removal",
  title: "Floor Removal",
  sourceRevision: "swmfr092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [
    "Dust mask",
    "Safety glasses",
    "Utility knife",
    "Hammer",
    "Scraper",
    "Chisel",
    "Bully flooring scraper",
    "Toe kick saw",
  ],
  ppe: ppe(
    "Dust mask",
    "Eye protection",
    "Gloves",
    "Safety footwear",
    "Appropriate clothing",
  ),
  trainingRequired: BASE_TRAINING,
  rows: [
    PLANNING_AND_PREPARATION,
    ARRIVE_AT_SITE,
    INDUCTION,
    ASSESSMENT_ELECTRICAL,
    ISOLATE_WET_WORK,
    {
      activity: "Operation - floor covering removal",
      equipment: [],
      hazards: [
        "Slips, trips and falls",
        "Manual handling injuries",
        "Electric shock",
        "Cuts and lacerations",
        "Impact and puncture wounds",
        "Eye injury",
        "Noise",
        "Dust and fibres",
        "Insufficient ventilation",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Removing floorboards",
          items: [
            "Your approach depends on whether the planks are to be reused.",
            "If the boards are not being salvaged, use a circular saw to cut lines perpendicular to the direction the wood runs, forming sections one to two feet wide that can be prised up with a pry bar and mallet.",
            "After prising up all planks, use a nail claw and curved vice grips to pull out the staples remaining in the subfloor, then use a large magnet to collect them.",
            "If salvaging the planks, prise each board up about 6 mm along its whole length, then repeat, rather than lifting one section at once - lifting too much at once splits the board or damages the tongue.",
          ],
        },
        {
          heading: "Removing tiles",
          items: [
            "A hammer, chisel, pry bar or pole scraper is needed to lift the tiles.",
            "Detach the first tile to make a starting point and continue prising from there.",
            "Once all tiles are up, remove any underlayment to reach the subfloor.",
            "At subfloor level, remove all exposed nails and clean up all debris.",
          ],
        },
        {
          heading: "Removing vinyl flooring",
          items: [
            "Vinyl on a plywood subfloor can either be scraped off with its glue, or cut out together with the subfloor as one piece.",
            "To scrape: cut the vinyl into six-inch parallel strips with a utility knife, break it loose with a putty knife or brick chisel tapped with a hammer, pull up the strips, then remove the glue with a paint scraper.",
            "A heat gun softens the glue; mineral spirits soften tar-based adhesive.",
            "To remove subfloor and flooring together: drill a hole to determine the floor thickness, set the saw blade 3 mm deeper than that, cut into sections roughly one metre (three to four feet) long, and use a reciprocating saw flush with the walls while avoiding the floor joists.",
          ],
        },
        {
          heading: "Safety precautions",
          items: [
            "Removing wood and tile flooring produces dust that becomes airborne immediately and spreads through the building. A dust mask must be worn at all times while removing flooring.",
            "Keep removed layers of flooring out of the work area to avoid slips, trips and falls.",
            "If using chemicals to remove glue, read the Safety Data Sheet for each product and follow the instructions.",
            "Wear correct PPE: gloves, dust mask or respirator, safety glasses, overalls and safety shoes.",
            "Minimise the release of dust by protecting and, where possible, sealing off the remaining areas.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    CLEANING_AND_MAINTENANCE,
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── 3. Demolition - non-structural ─────────────────────────────────────────

const DEMOLITION_NON_STRUCTURAL: SwmsActivityTemplate = {
  id: "demolition-non-structural",
  title: "Demolition - Non-Structural",
  sourceRevision: "swmdns092022sk",
  scope: STANDARD_SCOPE,
  // The source document reproduces the full statutory HRCW list as a checklist
  // to be ticked per job. Whether a box is ticked is not recoverable from the
  // PDF text layer, so these are categories TO BE ASSESSED before the job
  // starts, never categories that apply. See the field's doc comment.
  hrcwCategoriesToAssess: [
    "Risk of a person falling more than 2 metres",
    "Demolition of a load-bearing structure",
    "Likely to involve disturbing asbestos",
    "Temporary load-bearing support for structural alterations or repairs",
    "Work in or near a confined space",
    "Work in or near a shaft or trench deeper than 1.5 m, or a tunnel",
    "Work on or near pressurised gas mains or piping",
    "Work on or near chemical, fuel or refrigerant lines",
    "Work on or near energised electrical installations or services",
    "Work in an area that may have a contaminated or flammable atmosphere",
    "Work in an area with movement of powered mobile plant",
    "Work in areas with artificial extremes of temperature",
    "Work on, in or adjacent to a road, railway, shipping lane or other traffic corridor in use by traffic other than pedestrians",
  ],
  requiredTools: [],
  ppe: ppe(
    "Dust mask",
    "Eye protection",
    "Gloves",
    "Ear protection",
    "Appropriate clothing",
    "Safety footwear",
  ),
  trainingRequired: [...BASE_TRAINING, "Asbestos awareness"],
  rows: [
    PLANNING_AND_PREPARATION,
    ARRIVE_AT_SITE,
    INDUCTION,
    {
      activity: "Assessment of site",
      equipment: [],
      hazards: ["Unknown hazards"],
      riskBefore: 5,
      controls: [
        TAKE_5,
        {
          items: [
            "Determine a safe route to access and move through the area.",
            "Use low voltage tools.",
            "Workers must inspect all tools and equipment before use.",
            "Take effective steps to avoid meeting any of these dangers.",
          ],
        },
      ],
      riskAfter: 3,
      responsible: "All",
    },
    {
      activity: "Isolate the work area",
      equipment: [],
      hazards: ["Unauthorised access"],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Ensure a barrier or cordon is used to separate the work area from the public.",
            "Check that no equipment or materials can fall onto any persons.",
            "When work is complete for the day, ensure all ladders are removed or rungs boarded so they cannot be used.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Safety checks first",
      equipment: [],
      hazards: [
        "Dust, including asbestos - respiratory disease and eye injuries",
        "Electrocution from contact with live wires; severe burns, possibly fatal",
      ],
      riskBefore: 5,
      controls: [
        {
          items: [
            "Ensure all electrical isolation has been completed prior to commencement.",
            "Ensure all plumbing in wet areas has been capped off.",
            "Asbestos testing has been performed to confirm there is no risk of asbestos on site.",
            "Confirm the correct disposal procedure for all waste from the areas.",
          ],
        },
      ],
      riskAfter: 3,
      responsible: "All",
    },
    {
      activity: "Operation - check existing structures and plan the work",
      equipment: [],
      hazards: ["Structural collapse", "Subsidence", "Falling objects"],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Plan the procedure prior to commencement, identifying any risks or hazards.",
            "Ensure nearby footings, slabs, walls or other existing structures will not be damaged by the demolition works.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Demolishing the interior and cabinetry",
      equipment: [],
      hazards: [
        "Inadvertent structural collapse",
        "Falling objects",
        "Slips, trips and falls",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Consider all job steps involved and, where possible, position equipment so it does not obscure the work area or create blind spots.",
            "Restrict access to the work area to those involved in the activity and keep it clear at all times.",
            "Establish exclusion zones and keep unauthorised people outside areas that could be affected by rebounding material.",
            "High visibility clothing is to be worn on site at all times. Maintain good communication at all times.",
            "Demolish the structure systematically and progressively, starting from the top - generally, structures should be demolished in the reverse order to which they were constructed.",
            "No wall, chimney or other structure or part of a structure is to be left unattended or unsupported in a condition where it may collapse.",
            "When demolishing vertical features such as columns or walls, they should not be left so high as to create a risk of debris falling onto the operator.",
            "Walls must not be laterally loaded by accumulated rubble or debris to the extent that they are in danger of collapse.",
            "Remove excess debris immediately away from workers to prevent slips, trips and falls.",
            "Minimise the generation of dust and clean work areas properly during and after work.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    {
      activity: "Removal of debris",
      equipment: [],
      hazards: [
        "Falling objects",
        "Noise and entanglement",
        "Dust - eye or respiratory injury",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Debris should be progressively removed to prevent any build-up that could affect other workers.",
            "Demolished materials must not be allowed to fall freely unless confined to a chute.",
            "Debris drop zones should be clearly identified, and where there is a risk of an object striking workers the area should be fenced, or a large skip bin used to remove debris.",
            "Once demolition is complete, ensure the skip bin is covered before removal from site.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── 4. Fire and smoke cleaning ─────────────────────────────────────────────

const FIRE_SMOKE_CLEANING: SwmsActivityTemplate = {
  id: "fire-smoke-cleaning",
  title: "Fire and Smoke Cleaning",
  sourceRevision: "swmfasc092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [],
  ppe: ppe(
    "High visibility vest",
    "Eye protection",
    "Gloves",
    "Ear protection",
    "Mask or respirator",
    "Safety footwear",
    "Appropriate clothing",
  ),
  trainingRequired: [...BASE_TRAINING, "Hazardous chemical handling"],
  rows: [
    {
      ...PLANNING_AND_PREPARATION,
      hazards: [
        ...PLANNING_AND_PREPARATION.hazards,
        "Corrosive materials",
        "Carcinogenic residue",
        "Air quality",
      ],
    },
    ARRIVE_AT_SITE,
    INDUCTION,
    {
      ...ASSESSMENT_ELECTRICAL,
      controls: [
        TAKE_5,
        {
          items: [
            "Determine a safe route to access the area and identify a work area.",
            "Identify existing services present on site, such as electrical cables and gas mains.",
            "Take effective steps to avoid meeting any of these dangers.",
            "Use low voltage for tools and equipment, that is, battery-operated tools.",
            "If mains voltage must be used, ensure devices are protected by residual current devices (RCDs).",
            "Workers must inspect all tools and equipment before use.",
            "Check that cables and leads are protected from damage.",
          ],
        },
      ],
    },
    ISOLATE_STANDARD,
    {
      activity: "Operation - internal and external wall cleaning",
      equipment: [],
      hazards: [
        "Slips, trips and falls",
        "Manual handling injuries",
        "Cuts and lacerations",
        "Dust and fibres",
        "Insufficient ventilation",
        "Corrosive materials",
        "Carcinogenic residue",
        "Air quality",
        "Toxic gases",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Pre-operation procedures",
          items: [
            "Before restoration work can begin, individuals trained in spotting and mitigating further damage and injury must inspect the area. Confirm there is no structural damage or risk before operational procedures start.",
            "Assess the extent of damage to determine what can be salvaged.",
            "Test rooms for smoke and soot damage and for air quality.",
            "Check for any water damage.",
            "Plan the restoration process.",
            "Advise the supervisor or assistant personnel when entering the site, give an estimated time on the work, and notify them on exiting.",
            "The supervisor or assistant personnel must monitor the length of time spent on site and, if it is exceeded, check that the worker is safe.",
          ],
        },
        {
          heading: "Safety precautions",
          items: [
            "Stay away from downed power lines, which can conduct electricity through the nearby ground, smoke particles or water.",
            "Turn off power at the main breaker or fuse of the service panel and do not turn it back on until electrical equipment has been inspected and cleared.",
            "Do not use electrical equipment that has been exposed to heat from fire until it has been checked by an electrician.",
            "Never operate petrol-powered equipment indoors - it is nearly impossible to tell whether ventilation is sufficient or whether deadly carbon monoxide is in the air.",
            "Avoid back injuries when lifting or moving objects by hand. Use teams of two or more for bulky objects and automated lifting devices for heavier objects.",
            "Do not work around any fire-damaged structure until it has been examined and certified safe for work by a registered engineer or architect.",
            "Leave the structure immediately if it shifts, or if unusual noises signal a possible collapse.",
            "Never enter a confined space unless you have been properly trained - many toxic gases and vapours cannot be seen or smelled.",
          ],
        },
        {
          heading: "Internal cleaning",
          items: [
            "Wet wash walls with soot-neutralising chemicals.",
            "Chemical sponge down ceilings.",
            "Clean all mounted light fixtures and fans.",
            "Wet wash all aluminium window and door frames, and clean all doors.",
            "HEPA vacuum all loose particles.",
            "Clean tile and grout, and clean walls internally.",
            "Clean all metal surfaces and benchtops.",
            "Clean the range hood, stovetop and oven.",
            "Chemically clean all basins, bathtubs and tapware, and clean mirrors.",
            "Clean cabinets both internally and externally.",
          ],
        },
        {
          heading: "Exterior cleaning",
          items: [
            "Pressure wash eaves.",
            "Pressure wash exterior flooring - pavers, timber decking, concrete and tile.",
            "Wash all windows, window frames, screens and doors.",
            "Pressure or media blast exterior brickwork to eliminate soot.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Chemicals used in cleaning fire and smoke damage",
      equipment: [],
      hazards: [
        "Hazardous chemical",
        "Insufficient ventilation",
        "Eye injury",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Refer to Safety Data Sheets for all hazardous chemicals used, identifying the precautions to be followed and the PPE required.",
          ],
        },
        {
          heading: "All containers must be labelled with",
          items: [
            "The name of the chemical.",
            "The concentration strength of the chemical.",
            "Hazard information, such as skin irritation, and emergency information - for example, how to treat exposure if the chemical gets in the eyes.",
          ],
        },
        {
          heading: "Handling",
          items: [
            "Follow safe handling instructions and identify the PPE to be used while handling the chemical.",
            "Observe instructions regarding the mixing of chemicals.",
            "Avoid direct contact with any chemical.",
            "Always wash yourself thoroughly after handling chemicals.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    CLEANING_AND_MAINTENANCE,
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── 5. Decontamination work ────────────────────────────────────────────────

const DECONTAMINATION: SwmsActivityTemplate = {
  id: "decontamination",
  title: "Decontamination Work",
  sourceRevision: "swmdw092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [],
  ppe: ppe(
    "Disposable clothing",
    "Eye protection",
    "Gloves",
    "Safety footwear",
    "Appropriate clothing",
  ),
  trainingRequired: [
    ...BASE_TRAINING,
    "Disinfection and decontamination procedures",
    "Hazardous chemical handling",
  ],
  rows: [
    {
      ...PLANNING_AND_PREPARATION,
      hazards: [
        ...PLANNING_AND_PREPARATION.hazards,
        "Torn, punctured or perished protective clothing, equipment or materials",
      ],
    },
    {
      ...ARRIVE_AT_SITE,
      controls: [
        {
          items: [
            "Park in a position that will allow safe access to your vehicle and reduce unnecessary manual handling.",
            "Ensure that your vehicle does not restrict traffic or pedestrian flow.",
            "Park all vehicles out of the contamination zone where possible.",
            "Ensure no one enters or works within the area without full suitable PPE being worn or used.",
          ],
        },
      ],
    },
    INDUCTION,
    {
      activity: "Assessment of site",
      equipment: [],
      hazards: ["Unknown hazards"],
      riskBefore: 5,
      controls: [
        TAKE_5,
        {
          items: [
            "Determine a safe route to access the area and identify a work area.",
            "Create an exclusion zone.",
          ],
        },
      ],
      riskAfter: 3,
      responsible: "All",
    },
    {
      activity: "Isolate the work area",
      equipment: [],
      hazards: ["Unauthorised access"],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Ensure a barrier or cordon is used to separate the work area from the public.",
            "Check that no equipment or materials can fall onto any pedestrians or vehicles.",
            "When work is complete, make sure all surfaces are cleaned and decontaminated correctly.",
            "When work is complete for the day, ensure all hazardous chemicals are locked away in a secure place.",
            "Ensure no one enters or works within the area without full suitable PPE being worn or used.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Operation - decontamination",
      equipment: [],
      hazards: [
        "Slips, trips and falls",
        "Fall from height",
        "Manual handling injuries",
        "Cuts and lacerations",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Critical issues",
          items: [
            "Decontamination is the process of removing or neutralising hazardous substances from people, equipment and the environment, to reduce further exposure and the spread of the contaminant to other areas or individuals.",
            "Ensure appropriate use, decontamination and disinfection of PPE and other resources and equipment.",
            "Follow containment and packaging procedures for samples, and disposal methods for infected material.",
            "Use the appropriate disinfectant for the suspected contamination.",
            "All disinfectants applied to skin must be safe for use on skin, registered for that purpose, and used in accordance with directions.",
            "Any disinfectants used must have inhalant risk assessments carried out, and the relevant Safety Data Sheets referred to.",
            "Resources taken into a contaminated area must only be those necessary to perform duties, or those that can be disinfected after use. Cameras and mobile phones can be placed in a zip-lock bag so the item can still be used without removal, and the container disinfected.",
            "Personnel must be trained in disinfection and decontamination procedures before visiting the site.",
          ],
        },
        {
          heading: "Decontamination on leaving the site",
          items: [
            "Set up the decontamination site before entering the property. Do not re-enter a vehicle or the clean area until decontamination is complete.",
            "Park all vehicles out of the contamination zone where possible. If this is not possible, investigate alternatives before the activity to minimise the risk of contamination or spread - for example, wash-down facilities on site.",
            "Plan drainage and disposal of contaminated wastewater and chemicals for each site.",
          ],
        },
        {
          heading: "Hygiene and disinfection",
          items: [
            "Select and set up a personal decontamination site in the clean area bordering the dirty area before entering the property. It must allow staff to exit without re-entering a contaminated or potentially contaminated area.",
            "Use a line to mark the clean area and the potentially contaminated area. Use a tarp in the clean area to place equipment on, positioned for entry, for use on the dirty side (including spare gloves and boot covers), and for use on exit.",
            "Ensure disinfectants and equipment for personal decontamination are ready for use before entering the contaminated area.",
            "Prepare a scrub tub of appropriate size and depth for personnel to stand in, filled with an approved cleaning solution diluted per the manufacturer's instructions, along with approved chemical spray bottles, brushes, wipes, and soap and water appropriate for skin.",
            "Some disinfectants pose inhalant risks, so appropriate risk assessments must also be carried out.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Personal protective equipment",
      equipment: [],
      hazards: [
        "Contamination",
        "Torn, punctured or perished protective clothing",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Appropriate use of PPE is critical to prevent the spread of contaminants between contaminated and non-contaminated sites. Procedures for decontamination, disinfection and disposal of PPE must be developed for the suspected contaminant, and personnel trained in their use.",
            "Disposable overalls and gloves should be worn when sampling infected material on site. Boot covers or cleanable rubber boots are advisable. Put on protective clothing in the clean area before entry.",
            "Some equipment, such as boot covers and disposable gloves, wears quickly, so it may be appropriate to wear two pairs and take a spare into the dirty area.",
            "PPE must be properly worn, with all hair covered and overalls, gloves and boot covers sealed or held in place with duct tape.",
            "Once sampling is complete, remove all contaminated items and clean or double bag them before leaving the decontamination site. When removing PPE, carefully roll gloves, overalls and boot covers back, turning them inside out.",
            "Double bag all disposable items - gloves, head covers, boot covers, overalls - and dispose of them per quarantine requirements. Decontaminate each bag after sealing.",
            "Footwear must be either removed and bagged, or thoroughly cleaned and disinfected before leaving the property.",
            "Scrub soil off the base of footwear before stepping into a disinfection bath containing an appropriate disinfectant.",
            "Disinfect hands and exposed areas, then wash hands, face and disinfected skin in clean water with detergent or soap.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Removal of contaminated PPE",
      equipment: [],
      hazards: [
        "Contamination",
        "Burns",
        "Vapours",
        "Flammable substances",
        "Chemicals",
        "Poisoning",
        "Slips, trips and falls",
        "Manual handling injuries",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Decontamination station equipment",
          items: [
            "Drop cloths of plastic or other suitable material on which heavily contaminated equipment and outer protective clothing may be deposited.",
            "Collection containers, such as drums or suitably lined bins, for storing disposable clothing and heavily contaminated protective clothing or equipment that must be discarded.",
            "A lined box with absorbents for wiping or rinsing off gross and liquid contaminants.",
            "Large galvanised tubs, stock tanks or wading pools to hold wash and rinse solutions, at least large enough for a worker to place a booted foot in, with either no drain or a drain connected to a collection tank or appropriate treatment system.",
            "Wash and rinse solutions selected to remove and reduce the hazards associated with the contaminants.",
            "Long-handled, soft-bristled brushes to help wash and rinse off contaminants.",
            "Paper or cloth towels for drying protective clothing and equipment.",
            "Lockers and cabinets for storage of decontaminated clothing and equipment.",
            "Metal or plastic cans or drums for contaminated wash and rinse solutions.",
            "Plastic sheeting, sealed pads with drains, or other appropriate methods for containing and collecting contaminated wash and rinse solutions spilled during decontamination.",
            "Shower facilities for full body wash or, at a minimum, personal wash sinks with drains connected to a collection tank or appropriate treatment system.",
            "Soap or wash solution, washcloths and towels for personnel.",
            "Lockers or closets for clean clothing and personal item storage.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    MANUAL_HANDLING,
    {
      ...CLEANING_AND_MAINTENANCE,
      controls: [
        {
          items: [
            "If damage to equipment is detected, do not use it until repairs have been carried out and it has been deemed safe for use.",
            "Refer to Safety Data Sheets for all hazardous chemicals used, identifying what precautions should be followed and what PPE is required.",
            "Ensure all cleaning equipment is cleaned, dried and stored correctly.",
            "Ensure all used protective PPE has been disposed of correctly.",
            "Hazardous chemicals must be stored in a secure location.",
          ],
        },
      ],
    },
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── Water extraction: shared closing rows ──────────────────────────────────

/** Machine-specific pack-down, identical in both water extraction documents. */
const EXTRACTION_CLEANING_AND_MAINTENANCE: SwmsRiskRow = {
  ...CLEANING_AND_MAINTENANCE,
  controls: [
    {
      items: [
        "Do not undertake any repairs or modifications unless you are trained and authorised to do so.",
        "Refer to Safety Data Sheets for all hazardous chemicals used, identifying what precautions should be followed and what PPE is required.",
        "Hazardous chemicals must be stored in a secure location.",
        "After each use, before storing the machine, remove all water from the solution and recovery tanks. Put a couple of litres of clean water into the solution tank and, using the pump only, press the lever of the solution valve to clean the internal parts of the pump, couplings and nozzles, removing detergent residues.",
        "After every use, store the machine in a cool, dry place with the cover open, to prevent humidity and mould forming inside the recovery tank and on the internal parts of the vacuum motor.",
        "Periodically clean the water filter by extracting it from the machine and rinsing it under running water.",
      ],
    },
  ],
};

/** Carpet steam cleaning. Identical in both water extraction documents. */
const CARPET_STEAM_CLEANING: SwmsRiskRow = {
  activity: "Carpet steam cleaning",
  equipment: [],
  hazards: [
    "Slips, trips and falls",
    "Manual handling injuries",
    "Electrical shock",
    "Burns",
  ],
  riskBefore: 4,
  controls: [
    {
      items: [
        "Run the hoses required through the premises to the rooms to be cleaned, keeping hoses out of major walkways and observing WHS procedures.",
        "Ensure wet floor signs are placed and no trip hazards are left in the way.",
        "Attach the large blue filter to the end of the extraction hose to ensure no contaminants are drawn through.",
        "Attach the pH chemical bottle head to the blue chemical line for pre-spray.",
        "Pull the choke on for the truck mount and turn the hot water pump switch on. Ensure the throttle is turned all the way off before starting the truck mount.",
        "Turn the ignition on to start the truck mount, then turn the choke off to allow airflow. Turn the throttle slowly anti-clockwise to prime the engine.",
        "Check the pressure gauge to confirm water flow and suction are working.",
        "Vacuum all areas to be steam cleaned using the carpet vacuum.",
        "Prepare the pH chemical required for the carpet depending on fibre type, and pre-spray all rooms to be steam cleaned.",
        "Ensure the hot box is attached to the chemical line running to the portable, if the steam clean is being completed with a portable steam cleaner.",
        "Steam clean all required rooms, observing safe work practices and WHS policy.",
        "Once the steam clean is complete, switch off the portable machine, unplug the hot box, and return the portable and hoses to the van.",
        "Return to the truck mount and power down the throttle by turning it clockwise.",
        "Turn the hot water pressure switch off and open the hot water valve on the truck mount to cool the machine down before switching off.",
        "Check the temperature gauge to ensure the machine is cool enough to be switched off without causing a backfire.",
        "Turn the ignition switch off, then turn the fuel line to the truck mount off.",
        "Roll up all hoses and remove the wet floor safety signs.",
      ],
    },
  ],
  riskAfter: 2,
  responsible: "All",
};

// ── 6. Water extraction - portable method ──────────────────────────────────

const WATER_EXTRACTION_PORTABLE: SwmsActivityTemplate = {
  id: "water-extraction-portable",
  title:
    "Water and Flood - Extraction of Water using Portable Method and Steam Cleaning Carpets",
  sourceRevision: "swmwafeowupmascc092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [
    "Portable extraction machine",
    "Extraction hoses",
    "Water claw head",
    "Furniture sliders",
    "Foam blocks",
    "Wet floor signs",
  ],
  ppe: ppe(
    "High visibility vest",
    "Eye protection",
    "Gloves",
    "Hard hat",
    "Safety footwear",
    "Appropriate clothing",
  ),
  trainingRequired: BASE_TRAINING,
  rows: [
    PLANNING_AND_PREPARATION,
    ARRIVE_AT_SITE,
    INDUCTION,
    ASSESSMENT_ELECTRICAL,
    ISOLATE_WET_WORK,
    {
      activity: "Remove portable extraction machine from vehicle",
      equipment: ["Portable extraction machine", "Extraction hoses"],
      hazards: ["Manual handling injuries"],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Remove the portable from the technician's van and, if possible, set it up outside the premises where the works are required.",
            "Remove the hoses required for extraction from the van.",
            "Connect the extraction hoses to the portable machine and run the hoses to the area where extraction is required, taking care not to damage any contents while moving hoses.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Operation - portable water extraction",
      equipment: ["Portable extraction machine", "Water claw head"],
      hazards: [
        "Slips, trips and falls",
        "Manual handling injuries",
        "Electrical shock",
      ],
      riskBefore: 4,
      controls: [
        {
          heading: "Set-up",
          items: [
            "Remove all content items required from the areas to be extracted, using furniture sliders and safe manual handling techniques.",
            "Plug the portable machine into a power outlet that is not in a high traffic area, to avoid trip hazards.",
            "Attach the extraction water claw head.",
          ],
        },
        {
          heading: "Electrical safety",
          items: [
            "The end of the suction hose and accessories must always be kept away from your face and the faces of others during operation - the suction created can damage eyes, ears or mouth.",
            "Do not use adapters or multiple sockets without knowing the electrical input of each user.",
            "Protect the electrical cable from water, tears and chemical agents. Do not repair a torn cable - replace it. The cable must be replaced by the manufacturer, its service agent, or a similarly qualified person.",
            "DO NOT pull the cable to drag the machine or to pull the plug out. Pull the plug out only when the machine is switched off.",
            "DO NOT handle the plug with wet hands, and unplug the cable before servicing the machine.",
            "DO NOT spray water near electrical outlets.",
            "DO NOT use the machine to spray or draw up corrosive liquids (acids or bases), or explosive or flammable liquids.",
          ],
        },
        {
          heading: "Extraction",
          items: [
            "Start extraction in the furthest corner of the room and place the claw on the ground. To confirm suction, check that the claw is hard to lift off the ground.",
            "Once suction is confirmed, move the water claw across the entire floor section requiring extraction until no further water flows through the claw.",
            "Check the level of water in the recovery tank so it does not get too high - water drawn into the motor causes electrical damage.",
            "If the machine leaks liquid, makes a strange noise or gets abnormally hot, switch it off immediately and have it serviced.",
          ],
        },
        {
          heading: "Pack-down",
          items: [
            "Once all areas have been extracted, switch off and remove the claw and extraction hose from the premises, taking care not to damage any items.",
            "Roll up all leads and hoses and remove wet floor signs and hazard tape from the required areas.",
            "Reinstate content items to the required area and ensure foam blocks are placed under the feet or base of furniture items.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    CARPET_STEAM_CLEANING,
    SLIPS_TRIPS_AND_FALLS,
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    EXTRACTION_CLEANING_AND_MAINTENANCE,
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── 7. Water extraction - truck-mounted unit ───────────────────────────────

const WATER_EXTRACTION_TRUCK_MOUNT: SwmsActivityTemplate = {
  id: "water-extraction-truck-mount",
  title:
    "Water and Flood - Extraction of Water using Truck Mounted Extraction Unit and Steam Cleaning Carpets",
  sourceRevision: "swmeowutmuascc092022sk",
  scope: STANDARD_SCOPE,
  hrcwCategoriesToAssess: [],
  requiredTools: [
    "Truck-mounted extraction unit",
    "Two-inch extraction hose",
    "Water claw head",
    "Metal lance spray head",
    "Furniture sliders",
    "Foam blocks",
    "Wet floor signs",
  ],
  ppe: ppe(
    "High visibility vest",
    "Eye protection",
    "Gloves",
    "Hard hat",
    "Safety footwear",
    "Appropriate clothing",
  ),
  trainingRequired: [
    ...BASE_TRAINING,
    "Truck-mounted extraction unit operation",
  ],
  rows: [
    PLANNING_AND_PREPARATION,
    {
      ...ARRIVE_AT_SITE,
      controls: [
        {
          items: [
            "Ensure the truck mount is fully fuelled and ready to be used.",
            "Park the truck mount where exhaust fumes cannot enter areas where works are being carried out.",
            "Park in a position that will allow safe access to your vehicle and reduce unnecessary manual handling.",
            "Ensure that your vehicle does not restrict traffic or pedestrian flow.",
            "Park off the street or in the customer's drive where permitted.",
            "Avoid parking on hills or steep drives.",
          ],
        },
      ],
    },
    INDUCTION,
    ASSESSMENT_ELECTRICAL,
    ISOLATE_WET_WORK,
    {
      activity: "Run hoses through the premises, keeping them out of walkways",
      equipment: ["Truck-mounted extraction unit", "Metal lance spray head"],
      hazards: [
        "Manual handling injuries",
        "Slips, trips and falls",
        "Electrocution",
        "Burns",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Attach the metal lance spray head to the blue chemical line for the hot water pressure wash.",
            "Pull the choke on for the truck mount and turn the hot water pump switch on.",
            "Ensure the throttle is turned all the way off before starting the truck mount.",
            "Turn the ignition on to start the truck mount, then turn the choke off to allow airflow through the unit.",
            "Turn the throttle slowly anti-clockwise to prime the engine.",
            "Check the pressure gauge to confirm water flow and suction are working.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    {
      activity: "Safe operation of the truck-mounted unit",
      equipment: ["Truck-mounted extraction unit"],
      hazards: [
        "Manual handling injuries",
        "Slips, trips and falls",
        "Electrocution",
        "Burns",
        "Carbon monoxide exposure",
        "Fire and explosion",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Read the operator's manual before starting this unit. Failure to adhere to the instructions could result in severe personal injury or death.",
            "Operate this unit and equipment only in a well-ventilated area. Exhaust fumes contain carbon monoxide, an odourless and deadly poison that can cause severe injury or death.",
            "DO NOT run this unit in an enclosed area, or where the exhaust may enter a building doorway, window, vent or other opening.",
            "Fuel is extremely flammable and its vapours can explode if ignited. Store fuel only in approved containers, in well-ventilated unoccupied buildings, away from sparks or flames. Never carry fuel or any flammable materials inside the vehicle.",
            "DO NOT operate the unit if fuel has spilled, and do not turn the ignition switch until the fuel has been cleaned up. Never use fuel for cleaning purposes.",
            "DO NOT place hands, feet, hair, clothing or any body part near rotating or moving parts.",
            "NEVER operate this unit without belt and safety guards. Avoid high-speed moving parts such as belts and pulleys while the unit is running.",
            "NEVER service this unit while it is running.",
            "Engine components will be extremely hot from operation. DO NOT touch these areas while the unit is running or shortly after it is shut off.",
            "Water under high pressure at high temperature can cause burns, severe personal injury or death. Shut down the unit, allow it to cool, and relieve the system of all pressure before removing caps, valves, plugs, fittings, filters or hardware.",
            "NEVER leave the vehicle engine running while the unit is in operation.",
            "DO NOT smoke around the machine.",
            "DO NOT operate this unit without the water supply on and attached - the water pump and other vital components can be seriously damaged if the unit is operated dry.",
            "Always keep your vehicle clean and orderly. Wands, tools and accessories must be securely stowed while driving.",
            "All high-pressure hoses must be rated at 3000 psi with a heat rating of at least 250 degrees Fahrenheit (121 degrees Celsius). Thermoplastic hoses do not meet this criterion and must never be used.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "Operator",
    },
    {
      activity: "Operation - truck-mounted water extraction",
      equipment: ["Truck-mounted extraction unit", "Water claw head"],
      hazards: [
        "Slips, trips and falls",
        "Manual handling injuries",
        "Electrical shock",
      ],
      riskBefore: 4,
      controls: [
        {
          items: [
            "Remove all content items required from the areas to be extracted using furniture sliders, and use safe manual handling techniques.",
            "Enter the premises and attach the water claw head to the two-inch extraction hose in areas where extraction is required.",
            "Start in the corner of the room where extraction is required and place the water claw on the ground.",
            "Confirm suction by trying to lift the claw off the ground - correct suction means the claw is hard to lift by hand.",
            "Before extracting, spray all areas to be cleaned using the hot water lance. Once sprayed, stand on the water claw for up to 30 seconds until no water is seen flowing through the claw.",
            "Once the first section is extracted, move the claw down to the bottom of where the top of the claw was and continue until the area has been fully extracted.",
            "Once all areas have been extracted, remove the hoses from the premises, taking care not to knock over any items or leave water behind.",
            "Return to the truck mount and power down the throttle by turning it clockwise until it will not turn further.",
            "Turn the hot water pressure switch off and open the hot water valve to cool the machine down before switching off.",
            "Check the temperature gauge to ensure the machine is cool enough to switch off without causing a backfire.",
            "Turn the ignition switch off, then turn the fuel line to the truck mount off.",
            "Roll up all hoses and remove the wet floor safety signs.",
            "Reinstate content items to the required area and ensure foam blocks are placed under the feet or base of furniture items.",
          ],
        },
      ],
      riskAfter: 2,
      responsible: "All",
    },
    CARPET_STEAM_CLEANING,
    SLIPS_TRIPS_AND_FALLS,
    MANUAL_HANDLING,
    USE_OF_POWER_TOOLS,
    EXTRACTION_CLEANING_AND_MAINTENANCE,
    EMERGENCY_PROCEDURES,
    LEAVING_THE_WORK_SITE,
  ],
};

// ── Registry ───────────────────────────────────────────────────────────────

export const SWMS_ACTIVITY_TEMPLATES: Readonly<
  Record<SwmsActivityId, SwmsActivityTemplate>
> = {
  "carpet-removal": CARPET_REMOVAL,
  "floor-removal": FLOOR_REMOVAL,
  "demolition-non-structural": DEMOLITION_NON_STRUCTURAL,
  "fire-smoke-cleaning": FIRE_SMOKE_CLEANING,
  decontamination: DECONTAMINATION,
  "water-extraction-portable": WATER_EXTRACTION_PORTABLE,
  "water-extraction-truck-mount": WATER_EXTRACTION_TRUCK_MOUNT,
};

/** Every activity id, in the order templates are listed to users. */
export const SWMS_ACTIVITY_IDS = Object.keys(
  SWMS_ACTIVITY_TEMPLATES,
) as SwmsActivityId[];

/**
 * Look up a template by id. Returns `null` for an unknown id.
 *
 * Uses `Object.hasOwn` rather than a plain index: ids reach this function from
 * a URL segment, and a bare lookup of `"__proto__"` or `"constructor"` returns
 * an inherited object instead of `undefined`. That would hand the caller a
 * truthy non-template whose `.rows` is `undefined`, failing at render time
 * rather than here.
 */
export function getSwmsActivityTemplate(
  id: string,
): SwmsActivityTemplate | null {
  if (!Object.hasOwn(SWMS_ACTIVITY_TEMPLATES, id)) return null;
  return SWMS_ACTIVITY_TEMPLATES[id as SwmsActivityId];
}
