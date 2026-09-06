/**
 * Incident notification and site preservation.
 *
 * WHY THIS DOMAIN EXISTS AT ALL. Until now this knowledge lived as literals in
 * lib/compliance/safework-notification-gate.ts: nine regulator names, and a
 * notification deadline of `inspectionDate + 24 hours` carried by a comment
 * reading "per WHS Act".
 *
 * THAT DEADLINE WAS WRONG TWICE OVER, and this file exists because of it.
 *
 *   1. NEITHER COUNTRY GIVES YOU 24 HOURS. Australia's duty is to notify
 *      IMMEDIATELY; New Zealand's is AS SOON AS POSSIBLE. The only "48 hours"
 *      anywhere in the WHS Act is for a WRITTEN follow-up, and only where the
 *      regulator asks for one. The figure 24 appears in neither Act.
 *   2. THE CLOCK STARTED FROM THE WRONG EVENT. The duty runs from the moment the
 *      business becomes aware of the incident, not from the inspection date. An
 *      incident found a week after the inspection was handed a deadline already
 *      in the past.
 *
 * A restoration contractor who trusted that screen could have missed a statutory
 * duty while believing they had a day in hand. A regulatory number with no
 * source is not a small problem, and this is the clearest example the codebase
 * has produced.
 *
 * SCOPE, HONESTLY STATED. These four entries carry the DUTY. They do not carry
 * the list of what counts as notifiable -- that is long, differs between the two
 * countries, and is a judgement about facts that belongs with a person rather
 * than a lookup. The requirement text names the categories and points at the
 * regulator; it does not attempt to decide a case.
 */
import type { RegulatoryEntry } from "./types";

export const WHS_ENTRIES: RegulatoryEntry[] = [
  {
    id: "whs.notifiable-incident-duty.au",
    domain: "whs",
    jurisdiction: "AU",
    instrument: "Work Health and Safety Act 2011 (model)",
    provision: "Sections 35 to 38",
    // The model Act's commencement, at the precision established. Each state
    // and territory enacts its own version on its own date, which is why this
    // is the model and the requirement says so.
    effectiveFrom: "2011",
    requirement:
      "Notify the work health and safety regulator IMMEDIATELY after becoming aware that a notifiable incident has happened, by the fastest means available -- telephone or the regulator's online form. A notifiable incident is the death of a person, a serious injury or illness, or a dangerous incident, arising out of the conduct of the business or undertaking. THERE IS NO GRACE PERIOD: the duty is immediate, and it runs from the moment the business becomes aware, which is generally when a supervisor or manager learns of it, not from the date of any inspection or report. Written notice is required within 48 hours only where the regulator asks for it, and that is a follow-up to the immediate notification rather than an alternative to it. This is the model Act; each state and territory enacts its own version, so confirm the position and the reporting channel with the regulator for the job's state. Safe Work Australia published amendments in 2025 extending notification to further categories, including work-related suicide and attempted suicide, violent incidents, certain dangerous incidents involving mobile plant and falls, and extended worker absences; commencement of those amendments varies by jurisdiction and Safe Work Australia's own guidance is to check with your regulator before relying on them.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/incident-notification",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
  },
  {
    id: "whs.notifiable-incident-duty.nz",
    domain: "whs",
    jurisdiction: "NZ",
    instrument: "Health and Safety at Work Act 2015",
    provision: "Sections 25 and 56",
    effectiveFrom: "2015",
    requirement:
      "Notify WorkSafe New Zealand AS SOON AS POSSIBLE after becoming aware that a notifiable event has happened, by the fastest way possible in the circumstances. A notifiable event is the death of a person, a notifiable injury or illness, or a notifiable incident, arising from the conduct of the business or undertaking. Notification is required EVEN IF EMERGENCY SERVICES ATTEND -- their attendance is not notification. Only one notification is required for each event. Keep records of the notifiable event for at least five years from the date WorkSafe was notified. As in Australia, the duty runs from becoming aware of the event and there is no grace period.",
    sourceUrl: "https://www.worksafe.govt.nz/notifications/what-events-need-to-be-notified/",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
  },
  {
    id: "whs.incident-site-preservation.au",
    domain: "whs",
    jurisdiction: "AU",
    instrument: "Work Health and Safety Act 2011 (model)",
    provision: "Section 39",
    effectiveFrom: "2011",
    requirement:
      "Do not disturb the site of a notifiable incident until an inspector arrives or directs otherwise, whichever happens first. The duty falls on the person with management or control of the workplace, so far as is reasonably practicable, and covers any plant, substance, structure or thing associated with the incident. FOUR THINGS ARE ALWAYS PERMITTED and are not breaches: helping an injured person, removing a deceased person, making the site safe or removing the risk of a further notifiable incident, and assisting a police investigation. The duty applies to the area where the incident happened, not to the whole workplace. An inspector may issue a non-disturbance notice for a stated period of up to seven days. Where preservation is impractical, ask the regulator rather than deciding alone -- and record what was disturbed and why.",
    sourceUrl:
      "https://www.safeworkaustralia.gov.au/sites/default/files/2022-09/Incident-notification-fact-sheet-2015%20UD.PDF",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
  },
  {
    id: "whs.incident-site-preservation.nz",
    domain: "whs",
    jurisdiction: "NZ",
    instrument: "Health and Safety at Work Act 2015",
    provision: "Section 55",
    effectiveFrom: "2015",
    requirement:
      "Take all reasonable steps to ensure the site of a notifiable event is not disturbed until an inspector gives permission for normal work to resume. The duty falls on the business that manages or controls the workplace. As in Australia, steps taken to help an injured person, to make the site safe, or to assist emergency services are not a breach of it. Record what was disturbed and the reason.",
    sourceUrl: "https://www.worksafe.govt.nz/notifications/what-events-need-to-be-notified/",
    verifiedAt: "2026-09-02",
    verification: "primary-source",
  },
];
