/**
 * Fire and smoke make-safe walkthrough: sections, items and what Margot
 * says. Every item cites at least one entry in sources.ts, traced in
 * docs/research/fire-smoke-make-safe-research-pack.md.
 *
 * Wording here is our own plain-English paraphrase of what each step asks
 * the technician to check. No standards text is copied in: IICRC and
 * Standards Australia material is cited by title, edition and clause
 * area only, and never sent to any AI tool (spec §0, IICRC AI policy).
 *
 * Section ids are stable. Renaming or removing one after a walkthrough is
 * signed in production needs a checklistVersion bump (engineering.md,
 * migration).
 */

export interface FireCitation {
  source: string;
  pinpoint?: string;
}

export interface FireChecklistItem {
  id: string;
  /** What Margot asks, in our own words. Spoken aloud. */
  prompt: string;
  /** Entries in sources.ts, with the section or regulation where one applies. */
  cites: FireCitation[];
}

export interface FireChecklistSection {
  id: string;
  title: string;
  /** What Margot says when the section opens. Spoken aloud. */
  intro: string;
  /** Words that suggest an utterance belongs here (lower case). */
  keywords: string[];
  items: FireChecklistItem[];
}

export const FIRE_CHECKLIST: readonly FireChecklistSection[] = [
  {
    id: "site_access",
    title: "Arrival and site access",
    intro:
      "Let's start at the front. Tell me who let you in, whether police or fire services have released the site, and whether it is still a crime scene.",
    keywords: [
      "arrived", "arrival", "access", "key", "keys", "let me in", "police",
      "fire brigade", "fire services", "fire rescue", "released", "crime scene",
      "tape", "cordon", "investigator", "owner", "occupant met", "lockbox",
    ],
    items: [
      {
        id: "site_released",
        prompt:
          "Before you go in: has the site been released to the owner or insurer, and by whom? If police or fire investigators still hold it, do not enter.",
        cites: [{ source: "S37" }, { source: "S08", pinpoint: "s26" }],
      },
      {
        id: "authority_to_enter",
        prompt:
          "Who gave you authority to enter, and how did you get access?",
        cites: [{ source: "S38", pinpoint: "Part 5" }, { source: "S08", pinpoint: "s26" }],
      },
    ],
  },
  {
    id: "safety_brief",
    title: "Safety brief and PPE",
    intro:
      "Now the safety brief. Tell me the hazards you can see and the protective gear you and the crew are wearing.",
    keywords: [
      "safety brief", "safety", "hazard", "hazards", "ppe", "respirator", "p2",
      "p3", "mask", "gloves", "boots", "hard hat", "helmet", "goggles",
      "coveralls", "tyvek", "swms", "risk assessment", "toolbox", "first aid",
      "fit test", "trip", "slip", "sharp", "glass",
    ],
    items: [
      {
        id: "hazards_identified",
        prompt:
          "What hazards did you find on the walk-in before starting work?",
        cites: [{ source: "S08", pinpoint: "s20, s21" }, { source: "S09", pinpoint: "r325" }],
      },
      {
        id: "swms_reviewed",
        prompt:
          "Will any work today be high-risk construction work, such as demolition, disturbing asbestos, work near live electrics or pressurised gas lines, propping up the structure, or a fall risk of more than 2 metres? If so, has a safe work method statement been prepared and gone through with the crew before that work starts?",
        cites: [{ source: "S09", pinpoint: "r322, r327" }],
      },
      {
        id: "ppe_in_use",
        prompt:
          "What protective gear is in use: respirator type, coveralls, gloves, boots and eye protection?",
        cites: [{ source: "S09", pinpoint: "r163, r307" }],
      },
      {
        id: "other_risks",
        prompt:
          "Any work at height, ladders, roof or under-floor spaces, or heavy lifting? Is there a first aid kit and a trained first aider on site?",
        cites: [{ source: "S09", pinpoint: "r43 to r45, r55, r56" }, { source: "S26" }, { source: "S27" }],
      },
      {
        id: "incident_notification",
        prompt:
          "Has anyone been hurt, or has anything dangerous happened on site? If it may be a notifiable incident, for example a death, a serious injury or a dangerous occurrence, WorkSafe must be told straight away on 13 23 60, and the scene left as it is unless you need to make it safe or help someone.",
        cites: [{ source: "S08", pinpoint: "s37, s38, s39" }],
      },
    ],
  },
  {
    id: "structure",
    title: "Structural condition",
    intro:
      "Tell me about the structure. Any sagging ceilings, burnt floor joists, cracked walls, or areas nobody should walk into?",
    keywords: [
      "structure", "structural", "ceiling", "sagging", "collapse", "collapsed",
      "joist", "joists", "beam", "rafter", "roof", "floor", "subfloor", "wall",
      "crack", "cracked", "charred", "charring", "bearer", "frame", "stairs",
      "unsafe", "engineer", "no-go", "no go",
    ],
    items: [
      {
        id: "structural_assessment",
        prompt:
          "Walk the outside first. Any sagging roof, cracked or leaning walls, burnt joists or stairs? Which areas are unsafe to enter?",
        cites: [{ source: "S09", pinpoint: "r322(e)" }, { source: "S32" }, { source: "S07" }],
      },
      {
        id: "building_orders",
        prompt:
          "Has council issued an emergency order, an order to vacate or a building notice? Note any notice posted on the property.",
        cites: [{ source: "S10", pinpoint: "s102, s103, s106" }],
      },
    ],
  },
  {
    id: "services",
    title: "Electricity, gas and water",
    intro:
      "Next, the services. Tell me the state of the power, the gas and the water supply.",
    keywords: [
      "power", "electricity", "electrical", "switchboard", "meter", "isolated",
      "isolation", "disconnected", "electrician", "gas", "gas meter", "gas leak",
      "plumber", "water", "mains", "tap", "stopcock", "turned off", "smoke alarm",
      "lockout", "tag out", "tagged",
    ],
    items: [
      {
        id: "electrical_isolated",
        prompt:
          "Treat all wiring as live. Is the power isolated, and will a licensed electrician check it before it goes back on?",
        cites: [{ source: "S34" }, { source: "S36" }, { source: "S09", pinpoint: "r322(l)" }],
      },
      {
        id: "gas_isolated",
        prompt:
          "Is the gas off at the meter or the LPG cylinder closed? Will a licensed gasfitter check it before it is turned back on?",
        cites: [{ source: "S35" }, { source: "S09", pinpoint: "r322(j)" }, { source: "S33" }],
      },
      {
        id: "water_status",
        prompt:
          "Is the water supply on or off, and is anything still leaking?",
        cites: [{ source: "S04" }, { source: "S37" }],
      },
    ],
  },
  {
    id: "asbestos_hazmat",
    title: "Asbestos and hazardous materials",
    intro:
      "Now asbestos and hazardous materials. Tell me how old the building is and whether you suspect asbestos or other hazardous material in the fire debris.",
    keywords: [
      "asbestos", "fibro", "acm", "hazmat", "hazardous", "lead", "lead paint",
      "chemical", "chemicals", "built in", "built before", "1990", "1980",
      "1970", "eaves", "sample", "hygienist", "licensed removalist",
      "register", "debris", "ash", "soot",
    ],
    items: [
      {
        id: "building_age",
        prompt:
          "Roughly when was the building built? Homes built before 1990 often contain asbestos, so assume it is there until tested.",
        cites: [{ source: "S09", pinpoint: "r304" }, { source: "S24" }],
      },
      {
        id: "suspected_acm",
        prompt:
          "Do you suspect asbestos in damaged areas or debris? Do not cut, break or sweep it. Has a competent person been arranged to sample it and judge its condition? If fire-damaged asbestos is friable, may become friable, or its condition cannot be judged, only a Class A licensed removalist may remove it; where it is confirmed non-friable, a Class B licence holder can.",
        cites: [{ source: "S09", pinpoint: "r304 to r307, r264, r265" }, { source: "S32" }, { source: "S40" }],
      },
      {
        id: "other_chemicals",
        prompt:
          "Any other chemical hazards: burnt plastics, stored chemicals, fuel, or old paint that may contain lead?",
        cites: [{ source: "S09", pinpoint: "r163, Part 4.3" }, { source: "S29" }],
      },
    ],
  },
  {
    id: "secure_property",
    title: "Securing the property",
    intro:
      "Let's cover securing the property. Tell me about broken windows, doors, the roof, and any fencing or boarding up.",
    keywords: [
      "secure", "secured", "security", "board", "boarded", "board up",
      "boarding", "window", "windows", "door", "doors", "lock", "locked",
      "fence", "fencing", "tarp", "tarped", "roof", "temporary", "make safe",
      "make-safe", "break in", "trespass", "vandal",
    ],
    items: [
      {
        id: "openings_secured",
        prompt:
          "Which openings did you secure, and how? Windows, doors, and holes in the roof or walls. Photograph before and after.",
        cites: [{ source: "S37" }, { source: "S08", pinpoint: "s23" }],
      },
      {
        id: "weather_and_fencing",
        prompt:
          "Is the building protected from rain, and does the site need temporary fencing to keep the public out?",
        cites: [{ source: "S37" }, { source: "S08", pinpoint: "s23" }],
      },
    ],
  },
  {
    id: "water_moisture",
    title: "Firefighting water and moisture",
    intro:
      "Now water from firefighting. Tell me where the water went and any moisture readings you have taken.",
    keywords: [
      "water", "wet", "damp", "moisture", "reading", "readings", "meter",
      "hose", "firefighting water", "pooling", "pooled", "soaked", "saturated",
      "carpet wet", "subfloor wet", "dehumidifier", "drying", "mould", "mold",
      "musty",
    ],
    items: [
      {
        id: "water_extent",
        prompt:
          "Where did firefighting water reach, and is any of it still standing?",
        cites: [{ source: "S04" }],
      },
      {
        id: "moisture_readings",
        prompt:
          "What moisture readings did you take, and where?",
        cites: [{ source: "S04" }],
      },
      {
        id: "mould_signs",
        prompt:
          "It may be weeks since the fire. Any visible mould or musty smell, and where?",
        cites: [{ source: "S05" }],
      },
    ],
  },
  {
    id: "fire_damage",
    title: "Fire, smoke and soot damage",
    intro:
      "Now the fire and smoke damage itself. Walk me through each room: what burned, where the soot is, and how strong the smell is.",
    keywords: [
      "fire", "burnt", "burned", "burn", "smoke", "soot", "residue", "char",
      "odour", "odor", "smell", "room", "kitchen", "lounge", "bedroom",
      "hallway", "garage", "downstairs", "upstairs", "wet smoke", "dry smoke",
      "protein", "staining", "heat damage", "melted",
    ],
    items: [
      {
        id: "origin_and_extent",
        prompt:
          "Which rooms were burned, and which only have smoke or soot?",
        cites: [{ source: "S01" }],
      },
      {
        id: "residue_type",
        prompt:
          "What residue do you see: dry powdery soot, sticky wet smoke, or a film from cooking?",
        cites: [{ source: "S01" }],
      },
      {
        id: "odour_level",
        prompt:
          "How strong is the smoke smell, and where is it worst?",
        cites: [{ source: "S01" }],
      },
    ],
  },
  {
    id: "contents",
    title: "Contents",
    intro:
      "Now the contents. Tell me what can be saved, what is a total loss, and what needs to come out today.",
    keywords: [
      "contents", "furniture", "belongings", "clothes", "clothing",
      "appliance", "appliances", "electronics", "salvage", "salvageable",
      "total loss", "write off", "pack out", "pack-out", "inventory", "photos of",
      "sentimental", "documents", "valuables", "fridge", "food",
    ],
    items: [
      {
        id: "contents_triage",
        prompt:
          "Which contents look salvageable and which look like a total loss? Nothing goes out before it is listed and photographed.",
        cites: [{ source: "S37" }, { source: "S01" }],
      },
      {
        id: "high_value_items",
        prompt:
          "Any valuables, documents or sentimental items the owner asked you to protect first?",
        cites: [{ source: "S37" }],
      },
    ],
  },
  {
    id: "evidence",
    title: "Photos and evidence",
    intro:
      "Now evidence. Tell me what photos and video you have taken, and whether anything must not be disturbed.",
    keywords: [
      "photo", "photos", "picture", "pictures", "video", "evidence",
      "documented", "documentation", "recorded", "captured", "wide shot",
      "close up", "do not disturb", "preserve", "preserved", "insurer asked",
      "loss adjuster wants",
    ],
    items: [
      {
        id: "photos_taken",
        prompt:
          "Have you photographed every affected room, the hazards, and what you made safe?",
        cites: [{ source: "S37" }, { source: "S08", pinpoint: "s22" }],
      },
      {
        id: "recording_consent",
        prompt:
          "Before recording audio or video with people present, did you tell them and get their consent?",
        cites: [{ source: "S11", pinpoint: "s6, s11" }, { source: "S39", pinpoint: "APP 3, APP 5" }],
      },
      {
        id: "preserve_evidence",
        prompt:
          "Has anyone asked you to preserve anything for an investigation? What did you leave untouched?",
        cites: [{ source: "S08", pinpoint: "s39" }, { source: "S37" }],
      },
    ],
  },
  {
    id: "occupant_insurer",
    title: "Occupants, insurer and next steps",
    intro:
      "Last section. Tell me who you spoke to: the occupants, the insurer or loss adjuster, and what was agreed for next steps.",
    keywords: [
      "occupant", "occupants", "owner", "tenant", "family", "insurer",
      "insurance", "adjuster", "loss adjuster", "claim number", "approved",
      "authorised", "authorized", "next steps", "follow up", "return",
      "come back", "quote", "scope", "accommodation", "relocated",
    ],
    items: [
      {
        id: "identified_to_occupant",
        prompt:
          "Did you tell the occupant who you are, who you work for, and that you act for the insurer?",
        cites: [{ source: "S38", pinpoint: "Part 5" }],
      },
      {
        id: "occupants_informed",
        prompt:
          "Have the occupants been told what is safe, where they must not go, and whether they can stay?",
        cites: [{ source: "S08", pinpoint: "s23" }],
      },
      {
        id: "insurer_contact",
        prompt:
          "Has the insurer or loss adjuster been told, and what did they authorise?",
        cites: [{ source: "S38", pinpoint: "Part 8" }],
      },
    ],
  },
];

export const FIRE_SECTION_IDS: readonly string[] = FIRE_CHECKLIST.map((s) => s.id);

export function getFireSection(id: string): FireChecklistSection | undefined {
  return FIRE_CHECKLIST.find((s) => s.id === id);
}

export function isFireSectionId(id: string): boolean {
  return FIRE_SECTION_IDS.includes(id);
}
